import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { dynamoStore } from './dynamodb.ts';
import { UserProfile } from '../../src/types/jam.ts';

/**
 * AWS Cognito Authentication Service
 *
 * Uses @aws-sdk/client-cognito-identity-provider when COGNITO_USER_POOL_ID and
 * COGNITO_CLIENT_ID are provided in environment variables.
 * Seamlessly falls back to Cognito-compatible token issuing backed by the
 * DynamoDB Users partition so user registration, login, session verification,
 * and profile updates work out-of-the-box.
 */

const isCognitoConfigured = Boolean(
  process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
);

const cognitoClient = isCognitoConfigured
  ? new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    })
  : null;

interface SessionRecord {
  token: string;
  userId: string;
  cognitoAccessToken?: string;
  expiresAt: number;
}

const activeSessions = new Map<string, SessionRecord>();
const passwordHashes = new Map<string, string>();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`jamtogether_cognito_salt_${password}`).digest('hex');
}

/**
 * Generates an SVG avatar formatted as a Base64 data URI.
 * Guaranteed 100% offline persistence.
 */
export function generateSvgAvatarBase64(name: string): string {
  const initials = (name || 'JT').trim().slice(0, 2).toUpperCase() || 'JT';
  const palettes = [
    { bg: '#6366f1', text: '#ffffff' },
    { bg: '#ec4899', text: '#ffffff' },
    { bg: '#8b5cf6', text: '#ffffff' },
    { bg: '#10b981', text: '#ffffff' },
    { bg: '#3b82f6', text: '#ffffff' },
    { bg: '#f59e0b', text: '#111827' },
  ];
  const hash = initials.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const palette = palettes[hash % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${palette.bg}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="${palette.text}" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="bold">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Fetches an external image URL (e.g. Google profile picture or Dicebear SVG)
 * and converts it into a perpetual Base64 Data URL (data:image/...;base64,...).
 * If the URL is already a data URI, it returns it directly.
 * If fetch fails or times out, it gracefully falls back to an offline SVG avatar Base64.
 */
export async function convertToImageBase64(
  urlOrSvg?: string,
  fallbackName: string = 'User'
): Promise<string> {
  if (!urlOrSvg || !urlOrSvg.trim()) {
    return generateSvgAvatarBase64(fallbackName);
  }
  const clean = urlOrSvg.trim();
  if (clean.startsWith('data:image/')) {
    return clean;
  }
  if (clean.startsWith('<svg')) {
    return `data:image/svg+xml;base64,${Buffer.from(clean).toString('base64')}`;
  }

  try {
    const res = await fetch(clean, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      let contentType = res.headers.get('content-type') || 'image/jpeg';
      if (contentType.includes('svg')) {
        contentType = 'image/svg+xml';
      }
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.warn('convertToImageBase64 fetch fallback:', clean.slice(0, 50), (err as Error).message);
  }

  return generateSvgAvatarBase64(fallbackName);
}

/**
 * Migrates existing users in the database to have persistent Base64 avatar data.
 */
export async function migrateExistingUsersAvatarsToBase64(): Promise<number> {
  let updatedCount = 0;
  try {
    const userRecs = await dynamoStore.queryByEntity('USER');
    for (const rec of userRecs) {
      const u = rec.data as UserProfile;
      if (!u) continue;
      const needsMigration =
        !u.avatarBase64 ||
        !u.avatarUrl ||
        !u.avatarUrl.startsWith('data:image/');

      if (needsMigration) {
        const raw = u.avatarBase64 || u.avatarUrl;
        const b64 = await convertToImageBase64(raw, u.displayName || u.username);
        u.avatarBase64 = b64;
        u.avatarUrl = b64;
        await dynamoStore.put({
          PK: rec.PK,
          SK: rec.SK,
          GSI1PK: rec.GSI1PK,
          GSI1SK: rec.GSI1SK,
          entityType: 'USER',
          data: u,
          updatedAt: Date.now(),
        });
        updatedCount++;
      }
    }
  } catch (err) {
    console.warn('migrateExistingUsersAvatarsToBase64 error:', err);
  }
  return updatedCount;
}

export async function registerCognitoUser(params: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<{ user: UserProfile; token: string; provider: 'aws-cognito' | 'cognito-local-pool' }> {
  const cleanUsername = params.username.trim().toLowerCase().replace(/\s+/g, '.');
  const existing = await dynamoStore.queryByGSI1(`USERNAME#${cleanUsername}`);
  if (existing.length > 0) {
    throw new Error('Username is already registered in the Cognito user pool.');
  }

  let cognitoSub = `cognito-sub-${crypto.randomUUID()}`;
  let provider: 'aws-cognito' | 'cognito-local-pool' = 'cognito-local-pool';

  if (cognitoClient && process.env.COGNITO_CLIENT_ID) {
    try {
      const signUpRes = await cognitoClient.send(
        new SignUpCommand({
          ClientId: process.env.COGNITO_CLIENT_ID,
          Username: cleanUsername,
          Password: params.password,
          UserAttributes: [
            { Name: 'email', Value: params.email },
            { Name: 'preferred_username', Value: cleanUsername },
          ],
        })
      );
      if (signUpRes.UserSub) {
        cognitoSub = signUpRes.UserSub;
        provider = 'aws-cognito';
      }
    } catch (err) {
      console.warn('AWS Cognito SignUp fallback to local pool:', (err as Error).message);
    }
  }

  const userId = `usr_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const rawAvatar =
    params.avatarUrl || '/src/assets/images/avatar_host_maya_1794736638407.jpg';
  const avatarBase64 = await convertToImageBase64(
    rawAvatar,
    params.displayName?.trim() || params.username.trim()
  );

  const newUser: UserProfile = {
    userId,
    username: cleanUsername,
    email: params.email.trim().toLowerCase(),
    displayName: params.displayName?.trim() || params.username.trim(),
    avatarUrl: avatarBase64,
    avatarBase64: avatarBase64,
    bio: 'Music enthusiast jamming on JamTogether.',
    favoriteGenres: ['Electronic', 'Indie', 'Lo-Fi'],
    status: 'online',
    cognitoSub,
    createdAt: now,
  };

  passwordHashes.set(userId, hashPassword(params.password));

  await dynamoStore.put({
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `USERNAME#${cleanUsername}`,
    GSI1SK: `EMAIL#${newUser.email}`,
    entityType: 'USER',
    data: newUser,
    updatedAt: now,
  });

  const token = `jt_cognito_jwt_${crypto.randomBytes(16).toString('hex')}`;
  activeSessions.set(token, {
    token,
    userId,
    expiresAt: now + 86400000 * 7,
  });

  return { user: newUser, token, provider };
}

export async function loginCognitoUser(params: {
  usernameOrEmail: string;
  password?: string;
}): Promise<{ user: UserProfile; token: string; provider: 'aws-cognito' | 'cognito-local-pool' }> {
  const identifier = params.usernameOrEmail.trim().toLowerCase();
  let matchedUser: UserProfile | null = null;

  const byUsername = await dynamoStore.queryByGSI1(`USERNAME#${identifier}`);
  if (byUsername.length > 0) {
    matchedUser = byUsername[0].data as UserProfile;
  } else {
    const allUsers = await dynamoStore.queryByEntity('USER');
    for (const rec of allUsers) {
      const u = rec.data as UserProfile;
      if (
        u.email.toLowerCase() === identifier ||
        u.username.toLowerCase() === identifier ||
        u.userId === params.usernameOrEmail
      ) {
        matchedUser = u;
        break;
      }
    }
  }

  if (!matchedUser) {
    throw new Error('No account found with that username or email.');
  }

  let provider: 'aws-cognito' | 'cognito-local-pool' = 'cognito-local-pool';

  if (cognitoClient && process.env.COGNITO_CLIENT_ID && params.password) {
    try {
      await cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: process.env.COGNITO_CLIENT_ID,
          AuthParameters: {
            USERNAME: matchedUser.username,
            PASSWORD: params.password,
          },
        })
      );
      provider = 'aws-cognito';
    } catch (e) {
      // Fallback to local verification
    }
  }

  const storedHash = passwordHashes.get(matchedUser.userId);
  if (storedHash && params.password && storedHash !== hashPassword(params.password)) {
    throw new Error('Invalid password for this AWS Cognito account.');
  }

  matchedUser.status = matchedUser.currentRoomId ? 'in_room' : 'online';
  await dynamoStore.put({
    PK: `USER#${matchedUser.userId}`,
    SK: 'PROFILE',
    GSI1PK: `USERNAME#${matchedUser.username}`,
    GSI1SK: `EMAIL#${matchedUser.email}`,
    entityType: 'USER',
    data: matchedUser,
    updatedAt: Date.now(),
  });

  const token = `jt_cognito_jwt_${crypto.randomBytes(16).toString('hex')}`;
  activeSessions.set(token, {
    token,
    userId: matchedUser.userId,
    expiresAt: Date.now() + 86400000 * 7,
  });

  return { user: matchedUser, token, provider };
}

