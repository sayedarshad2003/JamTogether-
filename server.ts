import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { dynamoStore, DYNAMODB_ARCHITECTURE_DOCS } from './server/aws/dynamodb.ts';
import {
  registerCognitoUser,
  loginCognitoUser,
  verifyCognitoToken,
  logoutCognitoToken,
  loginAsGuest,
  loginWithGoogle,
  verifyAndLoginWithGoogle,
  deleteUserData,
  deleteUserAccount,
  convertToImageBase64,
  migrateExistingUsersAvatarsToBase64,
} from './server/aws/cognito.ts';
import {
  searchYouTubeVideos,
  fetchYouTubePlaylist,
  CURATED_YOUTUBE_TRACKS,
} from './server/aws/youtube.ts';
import {
  UserProfile,
  JamRoom,
  RoomMember,
  QueueItem,
  ChatMessage,
  PlaybackState,
  Friendship,
  ListeningHistoryEntry,
  YouTubeTrack,
  UserPlaylist,
} from './src/types/jam.ts';

const PORT = 3000;

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  roomId?: string;
  inVoiceChat: boolean;
}

const clients = new Map<WebSocket, ConnectedClient>();

function broadcastToRoom(roomId: string, type: string, payload: any, excludeWs?: WebSocket) {
  const message = JSON.stringify({
    type,
    roomId,
    payload,
    serverTimestamp: Date.now(),
  });

  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function sendToUserInRoom(roomId: string, targetUserId: string, type: string, payload: any) {
  const message = JSON.stringify({
    type,
    roomId,
    payload,
    serverTimestamp: Date.now(),
  });

  for (const [ws, client] of clients.entries()) {
    if (
      client.roomId === roomId &&
      client.userId === targetUserId &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(message);
    }
  }
}

/**
 * Computes the authoritative playback position on the server
 * using elapsed time since the last state transition when status === 'playing'.
 */
function computeAuthoritativePlayback(playback: PlaybackState): PlaybackState {
  const now = Date.now();
  if (playback.status !== 'playing') {
    return {
      ...playback,
      serverTimestamp: now,
    };
  }
  const elapsedSec = Math.max(0, (now - playback.serverTimestamp) / 1000);
  const duration = playback.track?.durationSec || 3600;
  let currentPos = playback.positionSec + elapsedSec;
  if (duration > 0 && currentPos > duration) {
    currentPos = currentPos % duration;
  }
  return {
    ...playback,
    positionSec: Number(currentPos.toFixed(2)),
    serverTimestamp: now,
  };
}

async function getFullRoomDetails(roomId: string): Promise<JamRoom | null> {
  const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
  if (!roomRec) return null;

  const room = roomRec.data as JamRoom;
  const playbackRec = await dynamoStore.get(`ROOM#${roomId}`, 'PLAYBACK');
  const rawPlayback = playbackRec ? (playbackRec.data as PlaybackState) : room.playback;
  const authoritativePlayback = computeAuthoritativePlayback(rawPlayback);

  const memberRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'MEMBER#');
  const members: RoomMember[] = memberRecs.map((r) => r.data as RoomMember);

  const queueRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
  const queue: QueueItem[] = queueRecs
    .map((r) => r.data as QueueItem)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const msgRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'MSG#');
  const messages: ChatMessage[] = msgRecs
    .map((r) => r.data as ChatMessage)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-100);

  return {
    ...room,
    activeMemberCount: members.filter((m) => m.isOnline).length || 1,
    playback: authoritativePlayback,
    members,
    queue,
    messages,
  };
}