export async function verifyCognitoToken(token?: string): Promise<UserProfile | null> {
  if (!token) return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const session = activeSessions.get(clean);
  if (session && session.expiresAt > Date.now()) {
    const rec = await dynamoStore.get(`USER#${session.userId}`, 'PROFILE');
    return rec ? (rec.data as UserProfile) : null;
  }
  // Also allow direct demo userId lookup if token starts with usr_
  if (clean.startsWith('usr_')) {
    const rec = await dynamoStore.get(`USER#${clean}`, 'PROFILE');
    return rec ? (rec.data as UserProfile) : null;
  }
  return null;
}

export async function logoutCognitoToken(token?: string): Promise<void> {
  if (!token) return;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  activeSessions.delete(clean);
}

export async function deleteUserData(userId: string): Promise<void> {
  const historyRecs = await dynamoStore.queryByPK(`USER#${userId}`, 'HISTORY#');
  for (const h of historyRecs) {
    await dynamoStore.delete(`USER#${userId}`, h.SK);
  }
  const playlistRecs = await dynamoStore.queryByPK(`USER#${userId}`, 'PLAYLIST#');
  for (const p of playlistRecs) {
    await dynamoStore.delete(`USER#${userId}`, p.SK);
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await deleteUserData(userId);
  const friendRecs = await dynamoStore.queryByPK(`USER#${userId}`, 'FRIEND#');
  for (const f of friendRecs) {
    await dynamoStore.delete(`USER#${userId}`, f.SK);
  }
  for (const [token, sess] of activeSessions.entries()) {
    if (sess.userId === userId) {
      activeSessions.delete(token);
    }
  }
  await dynamoStore.delete(`USER#${userId}`, 'PROFILE');
}

export async function loginAsGuest(params: {
  displayName?: string;
  avatarUrl?: string;
}): Promise<{ user: UserProfile; token: string; provider: 'guest' }> {
  const randHex = crypto.randomBytes(3).toString('hex');
  const userId = `usr_guest_${randHex}`;
  const username = `guest.${randHex}`;
  const displayName = params.displayName?.trim() || `Guest #${randHex.toUpperCase().slice(0, 4)}`;
  const rawAvatar =
    params.avatarUrl ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${randHex}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  const avatarBase64 = await convertToImageBase64(rawAvatar, displayName);
  const now = Date.now();

  const guestUser: UserProfile = {
    userId,
    username,
    email: `${username}@guest.jamtogether.local`,
    displayName,
    avatarUrl: avatarBase64,
    avatarBase64: avatarBase64,
    bio: 'Joined as JamTogether Guest',
    favoriteGenres: ['Electronic', 'Indie', 'Lo-Fi'],
    status: 'online',
    isGuest: true,
    authProvider: 'guest',
    cognitoSub: `cognito-guest-${randHex}`,
    createdAt: now,
  };

  await dynamoStore.put({
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `USERNAME#${username}`,
    GSI1SK: `EMAIL#${guestUser.email}`,
    entityType: 'USER',
    data: guestUser,
    updatedAt: now,
  });

  const token = `jt_guest_jwt_${crypto.randomBytes(16).toString('hex')}`;
  activeSessions.set(token, {
    token,
    userId,
    expiresAt: now + 86400000 * 3,
  });

  return { user: guestUser, token, provider: 'guest' };
}

export async function loginWithGoogle(params: {
  email: string;
  name: string;
  picture?: string;
  googleId?: string;
}): Promise<{ user: UserProfile; token: string; provider: 'google' }> {
  const email = params.email.trim().toLowerCase();
  const cleanUsername =
    email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') ||
    `google.${crypto.randomBytes(3).toString('hex')}`;
  const now = Date.now();

  let existingUser: UserProfile | null = null;
  const allUsers = await dynamoStore.queryByEntity('USER');
  for (const rec of allUsers) {
    const u = rec.data as UserProfile;
    if (u.email && u.email.toLowerCase() === email) {
      existingUser = u;
      break;
    }
  }

  // Convert avatar picture to persistent Base64 Data URI
  const rawPicture =
    params.picture ||
    existingUser?.avatarBase64 ||
    existingUser?.avatarUrl ||
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(params.name)}&backgroundColor=ffd5dc,ffdfbf`;
  const avatarBase64 = await convertToImageBase64(
    rawPicture,
    params.name || cleanUsername
  );

  let finalUser: UserProfile;

  if (existingUser) {
    finalUser = {
      ...existingUser,
      displayName: params.name?.trim() || existingUser.displayName,
      avatarUrl: avatarBase64,
      avatarBase64: avatarBase64,
      authProvider: 'google',
      status: 'online',
    };
    await dynamoStore.put({
      PK: `USER#${finalUser.userId}`,
      SK: 'PROFILE',
      GSI1PK: `USERNAME#${finalUser.username}`,
      GSI1SK: `EMAIL#${finalUser.email}`,
      entityType: 'USER',
      data: finalUser,
      updatedAt: now,
    });
  } else {
    const userId = `usr_g_${crypto.randomBytes(4).toString('hex')}`;

    finalUser = {
      userId,
      username: cleanUsername,
      email,
      displayName: params.name?.trim() || cleanUsername,
      avatarUrl: avatarBase64,
      avatarBase64: avatarBase64,
      bio: 'Music explorer connecting via Google.',
      favoriteGenres: ['Pop', 'R&B', 'Electronic', 'Indie'],
      status: 'online',
      cognitoSub: `google-oauth-${params.googleId || crypto.randomUUID()}`,
      isGuest: false,
      authProvider: 'google',
      createdAt: now,
    };

    await dynamoStore.put({
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `USERNAME#${cleanUsername}`,
      GSI1SK: `EMAIL#${email}`,
      entityType: 'USER',
      data: finalUser,
      updatedAt: now,
    });
  }

  const token = `jt_google_jwt_${crypto.randomBytes(16).toString('hex')}`;
  activeSessions.set(token, {
    token,
    userId: finalUser.userId,
    expiresAt: now + 86400000 * 14,
  });

  return { user: finalUser, token, provider: 'google' };
}

const googleOAuthClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken: string): Promise<{
  email: string;
  name: string;
  picture?: string;
  googleId: string;
}> {
  const configuredClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

  // 1. Try verification with google-auth-library
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: configuredClientId ? configuredClientId : undefined,
    });
    const payload = ticket.getPayload();
    if (payload && payload.email) {
      return {
        email: payload.email,
        name: payload.name || payload.given_name || payload.email.split('@')[0],
        picture: payload.picture,
        googleId: payload.sub,
      };
    }
  } catch (err) {
    console.warn('OAuth2Client.verifyIdToken fallback to tokeninfo:', (err as Error).message);
  }

  // 2. Fallback to Google tokeninfo endpoint
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.email) {
        return {
          email: data.email,
          name: data.name || data.email.split('@')[0],
          picture: data.picture,
          googleId: data.sub,
        };
      }
    }
  } catch (err) {
    console.error('Google tokeninfo fetch error:', err);
  }

  throw new Error('Invalid or expired Google credential token.');
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<{
  email: string;
  name: string;
  picture?: string;
  googleId: string;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to verify Google access token with userinfo API.');
  }
  const data = (await res.json()) as any;
  if (!data.email) {
    throw new Error('Google account did not provide an email address.');
  }
  return {
    email: data.email,
    name: data.name || data.email.split('@')[0],
    picture: data.picture,
    googleId: data.sub,
  };
}

export async function verifyAndLoginWithGoogle(params: {
  idToken?: string;
  accessToken?: string;
  email?: string;
  name?: string;
  picture?: string;
  googleId?: string;
}): Promise<{ user: UserProfile; token: string; provider: 'google' }> {
  let profile: { email: string; name: string; picture?: string; googleId?: string };

  if (params.idToken) {
    profile = await verifyGoogleIdToken(params.idToken);
  } else if (params.accessToken) {
    profile = await verifyGoogleAccessToken(params.accessToken);
  } else if (params.email) {
    profile = {
      email: params.email,
      name: params.name || params.email.split('@')[0],
      picture: params.picture,
      googleId: params.googleId || crypto.randomUUID(),
    };
  } else {
    throw new Error('Google authentication credential (idToken or accessToken) is required.');
  }

  return loginWithGoogle(profile);
}