async function recordListeningHistory(userId: string, roomId: string, roomName: string, track: YouTubeTrack) {
  const now = Date.now();
  const entryId = `hist_${crypto.randomBytes(4).toString('hex')}`;
  const entry: ListeningHistoryEntry = {
    entryId,
    userId,
    roomId,
    roomName,
    track,
    playedAt: now,
  };
  await dynamoStore.put({
    PK: `USER#${userId}`,
    SK: `HISTORY#${now}#${entryId}`,
    entityType: 'HISTORY',
    data: entry,
    updatedAt: now,
  });
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // ==========================================================================
  // 1. AUTHENTICATION ROUTES (AWS Cognito + DynamoDB Users)
  // ==========================================================================
  app.post('/api/auth/register', async (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'AWS registration is disabled. Please continue as Guest or Sign in with Google.',
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { usernameOrEmail, password } = req.body;
      if (!usernameOrEmail) {
        res.status(400).json({ error: 'Username or email is required.' });
        return;
      }
      const result = await loginCognitoUser({ usernameOrEmail, password });
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/guest', async (req: Request, res: Response) => {
    try {
      const { displayName, avatarUrl } = req.body || {};
      const result = await loginAsGuest({ displayName, avatarUrl });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    try {
      const { email, name, picture, googleId, idToken, credential, accessToken } = req.body || {};
      const tokenToVerify = idToken || credential;
      const result = await verifyAndLoginWithGoogle({
        idToken: tokenToVerify,
        accessToken,
        email,
        name,
        picture,
        googleId,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/google/verify', async (req: Request, res: Response) => {
    try {
      const { idToken, credential, accessToken } = req.body || {};
      const tokenToVerify = idToken || credential;
      const result = await verifyAndLoginWithGoogle({
        idToken: tokenToVerify,
        accessToken,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/auth/google/config', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const rawClientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const rawSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

    // Check if user accidentally pasted Client Secret (starts with GOCSPX-) into Client ID
    const isSecretInId = rawClientId.startsWith('GOCSPX-');
    const clientSecret = rawSecret || (isSecretInId ? rawClientId : '');
    const validClientId = !isSecretInId && rawClientId.includes('.apps.googleusercontent.com') ? rawClientId : '';

    res.json({
      clientId: validClientId,
      rawClientId,
      clientSecret,
      isConfigured: Boolean(validClientId && validClientId.length > 10),
      isSecretEnteredAsId: isSecretInId,
      warning: isSecretInId
        ? "The key entered in Super Admin is a Google Client Secret (starts with 'GOCSPX-'). Google requires the Client ID ending with '.apps.googleusercontent.com'."
        : null,
    });
  });

  // Google OAuth Popup Route
  app.get(['/google-auth-popup', '/google-auth-popup.html'], (_req: Request, res: Response) => {
    const popupPath = path.join(process.cwd(), 'public', 'google-auth-popup.html');
    if (fs.existsSync(popupPath)) {
      res.sendFile(popupPath);
    } else {
      res.status(404).send('Google Auth Popup file not found');
    }
  });

  // Google Account Chooser accounts list
  app.get('/api/auth/google/accounts', async (_req: Request, res: Response) => {
    try {
      const allUsers = await dynamoStore.queryByEntity('USER');
      const googleUsers = allUsers
        .map((r) => r.data as UserProfile)
        .filter((u) => u && (u.authProvider === 'google' || u.email?.endsWith('@gmail.com')));

      res.json({ accounts: googleUsers });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    await logoutCognitoToken(authHeader);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user });
  });

  app.patch('/api/auth/profile', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { displayName, bio, avatarUrl, favoriteGenres } = req.body;
    let newAvatar = user.avatarUrl;
    let newAvatarBase64 = user.avatarBase64;
    if (avatarUrl !== undefined && String(avatarUrl).trim() !== '') {
      const cleanAv = String(avatarUrl).trim();
      newAvatarBase64 = await convertToImageBase64(cleanAv, displayName || user.displayName);
      newAvatar = newAvatarBase64;
    }

    const updated: UserProfile = {
      ...user,
      displayName: displayName !== undefined ? String(displayName).trim() : user.displayName,
      bio: bio !== undefined ? String(bio).trim() : user.bio,
      avatarUrl: newAvatar,
      avatarBase64: newAvatarBase64,
      favoriteGenres: Array.isArray(favoriteGenres) ? favoriteGenres : user.favoriteGenres,
    };
    await dynamoStore.put({
      PK: `USER#${user.userId}`,
      SK: 'PROFILE',
      GSI1PK: `USERNAME#${user.username}`,
      GSI1SK: `EMAIL#${user.email}`,
      entityType: 'USER',
      data: updated,
      updatedAt: Date.now(),
    });
    res.json({ user: updated });
  });

  // User Self-Service: Delete My Available Data (History, Playlists)
  app.post('/api/user/delete-data', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await deleteUserData(user.userId);
    res.json({
      success: true,
      message: 'All your listening history and personal playlists have been cleared.',
    });
  });

  // User Self-Service: Delete My Account completely
  app.delete('/api/user/me', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await deleteUserAccount(user.userId);
    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently removed.',
    });
  });

  // Helper for Super Admin passkey verification
  function isSuperAdminAuthorized(req: Request): boolean {
    const adminSecret = (process.env.ADMIN_SECRET || 'admin123').trim();
    const headerKey = ((req.headers['x-admin-key'] as string) || '').trim();
    const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const queryKey = (
      ((req.query?.adminKey as string) ||
        (req.query?.key as string) ||
        '')
    ).trim();
    return (
      headerKey === adminSecret ||
      authHeader === adminSecret ||
      queryKey === adminSecret
    );
  }

  // ==========================================================================
  // SUPER ADMIN MANAGEMENT & CONTROL PORTAL ROUTES
  // ==========================================================================

  // Verify Super Admin Passkey
  app.post('/api/admin/verify', (req: Request, res: Response) => {
    const { passkey } = req.body || {};
    const adminSecret = (process.env.ADMIN_SECRET || 'admin123').trim();
    if (passkey && String(passkey).trim() === adminSecret) {
      res.json({ success: true, adminKey: passkey });
    } else {
      res.status(401).json({ error: 'Incorrect Super Admin passkey.' });
    }
  });

  // Super Admin Overview Statistics & Diagnostics
  app.get('/api/admin/overview', async (req: Request, res: Response) => {
    if (!isSuperAdminAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized: Super Admin access required.' });
      return;
    }

    const allRecords = dynamoStore.getAllRecords();
    const countByType: Record<string, number> = {};
    for (const r of allRecords) {
      countByType[r.entityType] = (countByType[r.entityType] || 0) + 1;
    }

    const googleClientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const isSecretEntered = googleClientId.startsWith('GOCSPX-');

    res.json({
      counts: {
        users: countByType['USER'] || 0,
        rooms: countByType['ROOM'] || 0,
        members: countByType['MEMBER'] || 0,
        queue: countByType['QUEUE'] || 0,
        messages: countByType['MESSAGE'] || 0,
        history: countByType['HISTORY'] || 0,
        friendships: countByType['FRIENDSHIP'] || 0,
        playlists: countByType['PLAYLIST'] || 0,
        totalRecords: allRecords.length,
      },
      googleConfig: {
        clientId: googleClientId,
        clientSecret: googleClientSecret || (isSecretEntered ? googleClientId : ''),
        isConfigured: Boolean(googleClientId && googleClientId.includes('.apps.googleusercontent.com')),
        isSecretEnteredAsId: isSecretEntered,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSec: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        dynamoDb: {
          isConfigured: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
          tableName: `${process.env.DYNAMODB_TABLE_PREFIX || 'JamTogether_'}CoreTable`,
          region: process.env.AWS_REGION || 'us-east-1',
        },
      },
    });
  });

  // Super Admin Records Explorer
  app.get('/api/admin/records', async (req: Request, res: Response) => {
    if (!isSuperAdminAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized: Super Admin access required.' });
      return;
    }
    const { type } = req.query as { type?: string };
    let records = dynamoStore.getAllRecords();
    if (type) {
      records = records.filter((r) => r.entityType === type);
    }
    res.json({
      count: records.length,
      records: records.slice(0, 100),
    });
  });

  // Super Admin: Update Google OAuth Client ID & Secret
  app.post('/api/admin/config/google', async (req: Request, res: Response) => {
    if (!isSuperAdminAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized: Super Admin access required.' });
      return;
    }
    const { clientId, clientSecret } = req.body || {};
    let cleanId = String(clientId || '').trim();
    let cleanSecret = String(clientSecret || '').trim();

    // Auto-detection: If GOCSPX- secret was pasted into clientId, switch it
    let detectedSecretSwitch = false;
    if (cleanId.startsWith('GOCSPX-')) {
      if (!cleanSecret) {
        cleanSecret = cleanId;
      }
      cleanId = '';
      detectedSecretSwitch = true;
    }

    process.env.GOOGLE_CLIENT_ID = cleanId;
    process.env.VITE_GOOGLE_CLIENT_ID = cleanId;
    if (cleanSecret) {
      process.env.GOOGLE_CLIENT_SECRET = cleanSecret;
    }

    try {
      const envPath = path.resolve('.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (/GOOGLE_CLIENT_ID=/i.test(envContent)) {
          envContent = envContent.replace(
            /GOOGLE_CLIENT_ID=.*/g,
            `GOOGLE_CLIENT_ID="${cleanId}"`
          );
        } else {
          envContent += `\nGOOGLE_CLIENT_ID="${cleanId}"`;
        }
        if (/VITE_GOOGLE_CLIENT_ID=/i.test(envContent)) {
          envContent = envContent.replace(
            /VITE_GOOGLE_CLIENT_ID=.*/g,
            `VITE_GOOGLE_CLIENT_ID="${cleanId}"`
          );
        } else {
          envContent += `\nVITE_GOOGLE_CLIENT_ID="${cleanId}"`;
        }
        if (/GOOGLE_CLIENT_SECRET=/i.test(envContent)) {
          envContent = envContent.replace(
            /GOOGLE_CLIENT_SECRET=.*/g,
            `GOOGLE_CLIENT_SECRET="${cleanSecret}"`
          );
        } else if (cleanSecret) {
          envContent += `\nGOOGLE_CLIENT_SECRET="${cleanSecret}"`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch (err) {
      console.warn('Could not update .env file:', (err as Error).message);
    }

    res.json({
      success: true,
      clientId: cleanId,
      clientSecret: cleanSecret,
      detectedSecretSwitch,
      isConfigured: Boolean(cleanId && cleanId.includes('.apps.googleusercontent.com')),
      message: detectedSecretSwitch
        ? 'Notice: Detected Google Client Secret (starts with GOCSPX-). Moved to Client Secret field. Please paste your Client ID (ends with .apps.googleusercontent.com) from Google Console.'
        : 'Google OAuth configuration successfully saved.',
    });
  });

  // Super Admin: Wipe Data (History, Messages, Rooms, or Factory Reset Complete Data)
  app.post('/api/admin/wipe', async (req: Request, res: Response) => {
    if (!isSuperAdminAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized: Super Admin access required.' });
      return;
    }
    const { scope, confirmText } = req.body || {};
    if (confirmText !== 'DELETE') {
      res.status(400).json({ error: 'Confirmation mismatch. Type DELETE to confirm data wipe.' });
      return;
    }

    let deletedCount = 0;
    if (scope === 'history') {
      deletedCount = await dynamoStore.wipeByEntity('HISTORY');
    } else if (scope === 'messages') {
      deletedCount = await dynamoStore.wipeByEntity('MESSAGE');
    } else if (scope === 'rooms') {
      deletedCount += await dynamoStore.wipeByEntity('ROOM');
      deletedCount += await dynamoStore.wipeByEntity('QUEUE');
      deletedCount += await dynamoStore.wipeByEntity('PLAYBACK');
      deletedCount += await dynamoStore.wipeByEntity('MEMBER');
    } else if (scope === 'all') {
      deletedCount = await dynamoStore.clearAll();
    } else {
      res.status(400).json({ error: 'Invalid wipe scope.' });
      return;
    }

    res.json({
      success: true,
      scope,
      deletedCount,
      message: scope === 'all' ? 'Complete database reset to scratch.' : `Wiped ${deletedCount} records.`,
    });
  });

  // Super Admin: Force Delete Specific User
  app.delete('/api/admin/users/:userId', async (req: Request, res: Response) => {
    if (!isSuperAdminAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized: Super Admin access required.' });
      return;
    }
    const { userId } = req.params;
    await deleteUserAccount(userId);
    res.json({ success: true, userId, message: `User ${userId} deleted.` });
  });

  // ==========================================================================
  // 2. DASHBOARD & SOCIAL PRESENCE ROUTES
  // ==========================================================================
  app.get('/api/dashboard', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);

    const allRoomRecs = await dynamoStore.queryByEntity('ROOM');
    const rooms: JamRoom[] = [];
    const myCreatedRooms: JamRoom[] = [];
    const myRoomMap = new Map<string, JamRoom>();

    // Member links for this user
    const memberLinks = user
      ? await dynamoStore.queryByGSI1(`USER#${user.userId}`, 'ROOM#')
      : [];
    const joinedRoomIds = new Set(memberLinks.map((m) => (m.data as RoomMember).roomId));

    // Listening history for track history and visited rooms
    const historyRecs = user
      ? await dynamoStore.queryByPK(`USER#${user.userId}`, 'HISTORY#')
      : [];
    const history: ListeningHistoryEntry[] = historyRecs
      .map((r) => r.data as ListeningHistoryEntry)
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, 30);

    const historyRoomIds = new Set(history.map((h) => h.roomId));

    for (const rec of allRoomRecs) {
      const full = await getFullRoomDetails((rec.data as JamRoom).roomId);
      if (!full) continue;

      const isHost = Boolean(
        user &&
          (full.hostUserId === user.userId ||
            full.hostUsername === user.username ||
            full.hostUsername === user.displayName ||
            (user.email && full.hostUsername === user.email.split('@')[0]))
      );
      const isMember = user ? joinedRoomIds.has(full.roomId) : false;
      const hasHistory = user ? historyRoomIds.has(full.roomId) : false;

      if (isHost) {
        myCreatedRooms.push(full);
        myRoomMap.set(full.roomId, full);
      }
      if (isMember || hasHistory) {
        myRoomMap.set(full.roomId, full);
      }

      // Show in general rooms if public OR if the user is host, member, or visited it
      if (!full.isPrivate || isHost || isMember || hasHistory) {
        rooms.push(full);
      }
    }

    const roomHistory = Array.from(myRoomMap.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );

    // Friends list with real-time room names
    const friendRecs = user
      ? await dynamoStore.queryByPK(`USER#${user.userId}`, 'FRIEND#')
      : [];
    const friends: Friendship[] = [];
    for (const fRec of friendRecs) {
      const f = fRec.data as Friendship;
      const friendProfileRec = await dynamoStore.get(`USER#${f.friendId}`, 'PROFILE');
      const friendProfile = friendProfileRec?.data as UserProfile | undefined;
      let currentRoomName: string | undefined;
      if (friendProfile?.currentRoomId) {
        const rRec = await dynamoStore.get(`ROOM#${friendProfile.currentRoomId}`, 'METADATA');
        currentRoomName = (rRec?.data as JamRoom | undefined)?.name;
      }
      friends.push({
        ...f,
        friendDisplayName: friendProfile?.displayName || f.friendDisplayName,
        friendAvatarUrl: friendProfile?.avatarUrl || f.friendAvatarUrl,
        friendOnlineStatus: friendProfile?.status || 'online',
        friendCurrentRoomId: friendProfile?.currentRoomId,
        friendCurrentRoomName: currentRoomName,
      });
    }

    // User-wise saved playlists
    const playlistRecs = user
      ? await dynamoStore.queryByPK(`USER#${user.userId}`, 'PLAYLIST#')
      : [];
    const userPlaylists: UserPlaylist[] = playlistRecs
      .map((r) => r.data as UserPlaylist)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // All users for friend invitations
    const userRecs = await dynamoStore.queryByEntity('USER');
    const allUsers = userRecs
      .map((r) => r.data as UserProfile)
      .filter((u) => u.userId !== user?.userId);

    res.json({
      rooms: rooms.sort((a, b) => b.createdAt - a.createdAt),
      myCreatedRooms: myCreatedRooms.sort((a, b) => b.createdAt - a.createdAt),
      roomHistory,
      recentlyJoinedRooms: roomHistory,
      friends,
      allUsers,
      history,
      userPlaylists,
    });
  });

  // ==========================================================================
  // 3. JAM ROOMS & MEMBER MANAGEMENT ROUTES
  // ==========================================================================
  app.post('/api/rooms', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Please sign in to create a Jam Room.' });
      return;
    }

    const { name, description, genreTag, isPrivate, initialVideoId } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Room name is required.' });
      return;
    }

    const now = Date.now();
    const roomId = `room_${crypto.randomBytes(5).toString('hex')}`;
    const passcode = req.body.passcode ? String(req.body.passcode).trim().toUpperCase() : undefined;
    const roomCode = passcode
      ? (passcode.startsWith('JAM-') ? passcode : `JAM-${passcode}`)
      : `JAM-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const initialTrack = initialVideoId
      ? CURATED_YOUTUBE_TRACKS.find((t) => t.videoId === initialVideoId) || null
      : null;

    const playback: PlaybackState = {
      roomId,
      videoId: initialTrack ? initialTrack.videoId : '',
      track: initialTrack,
      status: initialTrack ? 'playing' : 'paused',
      positionSec: 0,
      serverTimestamp: now,
      initiatedByUserId: user.userId,
      initiatedByUsername: user.displayName,
      historyIndex: 0,
    };

    const newRoom: JamRoom = {
      roomId,
      roomCode,
      name: String(name).trim(),
      description: String(description || 'Synchronized listening session & live voice hangout.').trim(),
      genreTag: String(genreTag || 'Open Format').trim(),
      isPrivate: Boolean(isPrivate),
      passcode,
      hostUserId: user.userId,
      hostUsername: user.displayName,
      hostAvatarUrl: user.avatarUrl,
      createdAt: now,
      activeMemberCount: 1,
      playback,
    };

    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: 'METADATA',
      GSI1PK: `ROOM_CODE#${roomCode}`,
      GSI1SK: `VISIBILITY#${newRoom.isPrivate ? 'PRIVATE' : 'PUBLIC'}`,
      entityType: 'ROOM',
      data: newRoom,
      updatedAt: now,
    });

    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: 'PLAYBACK',
      entityType: 'PLAYBACK',
      data: playback,
      updatedAt: now,
    });

    const hostMember: RoomMember = {
      roomId,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: 'host',
      isOnline: true,
      inVoiceChat: false,
      isMuted: false,
      isSpeaking: false,
      joinedAt: now,
    };

    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: `MEMBER#${user.userId}`,
      GSI1PK: `USER#${user.userId}`,
      GSI1SK: `ROOM#${roomId}`,
      entityType: 'MEMBER',
      data: hostMember,
      updatedAt: now,
    });

    if (initialTrack) {
      const firstQueueItem: QueueItem = {
        itemId: `q_${crypto.randomBytes(4).toString('hex')}`,
        roomId,
        orderIndex: 100,
        track: initialTrack,
        addedByUserId: user.userId,
        addedByUsername: user.displayName,
        addedByAvatar: user.avatarUrl,
        addedAt: now,
        upvotes: [user.userId],
      };

      await dynamoStore.put({
        PK: `ROOM#${roomId}`,
        SK: `QUEUE#000100#${firstQueueItem.itemId}`,
        entityType: 'QUEUE',
        data: firstQueueItem,
        updatedAt: now,
      });

      await recordListeningHistory(user.userId, roomId, newRoom.name, initialTrack);
    }

    const fullRoom = await getFullRoomDetails(roomId);
    res.json({ room: fullRoom });
  });

  app.post('/api/rooms/join-code', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rawCode = String(req.body.roomCode || '').trim().toUpperCase();
    if (!rawCode) {
      res.status(400).json({ error: 'Please enter a valid Room Code (e.g., JAM-808X).' });
      return;
    }

    // Lookup by GSI1PK (ROOM_CODE#<code>) or direct roomId
    let roomRecs = await dynamoStore.queryByGSI1(`ROOM_CODE#${rawCode}`);
    if (roomRecs.length === 0 && !rawCode.startsWith('JAM-')) {
      roomRecs = await dynamoStore.queryByGSI1(`ROOM_CODE#JAM-${rawCode}`);
    }
    if (roomRecs.length === 0) {
      const directRec = await dynamoStore.get(`ROOM#${ req.body.roomCode.trim() }`, 'METADATA');
      if (directRec) roomRecs = [directRec];
    }

    if (roomRecs.length === 0) {
      res.status(404).json({ error: `No Jam Room found with code "${rawCode}".` });
      return;
    }

    const targetRoom = roomRecs[0].data as JamRoom;
    const now = Date.now();

    const existingMemberRec = await dynamoStore.get(
      `ROOM#${targetRoom.roomId}`,
      `MEMBER#${user.userId}`
    );
    const member: RoomMember = existingMemberRec
      ? {
          ...(existingMemberRec.data as RoomMember),
          isOnline: true,
        }
      : {
          roomId: targetRoom.roomId,
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: targetRoom.hostUserId === user.userId ? 'host' : 'member',
          isOnline: true,
          inVoiceChat: false,
          isMuted: false,
          isSpeaking: false,
          joinedAt: now,
        };

    await dynamoStore.put({
      PK: `ROOM#${targetRoom.roomId}`,
      SK: `MEMBER#${user.userId}`,
      GSI1PK: `USER#${user.userId}`,
      GSI1SK: `ROOM#${targetRoom.roomId}`,
      entityType: 'MEMBER',
      data: member,
      updatedAt: now,
    });

    const fullRoom = await getFullRoomDetails(targetRoom.roomId);
    broadcastToRoom(targetRoom.roomId, 'room:members_updated', {
      members: fullRoom?.members || [],
    });

    res.json({ room: fullRoom });
  });

  app.get('/api/rooms/:roomId', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;

    const fullRoom = await getFullRoomDetails(roomId);
    if (!fullRoom) {
      res.status(404).json({ error: 'Jam Room not found.' });
      return;
    }

    // Auto-register user as online member in room when joining
    if (user) {
      const now = Date.now();
      const existing = fullRoom.members?.find((m) => m.userId === user.userId);
      const memberData: RoomMember = existing
        ? { ...existing, isOnline: true, displayName: user.displayName, avatarUrl: user.avatarUrl }
        : {
            roomId,
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: fullRoom.hostUserId === user.userId ? 'host' : 'member',
            isOnline: true,
            inVoiceChat: false,
            isMuted: false,
            isSpeaking: false,
            joinedAt: now,
          };

      await dynamoStore.put({
        PK: `ROOM#${roomId}`,
        SK: `MEMBER#${user.userId}`,
        GSI1PK: `USER#${user.userId}`,
        GSI1SK: `ROOM#${roomId}`,
        entityType: 'MEMBER',
        data: memberData,
        updatedAt: now,
      });

      // Update user currentRoomId in DynamoDB
      await dynamoStore.put({
        PK: `USER#${user.userId}`,
        SK: 'PROFILE',
        GSI1PK: `USERNAME#${user.username}`,
        GSI1SK: `EMAIL#${user.email}`,
        entityType: 'USER',
        data: { ...user, status: 'in_room', currentRoomId: roomId },
        updatedAt: now,
      });
    }

    const updatedRoom = await getFullRoomDetails(roomId);
    res.json({ room: updatedRoom });
  });

  app.post('/api/rooms/:roomId/leave', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existingMemberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${user.userId}`);
    if (existingMemberRec) {
      const m = existingMemberRec.data as RoomMember;
      await dynamoStore.put({
        PK: `ROOM#${roomId}`,
        SK: `MEMBER#${user.userId}`,
        GSI1PK: `USER#${user.userId}`,
        GSI1SK: `ROOM#${roomId}`,
        entityType: 'MEMBER',
        data: { ...m, isOnline: false, inVoiceChat: false, isSpeaking: false },
        updatedAt: Date.now(),
      });
    }

    await dynamoStore.put({
      PK: `USER#${user.userId}`,
      SK: 'PROFILE',
      GSI1PK: `USERNAME#${user.username}`,
      GSI1SK: `EMAIL#${user.email}`,
      entityType: 'USER',
      data: { ...user, status: 'online', currentRoomId: undefined },
      updatedAt: Date.now(),
    });

    // If leaving user is the room host, instantly promote next available member to host
    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (roomRec) {
      const room = roomRec.data as JamRoom;
      if (room.hostUserId === user.userId) {
        const allMembers = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'MEMBER#');
        const remaining: RoomMember[] = allMembers
          .map((r: any) => r.data as RoomMember)
          .filter((m: RoomMember) => m.userId !== user.userId && m.isOnline !== false);
        if (remaining.length > 0) {
          const nextHost = remaining[0];
          const updatedRoom: JamRoom = {
            ...room,
            hostUserId: nextHost.userId,
            hostUsername: nextHost.displayName || nextHost.username,
            hostAvatarUrl: nextHost.avatarUrl,
          };
          await dynamoStore.put({
            ...roomRec,
            data: updatedRoom,
            updatedAt: Date.now(),
          });
          const nextMemRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${nextHost.userId}`);
          if (nextMemRec) {
            await dynamoStore.put({
              ...nextMemRec,
              data: { ...nextHost, role: 'host' },
              updatedAt: Date.now(),
            });
          }
          broadcastToRoom(roomId, 'room:host_transferred', {
            hostUserId: nextHost.userId,
            hostUsername: nextHost.displayName || nextHost.username,
            hostAvatarUrl: nextHost.avatarUrl,
            room: updatedRoom,
          });
        }
      }
    }

    const fullRoom = await getFullRoomDetails(roomId);
    broadcastToRoom(roomId, 'webrtc:user_left_vc', { userId: user.userId });
    broadcastToRoom(roomId, 'room:members_updated', { members: fullRoom?.members || [] });

    res.json({ ok: true });
  });

  app.post('/api/rooms/:roomId/transfer-host', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    const { newHostUserId } = req.body;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (!roomRec) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const room = roomRec.data as JamRoom;
    if (room.hostUserId !== user.userId) {
      res.status(403).json({ error: 'Only the room host can transfer host privileges.' });
      return;
    }

    const targetMemberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${newHostUserId}`);
    if (!targetMemberRec) {
      res.status(404).json({ error: 'Target member is not in this room.' });
      return;
    }

    const targetMember = targetMemberRec.data as RoomMember;
    const now = Date.now();

    // Update room metadata
    const updatedRoom: JamRoom = {
      ...room,
      hostUserId: targetMember.userId,
      hostUsername: targetMember.displayName,
      hostAvatarUrl: targetMember.avatarUrl,
    };

    await dynamoStore.put({
      ...roomRec,
      data: updatedRoom,
      updatedAt: now,
    });

    // Update both members
    const oldHostMemberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${user.userId}`);
    if (oldHostMemberRec) {
      await dynamoStore.put({
        ...oldHostMemberRec,
        data: { ...(oldHostMemberRec.data as RoomMember), role: 'member' },
        updatedAt: now,
      });
    }

    await dynamoStore.put({
      ...targetMemberRec,
      data: { ...targetMember, role: 'host' },
      updatedAt: now,
    });

    const fullRoom = await getFullRoomDetails(roomId);
    broadcastToRoom(roomId, 'room:host_transferred', {
      hostUserId: targetMember.userId,
      hostUsername: targetMember.displayName,
      members: fullRoom?.members || [],
    });

    res.json({ room: fullRoom });
  });

  app.post('/api/rooms/:roomId/remove-member', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    const { targetUserId } = req.body;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (!roomRec || (roomRec.data as JamRoom).hostUserId !== user.userId) {
      res.status(403).json({ error: 'Only the room host can remove members.' });
      return;
    }

    await dynamoStore.delete(`ROOM#${roomId}`, `MEMBER#${targetUserId}`);
    const fullRoom = await getFullRoomDetails(roomId);

    broadcastToRoom(roomId, 'room:member_kicked', {
      targetUserId,
      members: fullRoom?.members || [],
    });

    res.json({ members: fullRoom?.members || [] });
  });

  app.delete('/api/rooms/:roomId', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (!roomRec || (roomRec.data as JamRoom).hostUserId !== user.userId) {
      res.status(403).json({ error: 'Only the room host can close this room.' });
      return;
    }

    broadcastToRoom(roomId, 'room:closed', {
      roomId,
      closedBy: user.displayName,
    });

    await dynamoStore.delete(`ROOM#${roomId}`, 'METADATA');
    await dynamoStore.delete(`ROOM#${roomId}`, 'PLAYBACK');

    res.json({ ok: true });
  });

  // ==========================================================================
  // 4. REAL-TIME MUSIC SYNCHRONIZATION & PLAYBACK CONTROL
  // ==========================================================================
  app.post('/api/rooms/:roomId/playback', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (!roomRec) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const room = roomRec.data as JamRoom;
    const { action, positionSec, track, allowMemberAutoAdvance } = req.body;

    // Host protection: only host can control play/pause/seek/skip unless auto-advancing at end of track
    if (room.hostUserId !== user.userId && !allowMemberAutoAdvance) {
      res.status(403).json({
        error: 'Host-only control: Only the room host can control playback or skip tracks.',
      });
      return;
    }

    const playbackRec = await dynamoStore.get(`ROOM#${roomId}`, 'PLAYBACK');
    const currentPlayback = playbackRec
      ? computeAuthoritativePlayback(playbackRec.data as PlaybackState)
      : room.playback;

    const queueRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = queueRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const now = Date.now();
    let updatedPlayback: PlaybackState = {
      ...currentPlayback,
      serverTimestamp: now,
      initiatedByUserId: user.userId,
      initiatedByUsername: user.displayName,
    };

    if (action === 'play') {
      updatedPlayback.status = 'playing';
      if (typeof positionSec === 'number') {
        updatedPlayback.positionSec = Math.max(0, positionSec);
      }
    } else if (action === 'pause') {
      updatedPlayback.status = 'paused';
      if (typeof positionSec === 'number') {
        updatedPlayback.positionSec = Math.max(0, positionSec);
      }
    } else if (action === 'seek') {
      updatedPlayback.positionSec = Math.max(0, Number(positionSec) || 0);
    } else if (action === 'selectTrack' && track) {
      updatedPlayback.videoId = track.videoId;
      updatedPlayback.track = track;
      updatedPlayback.positionSec = 0;
      updatedPlayback.status = 'playing';
      await recordListeningHistory(user.userId, roomId, room.name, track);
    } else if (action === 'next') {
      const currentIdx = queue.findIndex((q) => q.track.videoId === currentPlayback.videoId);
      const nextItem =
        currentIdx >= 0 && currentIdx + 1 < queue.length
          ? queue[currentIdx + 1]
          : queue[0];
      if (nextItem) {
        updatedPlayback.videoId = nextItem.track.videoId;
        updatedPlayback.track = nextItem.track;
        updatedPlayback.positionSec = 0;
        updatedPlayback.status = 'playing';
        await recordListeningHistory(user.userId, roomId, room.name, nextItem.track);
      }
    } else if (action === 'previous') {
      const currentIdx = queue.findIndex((q) => q.track.videoId === currentPlayback.videoId);
      const prevItem =
        currentIdx > 0 ? queue[currentIdx - 1] : queue[queue.length - 1];
      if (prevItem) {
        updatedPlayback.videoId = prevItem.track.videoId;
        updatedPlayback.track = prevItem.track;
        updatedPlayback.positionSec = 0;
        updatedPlayback.status = 'playing';
      }
    }

    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: 'PLAYBACK',
      entityType: 'PLAYBACK',
      data: updatedPlayback,
      updatedAt: now,
    });

    await dynamoStore.put({
      ...roomRec,
      data: { ...room, playback: updatedPlayback },
      updatedAt: now,
    });

    broadcastToRoom(roomId, 'playback:updated', {
      playback: updatedPlayback,
      action,
    });

    res.json({ playback: updatedPlayback });
  });

  // ==========================================================================
  // 5. SHARED MUSIC QUEUE ROUTES
  // ==========================================================================
  app.post('/api/rooms/:roomId/queue', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { track } = req.body as { track: YouTubeTrack };
    if (!track || !track.videoId) {
      res.status(400).json({ error: 'Valid YouTube track is required.' });
      return;
    }

    const existingRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const existingItems = existingRecs.map((r) => r.data as QueueItem);

    // Idempotent check: prevent exact duplicate if added within last 3 seconds
    const maxOrder = existingItems.reduce((max, item) => Math.max(max, item.orderIndex), 0);
    const nextOrder = maxOrder + 100;
    const itemId = `q_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    const newItem: QueueItem = {
      itemId,
      roomId,
      orderIndex: nextOrder,
      track,
      addedByUserId: user.userId,
      addedByUsername: user.displayName,
      addedByAvatar: user.avatarUrl,
      addedAt: now,
      upvotes: [user.userId],
    };

    const paddedOrder = String(nextOrder).padStart(6, '0');
    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: `QUEUE#${paddedOrder}#${itemId}`,
      entityType: 'QUEUE',
      data: newItem,
      updatedAt: now,
    });

    const updatedRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = updatedRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    broadcastToRoom(roomId, 'queue:updated', { queue });
    res.json({ queue, addedItem: newItem });
  });

  app.post('/api/rooms/:roomId/queue/playlist', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { playlistUrl, tracks: providedTracks, playlistName, saveToMyPlaylists = true } = req.body as {
      playlistUrl?: string;
      tracks?: YouTubeTrack[];
      playlistName?: string;
      saveToMyPlaylists?: boolean;
    };

    let tracksToQueue: YouTubeTrack[] = [];
    let detectedTitle = 'YouTube Playlist';

    if (playlistUrl) {
      try {
        const playlistData = await fetchYouTubePlaylist(playlistUrl);
        tracksToQueue = playlistData.tracks;
        detectedTitle = playlistData.title;
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    } else if (Array.isArray(providedTracks) && providedTracks.length > 0) {
      tracksToQueue = providedTracks;
      detectedTitle = `Imported Selection (${providedTracks.length} tracks)`;
    } else {
      res.status(400).json({ error: 'Please provide either a playlistUrl or an array of tracks.' });
      return;
    }

    const finalPlaylistTitle = (playlistName && playlistName.trim()) || detectedTitle;

    if (tracksToQueue.length === 0) {
      res.status(400).json({ error: 'No playable tracks found in playlist.' });
      return;
    }

    const existingRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const existingItems = existingRecs.map((r) => r.data as QueueItem);
    let maxOrder = existingItems.reduce((max, item) => Math.max(max, item.orderIndex), 0);
    const now = Date.now();

    for (let i = 0; i < tracksToQueue.length; i++) {
      const track = tracksToQueue[i];
      maxOrder += 100;
      const itemId = `q_${crypto.randomBytes(4).toString('hex')}`;
      const newItem: QueueItem = {
        itemId,
        roomId,
        orderIndex: maxOrder,
        track,
        addedByUserId: user.userId,
        addedByUsername: user.displayName,
        addedByAvatar: user.avatarUrl,
        addedAt: now + i,
        upvotes: [user.userId],
      };

      const paddedOrder = String(maxOrder).padStart(6, '0');
      await dynamoStore.put({
        PK: `ROOM#${roomId}`,
        SK: `QUEUE#${paddedOrder}#${itemId}`,
        entityType: 'QUEUE',
        data: newItem,
        updatedAt: now + i,
      });
    }

    // Automatically save to UserPlaylists so the user can select and play it again
    if (user && saveToMyPlaylists) {
      const plId = `pl_${crypto.randomBytes(4).toString('hex')}`;
      const savedUserPlaylist: UserPlaylist = {
        playlistId: plId,
        userId: user.userId,
        name: finalPlaylistTitle,
        description: `Imported with ${tracksToQueue.length} songs`,
        sourceUrl: playlistUrl || '',
        trackCount: tracksToQueue.length,
        thumbnailUrl: tracksToQueue[0]?.thumbnailUrl || '',
        tracks: tracksToQueue,
        createdAt: now,
        updatedAt: now,
      };

      await dynamoStore.put({
        PK: `USER#${user.userId}`,
        SK: `PLAYLIST#${plId}`,
        entityType: 'PLAYLIST',
        data: savedUserPlaylist,
        updatedAt: now,
      });
    }

    // Auto-start first track if room currently has nothing playing
    const pbRec = await dynamoStore.get(`ROOM#${roomId}`, 'PLAYBACK');
    if (pbRec) {
      const currentPb = pbRec.data as PlaybackState;
      if (!currentPb.videoId && tracksToQueue.length > 0) {
        const firstTrack = tracksToQueue[0];
        const updatedPb: PlaybackState = {
          ...currentPb,
          videoId: firstTrack.videoId,
          track: firstTrack,
          status: 'playing',
          positionSec: 0,
          serverTimestamp: now,
          initiatedByUserId: user.userId,
          initiatedByUsername: user.displayName,
        };
        await dynamoStore.put({
          ...pbRec,
          data: updatedPb,
          updatedAt: now,
        });
        broadcastToRoom(roomId, 'playback:sync', updatedPb);
      }
    }

    const updatedRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = updatedRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    broadcastToRoom(roomId, 'queue:updated', { queue });
    res.json({ queue, addedCount: tracksToQueue.length, playlistTitle: finalPlaylistTitle });
  });

  // ==========================================================================
  // USER-WISE PLAYLIST MANAGEMENT ENDPOINTS
  // ==========================================================================

  // GET /api/playlists - List current user's saved playlists
  app.get('/api/playlists', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.json({ playlists: [] });
      return;
    }
    const recs = await dynamoStore.queryByPK(`USER#${user.userId}`, 'PLAYLIST#');
    const playlists: UserPlaylist[] = recs
      .map((r) => r.data as UserPlaylist)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ playlists });
  });

  // POST /api/playlists - Save or import playlist with custom name
  app.post('/api/playlists', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Please sign in to save playlists.' });
      return;
    }
    const { name, tracks, sourceUrl, description } = req.body || {};
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      res.status(400).json({ error: 'Cannot save an empty playlist.' });
      return;
    }
    const playlistId = `pl_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    const cleanName = (name && name.trim()) ? name.trim() : `My Playlist #${Math.floor(Math.random() * 900 + 100)}`;
    const newPlaylist: UserPlaylist = {
      playlistId,
      userId: user.userId,
      name: cleanName,
      description: description?.trim() || '',
      sourceUrl: sourceUrl?.trim() || '',
      trackCount: tracks.length,
      thumbnailUrl: tracks[0]?.thumbnailUrl || '',
      tracks,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoStore.put({
      PK: `USER#${user.userId}`,
      SK: `PLAYLIST#${playlistId}`,
      entityType: 'PLAYLIST',
      data: newPlaylist,
      updatedAt: now,
    });

    res.json({ playlist: newPlaylist });
  });

  // DELETE /api/playlists/:playlistId - Delete a user's playlist
  app.delete('/api/playlists/:playlistId', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { playlistId } = req.params;
    await dynamoStore.delete(`USER#${user.userId}`, `PLAYLIST#${playlistId}`);
    res.json({ success: true, playlistId });
  });

  // POST /api/rooms/:roomId/queue/user-playlist/:playlistId - Queue user's playlist in room
  app.post('/api/rooms/:roomId/queue/user-playlist/:playlistId', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { roomId, playlistId } = req.params;
    const plRec = await dynamoStore.get(`USER#${user.userId}`, `PLAYLIST#${playlistId}`);
    if (!plRec) {
      res.status(404).json({ error: 'Playlist not found.' });
      return;
    }
    const playlist = plRec.data as UserPlaylist;
    const tracksToQueue = playlist.tracks || [];

    if (tracksToQueue.length === 0) {
      res.status(400).json({ error: 'Playlist contains no tracks.' });
      return;
    }

    const existingRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const existingItems = existingRecs.map((r) => r.data as QueueItem);
    let maxOrder = existingItems.reduce((max, item) => Math.max(max, item.orderIndex), 0);
    const now = Date.now();

    for (let i = 0; i < tracksToQueue.length; i++) {
      const track = tracksToQueue[i];
      maxOrder += 100;
      const itemId = `q_${crypto.randomBytes(4).toString('hex')}`;
      const newItem: QueueItem = {
        itemId,
        roomId,
        orderIndex: maxOrder,
        track,
        addedByUserId: user.userId,
        addedByUsername: user.displayName,
        addedByAvatar: user.avatarUrl,
        addedAt: now + i,
        upvotes: [user.userId],
      };

      const paddedOrder = String(maxOrder).padStart(6, '0');
      await dynamoStore.put({
        PK: `ROOM#${roomId}`,
        SK: `QUEUE#${paddedOrder}#${itemId}`,
        entityType: 'QUEUE',
        data: newItem,
        updatedAt: now + i,
      });
    }

    // Auto-start first track if room currently has nothing playing
    const pbRec = await dynamoStore.get(`ROOM#${roomId}`, 'PLAYBACK');
    if (pbRec) {
      const currentPb = pbRec.data as PlaybackState;
      if (!currentPb.videoId && tracksToQueue.length > 0) {
        const firstTrack = tracksToQueue[0];
        const updatedPb: PlaybackState = {
          ...currentPb,
          videoId: firstTrack.videoId,
          track: firstTrack,
          status: 'playing',
          positionSec: 0,
          serverTimestamp: now,
          initiatedByUserId: user.userId,
          initiatedByUsername: user.displayName,
        };
        await dynamoStore.put({
          ...pbRec,
          data: updatedPb,
          updatedAt: now,
        });
        broadcastToRoom(roomId, 'playback:sync', updatedPb);
      }
    }

    const updatedRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = updatedRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    broadcastToRoom(roomId, 'queue:updated', { queue });

    res.json({
      success: true,
      playlistName: playlist.name,
      addedCount: tracksToQueue.length,
      queue,
    });
  });

  app.delete('/api/rooms/:roomId/queue/:itemId', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId, itemId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const roomRec = await dynamoStore.get(`ROOM#${roomId}`, 'METADATA');
    if (!roomRec) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const room = roomRec.data as JamRoom;

    const queueRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const targetRec = queueRecs.find((r) => (r.data as QueueItem).itemId === itemId);

    if (!targetRec) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }

    const item = targetRec.data as QueueItem;
    if (room.hostUserId !== user.userId && item.addedByUserId !== user.userId) {
      res.status(403).json({
        error: 'Only the room host or the member who added this song can remove it.',
      });
      return;
    }

    await dynamoStore.delete(targetRec.PK, targetRec.SK);

    const remainingRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = remainingRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    broadcastToRoom(roomId, 'queue:updated', { queue });
    res.json({ queue });
  });

  app.put('/api/rooms/:roomId/queue/reorder', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    const { itemId, direction } = req.body as { itemId: string; direction: 'up' | 'down' };

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queueRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const sorted = queueRecs
      .map((r) => ({ rec: r, item: r.data as QueueItem }))
      .sort((a, b) => a.item.orderIndex - b.item.orderIndex);

    const idx = sorted.findIndex((x) => x.item.itemId === itemId);
    if (idx === -1) {
      res.status(404).json({ error: 'Track not found in queue' });
      return;
    }

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) {
      res.json({ queue: sorted.map((x) => x.item) });
      return;
    }

    const currentEntry = sorted[idx];
    const neighborEntry = sorted[swapIdx];

    // Swap orderIndex in DynamoDB
    await dynamoStore.delete(currentEntry.rec.PK, currentEntry.rec.SK);
    await dynamoStore.delete(neighborEntry.rec.PK, neighborEntry.rec.SK);

    const tempOrder = currentEntry.item.orderIndex;
    currentEntry.item.orderIndex = neighborEntry.item.orderIndex;
    neighborEntry.item.orderIndex = tempOrder;

    const now = Date.now();
    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: `QUEUE#${String(currentEntry.item.orderIndex).padStart(6, '0')}#${currentEntry.item.itemId}`,
      entityType: 'QUEUE',
      data: currentEntry.item,
      updatedAt: now,
    });
    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: `QUEUE#${String(neighborEntry.item.orderIndex).padStart(6, '0')}#${neighborEntry.item.itemId}`,
      entityType: 'QUEUE',
      data: neighborEntry.item,
      updatedAt: now,
    });

    const refreshedRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'QUEUE#');
    const queue = refreshedRecs
      .map((r) => r.data as QueueItem)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    broadcastToRoom(roomId, 'queue:updated', { queue });
    res.json({ queue });
  });

  // ==========================================================================
  // 6. REAL-TIME TEXT CHAT & EMOJI REACTIONS
  // ==========================================================================
  app.post('/api/rooms/:roomId/messages', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId } = req.params;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const content = String(req.body.content || '').trim();
    if (!content) {
      res.status(400).json({ error: 'Message content cannot be empty.' });
      return;
    }

    const now = Date.now();
    const messageId = `msg_${crypto.randomBytes(4).toString('hex')}`;
    const msg: ChatMessage = {
      messageId,
      roomId,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      content,
      type: 'text',
      timestamp: now,
      reactions: {},
    };

    await dynamoStore.put({
      PK: `ROOM#${roomId}`,
      SK: `MSG#${now}#${messageId}`,
      entityType: 'MESSAGE',
      data: msg,
      updatedAt: now,
    });

    broadcastToRoom(roomId, 'chat:new_message', { message: msg });
    res.json({ message: msg });
  });

  app.post('/api/rooms/:roomId/messages/:messageId/react', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    const { roomId, messageId } = req.params;
    const { emoji } = req.body;

    if (!user || !emoji) {
      res.status(400).json({ error: 'Invalid reaction request' });
      return;
    }

    const msgRecs = await dynamoStore.queryByPK(`ROOM#${roomId}`, 'MSG#');
    const targetRec = msgRecs.find((r) => (r.data as ChatMessage).messageId === messageId);
    if (!targetRec) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const msg = targetRec.data as ChatMessage;
    const currentList = msg.reactions[emoji] || [];
    const exists = currentList.includes(user.userId);
    const nextList = exists
      ? currentList.filter((id) => id !== user.userId)
      : [...currentList, user.userId];

    if (nextList.length === 0) {
      delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji] = nextList;
    }

    await dynamoStore.put({
      ...targetRec,
      data: msg,
      updatedAt: Date.now(),
    });

    broadcastToRoom(roomId, 'chat:reaction_updated', {
      messageId,
      reactions: msg.reactions,
    });

    res.json({ message: msg });
  });

  // ==========================================================================
  // 7. FRIENDS & INVITATIONS ROUTES
  // ==========================================================================
  app.post('/api/friends/add', async (req: Request, res: Response) => {
    const user = await verifyCognitoToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { usernameOrId } = req.body;
    if (!usernameOrId) {
      res.status(400).json({ error: 'Friend username is required.' });
      return;
    }

    const clean = String(usernameOrId).trim().toLowerCase();
    const allUsers = (await dynamoStore.queryByEntity('USER')).map((r) => r.data as UserProfile);
    const friend = allUsers.find(
      (u) =>
        u.userId === usernameOrId ||
        u.username.toLowerCase() === clean ||
        u.displayName.toLowerCase() === clean
    );

    if (!friend) {
      res.status(404).json({ error: `No user found matching "${usernameOrId}".` });
      return;
    }

    if (friend.userId === user.userId) {
      res.status(400).json({ error: 'You cannot add yourself as a friend.' });
      return;
    }

    const now = Date.now();
    const friendship: Friendship = {
      userId: user.userId,
      friendId: friend.userId,
      friendUsername: friend.username,
      friendDisplayName: friend.displayName,
      friendAvatarUrl: friend.avatarUrl,
      status: 'accepted',
      friendOnlineStatus: friend.status,
      friendCurrentRoomId: friend.currentRoomId,
      updatedAt: now,
    };

    await dynamoStore.put({
      PK: `USER#${user.userId}`,
      SK: `FRIEND#${friend.userId}`,
      entityType: 'FRIENDSHIP',
      data: friendship,
      updatedAt: now,
    });

    // Bidirectional friendship record
    await dynamoStore.put({
      PK: `USER#${friend.userId}`,
      SK: `FRIEND#${user.userId}`,
      entityType: 'FRIENDSHIP',
      data: {
        userId: friend.userId,
        friendId: user.userId,
        friendUsername: user.username,
        friendDisplayName: user.displayName,
        friendAvatarUrl: user.avatarUrl,
        status: 'accepted',
        friendOnlineStatus: user.status,
        friendCurrentRoomId: user.currentRoomId,
        updatedAt: now,
      },
      updatedAt: now,
    });

    res.json({ friendship });
  });

  // ==========================================================================
  // 8. YOUTUBE SEARCH API PROXY & AWS DYNAMODB ARCHITECTURE INSPECTOR
  // ==========================================================================
  app.get('/api/youtube/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '');
    const results = await searchYouTubeVideos(q);
    res.json(results);
  });

  app.get('/api/youtube/playlist', async (req: Request, res: Response) => {
    try {
      const url = String(req.query.url || req.query.list || req.query.q || '');
      if (!url) {
        res.status(400).json({ error: 'Playlist URL or ID is required.' });
        return;
      }
      const result = await fetchYouTubePlaylist(url);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/aws/architecture', async (_req: Request, res: Response) => {
    const allRecords = dynamoStore.getAllRecords();
    const countsByEntity: Record<string, number> = {};
    for (const r of allRecords) {
      countsByEntity[r.entityType] = (countsByEntity[r.entityType] || 0) + 1;
    }

    res.json({
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      dynamoDbConnected: Boolean(
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ),
      cognitoConfigured: Boolean(
        process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
      ),
      youtubeApiConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      tablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'JamTogether_',
      totalDynamoItems: allRecords.length,
      countsByEntity,
      schemas: DYNAMODB_ARCHITECTURE_DOCS,
      sampleItems: allRecords.slice(0, 12).map((r) => ({
        PK: r.PK,
        SK: r.SK,
        GSI1PK: r.GSI1PK,
        entityType: r.entityType,
      })),
    });
  });

  // ==========================================================================
  // DATABASE STATS ROUTES
  // ==========================================================================
  app.get('/api/database/stats', (_req: Request, res: Response) => {
    try {
      const allRecords = dynamoStore.getAllRecords();
      const countsByEntity: Record<string, number> = {};
      for (const r of allRecords) {
        countsByEntity[r.entityType] = (countsByEntity[r.entityType] || 0) + 1;
      }
      res.json({
        totalRecords: allRecords.length,
        countsByEntity,
        storageEngine: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
          ? 'AWS DynamoDB (Cloud)'
          : 'DynamoDB Local Engine',
        tableName: `${process.env.DYNAMODB_TABLE_PREFIX || 'JamTogether_'}CoreTable`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/database/reset', (_req: Request, res: Response) => {
    try {
      dynamoStore.clearAll();
      res.json({ ok: true, message: 'All database records cleared to scratch.' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ==========================================================================
  // 9. WEBSOCKET SERVER (Real-time Sync + WebRTC Voice Signaling + Presence)
  // ==========================================================================
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (raw: string) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, roomId, payload } = msg;

        if (type === 'room:subscribe') {
          const { userId, username, displayName, avatarUrl } = payload || {};
          if (!userId || !roomId) return;

          clients.set(ws, {
            ws,
            userId,
            username: username || 'member',
            displayName: displayName || username || 'Listener',
            avatarUrl:
              avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
            roomId,
            inVoiceChat: false,
          });

          const fullRoom = await getFullRoomDetails(roomId);
          if (fullRoom) {
            ws.send(
              JSON.stringify({
                type: 'room:init',
                roomId,
                payload: { room: fullRoom },
                serverTimestamp: Date.now(),
              })
            );
            broadcastToRoom(
              roomId,
              'room:members_updated',
              { members: fullRoom.members || [] },
              ws
            );
          }
        } else if (type === 'playback:request_sync') {
          if (!roomId) return;
          const playbackRec = await dynamoStore.get(`ROOM#${roomId}`, 'PLAYBACK');
          if (playbackRec) {
            const authoritative = computeAuthoritativePlayback(
              playbackRec.data as PlaybackState
            );
            ws.send(
              JSON.stringify({
                type: 'playback:sync_check',
                roomId,
                payload: { playback: authoritative },
                serverTimestamp: Date.now(),
              })
            );
          }
        } else if (type === 'webrtc:join_vc') {
          const client = clients.get(ws);
          if (!client || !roomId) return;
          client.inVoiceChat = true;

          const memberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${client.userId}`);
          if (memberRec) {
            const m = memberRec.data as RoomMember;
            await dynamoStore.put({
              ...memberRec,
              data: {
                ...m,
                inVoiceChat: true,
                isMuted: Boolean(payload?.isMuted),
                isSpeaking: false,
              },
              updatedAt: Date.now(),
            });
          }

          const fullRoom = await getFullRoomDetails(roomId);
          // Notify existing VC peers so they initiate WebRTC offer to the newly joined user
          broadcastToRoom(
            roomId,
            'webrtc:user_joined_vc',
            {
              userId: client.userId,
              fromUserId: client.userId,
              username: client.username,
              displayName: client.displayName,
              avatarUrl: client.avatarUrl,
              inVoiceChat: true,
              members: fullRoom?.members || [],
            },
            ws
          );
          // Also send updated member list back to joining client
          ws.send(
            JSON.stringify({
              type: 'room:members_updated',
              roomId,
              payload: { members: fullRoom?.members || [] },
              serverTimestamp: Date.now(),
            })
          );
        } else if (type === 'webrtc:leave_vc') {
          const client = clients.get(ws);
          if (!client || !roomId) return;
          client.inVoiceChat = false;

          const memberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${client.userId}`);
          if (memberRec) {
            const m = memberRec.data as RoomMember;
            await dynamoStore.put({
              ...memberRec,
              data: {
                ...m,
                inVoiceChat: false,
                isSpeaking: false,
              },
              updatedAt: Date.now(),
            });
          }

          const fullRoom = await getFullRoomDetails(roomId);
          broadcastToRoom(roomId, 'webrtc:user_left_vc', {
            userId: client.userId,
            fromUserId: client.userId,
            members: fullRoom?.members || [],
          });
        } else if (
          type === 'webrtc:offer' ||
          type === 'webrtc:answer' ||
          type === 'webrtc:ice_candidate'
        ) {
          // Validate sender is a member of the room before relaying WebRTC signaling
          const client = clients.get(ws);
          if (!client || !roomId || client.roomId !== roomId) return;
          const { targetUserId, sdp, candidate } = payload || {};
          if (!targetUserId) return;

          sendToUserInRoom(roomId, targetUserId, type, {
            fromUserId: payload?.fromUserId || client.userId,
            targetUserId,
            fromDisplayName: client.displayName,
            fromAvatarUrl: client.avatarUrl,
            sdp,
            candidate,
          });
        } else if (type === 'webrtc:voice_state') {
          const client = clients.get(ws);
          if (!client || !roomId) return;
          const { isMuted, isSpeaking } = payload || {};

          const memberRec = await dynamoStore.get(`ROOM#${roomId}`, `MEMBER#${client.userId}`);
          if (memberRec) {
            const m = memberRec.data as RoomMember;
            await dynamoStore.put({
              ...memberRec,
              data: {
                ...m,
                isMuted: typeof isMuted === 'boolean' ? isMuted : m.isMuted,
                isSpeaking: typeof isSpeaking === 'boolean' ? isSpeaking : m.isSpeaking,
              },
              updatedAt: Date.now(),
            });
          }

          broadcastToRoom(roomId, 'webrtc:voice_state', {
            userId: client.userId,
            fromUserId: client.userId,
            inVoiceChat: true,
            isMuted,
            isSpeaking,
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', async () => {
      const client = clients.get(ws);
      clients.delete(ws);

      if (client && client.roomId) {
        const memberRec = await dynamoStore.get(
          `ROOM#${client.roomId}`,
          `MEMBER#${client.userId}`
        );
        if (memberRec) {
          const m = memberRec.data as RoomMember;
          await dynamoStore.put({
            ...memberRec,
            data: { ...m, inVoiceChat: false, isSpeaking: false },
            updatedAt: Date.now(),
          });
        }
        const fullRoom = await getFullRoomDetails(client.roomId);
        broadcastToRoom(client.roomId, 'webrtc:user_left_vc', {
          userId: client.userId,
          members: fullRoom?.members || [],
        });
      }
    });
  });

  // ==========================================================================
  // 10. VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // ==========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`JamTogether server (HTTP + WebSocket + DynamoDB) listening on port ${PORT}`);
    // Ensure all existing user avatars are perpetually persisted in Base64
    migrateExistingUsersAvatarsToBase64().then((count) => {
      if (count > 0) {
        console.log(`[JamTogether] Migrated ${count} user avatars to Base64 in DynamoDB store.`);
      }
    }).catch((err) => {
      console.warn('[JamTogether] Avatar migration notice:', err.message);
    });
  });
}

startServer();
