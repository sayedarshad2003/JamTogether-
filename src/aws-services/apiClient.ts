import {
  UserProfile,
  JamRoom,
  YouTubeTrack,
  PlaybackState,
  ChatMessage,
  Friendship,
  ListeningHistoryEntry,
  UserPlaylist,
} from '../types/jam.ts';

const TOKEN_STORAGE_KEY = 'jamtogether_cognito_token';
const CURRENT_USER_KEY = 'jamtogether_current_user';
const LOCAL_ROOMS_KEY = 'jamtogether_local_rooms';
const LOCAL_HISTORY_KEY = 'jamtogether_local_history';
const LOCAL_PLAYLISTS_KEY = 'jamtogether_local_playlists';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export const STARTER_TRACKS: YouTubeTrack[] = [
  {
    videoId: 'sCNlt5nvSI8',
    title: 'FKJ & Masego — Tadow (Official Live Studio Session)',
    channelTitle: 'Fkj',
    thumbnailUrl: 'https://i.ytimg.com/vi/sCNlt5nvSI8/hqdefault.jpg',
    durationSec: 482,
    durationFormatted: '08:02',
  },
  {
    videoId: 'qebVUb_cM_E',
    title: 'Khruangbin — NPR Music Tiny Desk Concert',
    channelTitle: 'NPR Music',
    thumbnailUrl: 'https://i.ytimg.com/vi/qebVUb_cM_E/hqdefault.jpg',
    durationSec: 925,
    durationFormatted: '15:25',
  },
  {
    videoId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio — beats to relax/study to',
    channelTitle: 'Lofi Girl',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    durationSec: 3600,
    durationFormatted: 'LIVE',
  },
  {
    videoId: '4xDzrJKXOOY',
    title: 'Synthwave Radio — ChillSynth / Retro Future Beats',
    channelTitle: 'Lofi Girl Synthwave',
    thumbnailUrl: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    durationSec: 3600,
    durationFormatted: 'LIVE',
  },
  {
    videoId: '5qap5aO4i9A',
    title: 'Chillhop Essentials — Late Night Instrumental Mix',
    channelTitle: 'Chillhop Music',
    thumbnailUrl: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    durationSec: 2140,
    durationFormatted: '35:40',
  },
  {
    videoId: 'c0-hvjV2A5Y',
    title: 'Fred again.. — Boiler Room: London Live Set',
    channelTitle: 'Boiler Room',
    thumbnailUrl: 'https://i.ytimg.com/vi/c0-hvjV2A5Y/hqdefault.jpg',
    durationSec: 4110,
    durationFormatted: '68:30',
  },
];

function getInitialRooms(): JamRoom[] {
  return [
    {
      roomId: 'room_fkj_masego',
      roomCode: 'FKJ99',
      name: 'FKJ & Masego Lounge',
      description: 'Groovy neo-soul, saxophone improvisations, and smooth beats.',
      genreTag: 'Electronic / Soul',
      isPrivate: false,
      hostUserId: 'usr_g_78ed7f0b',
      hostUsername: 'arshadsayed232',
      hostAvatarUrl:
        'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
      activeMemberCount: 1,
      createdAt: Date.now() - 3600000,
      playback: {
        roomId: 'room_fkj_masego',
        videoId: STARTER_TRACKS[0].videoId,
        track: STARTER_TRACKS[0],
        status: 'playing',
        positionSec: 45,
        serverTimestamp: Date.now(),
        initiatedByUserId: 'usr_g_78ed7f0b',
        initiatedByUsername: 'arshadsayed232',
        historyIndex: 0,
      },
      queue: [
        {
          itemId: 'q_1',
          roomId: 'room_fkj_masego',
          orderIndex: 0,
          track: STARTER_TRACKS[0],
          addedByUserId: 'usr_g_78ed7f0b',
          addedByUsername: 'arshadsayed232',
          addedByAvatar:
            'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
          addedAt: Date.now() - 3600000,
          upvotes: [],
        },
        {
          itemId: 'q_2',
          roomId: 'room_fkj_masego',
          orderIndex: 1,
          track: STARTER_TRACKS[1],
          addedByUserId: 'usr_g_78ed7f0b',
          addedByUsername: 'arshadsayed232',
          addedByAvatar:
            'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
          addedAt: Date.now() - 3500000,
          upvotes: [],
        },
      ],
      members: [
        {
          roomId: 'room_fkj_masego',
          userId: 'usr_g_78ed7f0b',
          username: 'arshadsayed232',
          displayName: 'Arshad Sayed',
          avatarUrl:
            'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
          role: 'host',
          isOnline: true,
          inVoiceChat: false,
          isMuted: false,
          isSpeaking: false,
          joinedAt: Date.now() - 3600000,
        },
      ],
      messages: [
        {
          messageId: 'msg_1',
          roomId: 'room_fkj_masego',
          userId: 'usr_g_78ed7f0b',
          username: 'arshadsayed232',
          displayName: 'Arshad Sayed',
          avatarUrl:
            'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
          content: 'Welcome to JamTogether! Queue your favorite tracks and enjoy.',
          type: 'text',
          timestamp: Date.now() - 1800000,
          reactions: {},
        },
      ],
    },
    {
      roomId: 'room_lofi_study',
      roomCode: 'LOFI1',
      name: 'Lofi Study & Code Chill',
      description: 'Calm lo-fi hip hop instrumentals to study, relax, and code.',
      genreTag: 'Lo-Fi / Chillhop',
      isPrivate: false,
      hostUserId: 'host_maya',
      hostUsername: 'maya_beats',
      hostAvatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=maya',
      activeMemberCount: 1,
      createdAt: Date.now() - 7200000,
      playback: {
        roomId: 'room_lofi_study',
        videoId: STARTER_TRACKS[2].videoId,
        track: STARTER_TRACKS[2],
        status: 'playing',
        positionSec: 120,
        serverTimestamp: Date.now(),
        initiatedByUserId: 'host_maya',
        initiatedByUsername: 'maya_beats',
        historyIndex: 0,
      },
      queue: [],
      members: [],
      messages: [],
    },
    {
      roomId: 'room_synthwave',
      roomCode: 'NEON8',
      name: 'Synthwave Night Ride',
      description: 'Retro synth, cyber vibes, and 80s inspired electronic melodies.',
      genreTag: 'Synthwave / Electronic',
      isPrivate: false,
      hostUserId: 'host_neon',
      hostUsername: 'neon_rider',
      hostAvatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=neon',
      activeMemberCount: 1,
      createdAt: Date.now() - 10800000,
      playback: {
        roomId: 'room_synthwave',
        videoId: STARTER_TRACKS[3].videoId,
        track: STARTER_TRACKS[3],
        status: 'playing',
        positionSec: 60,
        serverTimestamp: Date.now(),
        initiatedByUserId: 'host_neon',
        initiatedByUsername: 'neon_rider',
        historyIndex: 0,
      },
      queue: [],
      members: [],
      messages: [],
    },
  ];
}

function handleOfflineFallback<T>(endpoint: string, options: RequestInit = {}): T {
  const method = (options.method || 'GET').toUpperCase();
  let body: any = {};
  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      // ignore
    }
  }

  // 1. Guest Auth
  if (endpoint === '/api/auth/guest') {
    const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
    const name = body.displayName?.trim() || `Guest_${guestId.substring(6)}`;
    const user: UserProfile = {
      userId: guestId,
      username: name.toLowerCase().replace(/[^a-z0-9_]/g, '') || guestId,
      displayName: name,
      email: `${guestId}@jamtogether.local`,
      avatarUrl: body.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
      avatarBase64: body.avatarUrl || '',
      bio: 'Jamming as guest listener on JamTogether.',
      favoriteGenres: ['Electronic', 'Indie', 'Lo-Fi'],
      status: 'online',
      isGuest: true,
      authProvider: 'guest',
      createdAt: Date.now(),
    };
    const token = 'local_guest_token_' + Date.now();
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    setStoredToken(token);
    return { user, token } as any;
  }

  // 2. Google Auth
  if (endpoint === '/api/auth/google') {
    const email = (body.email || 'user@gmail.com').trim().toLowerCase();
    const gId = 'usr_g_' + Math.random().toString(36).substring(2, 9);
    const user: UserProfile = {
      userId: gId,
      username: email.split('@')[0],
      displayName: body.name || body.displayName || email.split('@')[0],
      email: email,
      avatarUrl:
        body.picture ||
        body.avatarUrl ||
        'https://lh3.googleusercontent.com/a/ACg8ocJz0XGqRTrauOla5QWasniWB6ZpKvXLw9SJwdR9IoLMXxK2P03yCw=s96-c',
      avatarBase64: body.picture || body.avatarUrl || '',
      bio: 'Music enthusiast jamming on JamTogether.',
      favoriteGenres: ['Electronic', 'Indie', 'Pop'],
      status: 'online',
      isGuest: false,
      authProvider: 'google',
      createdAt: Date.now(),
    };
    const token = 'local_google_token_' + Date.now();
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    setStoredToken(token);

    try {
      let saved = JSON.parse(localStorage.getItem('jamtogether_saved_google_accounts') || '[]');
      if (!Array.isArray(saved)) saved = [];
      saved = saved.filter((s: any) => s.email?.toLowerCase() !== email);
      saved.unshift(user);
      localStorage.setItem('jamtogether_saved_google_accounts', JSON.stringify(saved));
    } catch {
      // ignore
    }

    return { user, token } as any;
  }

  // 3. Current User (/api/auth/me)
  if (endpoint === '/api/auth/me') {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    if (stored) {
      try {
        const user = JSON.parse(stored);
        return { user } as any;
      } catch {
        // ignore
      }
    }
    throw new Error('Not authenticated');
  }

  // 4. Profile update (/api/auth/profile)
  if (endpoint === '/api/auth/profile') {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    let user = stored ? JSON.parse(stored) : {};
    user = {
      ...user,
      displayName: body.displayName ?? user.displayName,
      bio: body.bio ?? user.bio,
      avatarUrl: body.avatarUrl ?? user.avatarUrl,
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return { user } as any;
  }

  // 5. Logout (/api/auth/logout)
  if (endpoint === '/api/auth/logout') {
    localStorage.removeItem(CURRENT_USER_KEY);
    setStoredToken(null);
    return { ok: true } as any;
  }

  // 6. Google Config & Accounts
  if (endpoint.startsWith('/api/auth/google/config')) {
    return {
      clientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '',
      isConfigured: false,
    } as any;
  }
  if (endpoint === '/api/auth/google/accounts') {
    try {
      const accounts = JSON.parse(localStorage.getItem('jamtogether_saved_google_accounts') || '[]');
      return { accounts } as any;
    } catch {
      return { accounts: [] } as any;
    }
  }

  // 7. Dashboard (/api/dashboard)
  if (endpoint === '/api/dashboard') {
    let localRooms: JamRoom[] = [];
    try {
      const stored = localStorage.getItem(LOCAL_ROOMS_KEY);
      localRooms = stored ? JSON.parse(stored) : getInitialRooms();
    } catch {
      localRooms = getInitialRooms();
    }
    localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));

    let currentUser: UserProfile | null = null;
    try {
      const storedUser = localStorage.getItem(CURRENT_USER_KEY);
      if (storedUser) currentUser = JSON.parse(storedUser);
    } catch {
      currentUser = null;
    }

    const myCreatedRooms = currentUser
      ? localRooms.filter((r) => r.hostUserId === currentUser?.userId)
      : [];

    let history: ListeningHistoryEntry[] = [];
    try {
      const storedH = localStorage.getItem(LOCAL_HISTORY_KEY);
      history = storedH ? JSON.parse(storedH) : [];
    } catch {
      history = [];
    }

    let userPlaylists: UserPlaylist[] = [];
    try {
      const storedP = localStorage.getItem(LOCAL_PLAYLISTS_KEY);
      userPlaylists = storedP ? JSON.parse(storedP) : [];
    } catch {
      userPlaylists = [];
    }

    return {
      rooms: localRooms,
      myCreatedRooms,
      recentlyJoinedRooms: [],
      friends: [],
      allUsers: currentUser ? [currentUser] : [],
      history,
      userPlaylists,
    } as any;
  }

  // 8. Rooms List & Create (/api/rooms)
  if (endpoint === '/api/rooms') {
    if (method === 'POST') {
      let localRooms: JamRoom[] = [];
      try {
        localRooms = JSON.parse(localStorage.getItem(LOCAL_ROOMS_KEY) || '[]');
      } catch {
        localRooms = getInitialRooms();
      }

      let currentUser: UserProfile | null = null;
      try {
        const storedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (storedUser) currentUser = JSON.parse(storedUser);
      } catch {
        // ignore
      }

      const initialTrack =
        STARTER_TRACKS.find((t) => t.videoId === body.initialVideoId) || STARTER_TRACKS[0];
      const newRoom: JamRoom = {
        roomId: 'jam_' + Math.random().toString(36).substring(2, 8),
        roomCode: Math.random().toString(36).substring(2, 6).toUpperCase(),
        name: body.name || 'My Jam Session',
        description: body.description || '',
        genreTag: body.genreTag || 'Electronic / Indie',
        isPrivate: Boolean(body.isPrivate),
        hostUserId: currentUser?.userId || 'guest_host',
        hostUsername: currentUser?.username || 'host',
        hostAvatarUrl: currentUser?.avatarUrl || '',
        activeMemberCount: 1,
        createdAt: Date.now(),
        playback: {
          roomId: '',
          videoId: initialTrack.videoId,
          track: initialTrack,
          status: 'playing',
          positionSec: 0,
          serverTimestamp: Date.now(),
          initiatedByUserId: currentUser?.userId || 'guest_host',
          initiatedByUsername: currentUser?.username || 'host',
          historyIndex: 0,
        },
        queue: [
          {
            itemId: 'q_' + Date.now(),
            roomId: '',
            orderIndex: 0,
            track: initialTrack,
            addedByUserId: currentUser?.userId || 'guest_host',
            addedByUsername: currentUser?.username || 'host',
            addedByAvatar: currentUser?.avatarUrl || '',
            addedAt: Date.now(),
            upvotes: [],
          },
        ],
        members: currentUser
          ? [
              {
                roomId: '',
                userId: currentUser.userId,
                username: currentUser.username,
                displayName: currentUser.displayName,
                avatarUrl: currentUser.avatarUrl,
                role: 'host',
                isOnline: true,
                inVoiceChat: false,
                isMuted: false,
                isSpeaking: false,
                joinedAt: Date.now(),
              },
            ]
          : [],
        messages: [],
      };
      newRoom.playback.roomId = newRoom.roomId;
      if (newRoom.queue && newRoom.queue[0]) newRoom.queue[0].roomId = newRoom.roomId;
      if (newRoom.members && newRoom.members[0]) newRoom.members[0].roomId = newRoom.roomId;

      localRooms.unshift(newRoom);
      localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));
      return { room: newRoom } as any;
    }
  }

  // 9. Single Room & Playback (/api/rooms/:roomId)
  const roomMatch = endpoint.match(/^\/api\/rooms\/([^/]+)(\/(playback|queue|chat))?$/);
  if (roomMatch) {
    const targetRoomId = roomMatch[1];
    const subAction = roomMatch[3];

    let localRooms: JamRoom[] = [];
    try {
      localRooms = JSON.parse(localStorage.getItem(LOCAL_ROOMS_KEY) || '[]');
    } catch {
      localRooms = getInitialRooms();
    }
    const room = localRooms.find((r) => r.roomId === targetRoomId) || getInitialRooms()[0];
    if (!room.queue) room.queue = [];
    if (!room.messages) room.messages = [];
    if (!room.members) room.members = [];

    if (!subAction) {
      return { room } as any;
    }

    if (subAction === 'playback' && method === 'POST') {
      if (body.action === 'selectTrack' && body.track) {
        room.playback.videoId = body.track.videoId;
        room.playback.track = body.track;
        room.playback.status = 'playing';
        room.playback.positionSec = 0;
        room.playback.serverTimestamp = Date.now();
      } else if (body.action === 'play') {
        room.playback.status = 'playing';
        room.playback.serverTimestamp = Date.now();
      } else if (body.action === 'pause') {
        room.playback.status = 'paused';
        if (typeof body.positionSec === 'number') room.playback.positionSec = body.positionSec;
        room.playback.serverTimestamp = Date.now();
      } else if (body.action === 'seek') {
        if (typeof body.positionSec === 'number') room.playback.positionSec = body.positionSec;
        room.playback.serverTimestamp = Date.now();
      }
      localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));
      return { playback: room.playback } as any;
    }

    if (subAction === 'queue') {
      if (method === 'POST') {
        const item = {
          itemId: 'q_' + Date.now(),
          roomId: targetRoomId,
          orderIndex: room.queue.length,
          track: body.track || STARTER_TRACKS[0],
          addedByUserId: body.userId || 'user',
          addedByUsername: body.username || 'user',
          addedByAvatar: body.avatarUrl || '',
          addedAt: Date.now(),
          upvotes: [],
        };
        room.queue.push(item);
        localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));
        return { queue: room.queue } as any;
      }
      return { queue: room.queue } as any;
    }

    if (subAction === 'chat') {
      if (method === 'POST') {
        const msg: ChatMessage = {
          messageId: 'msg_' + Date.now(),
          roomId: targetRoomId,
          userId: body.userId || 'user',
          username: body.username || 'user',
          displayName: body.displayName || body.username || 'User',
          avatarUrl: body.avatarUrl || '',
          content: body.text || body.content || '',
          type: 'text',
          timestamp: Date.now(),
          reactions: {},
        };
        room.messages.push(msg);
        localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));
        return { message: msg } as any;
      }
      return { messages: room.messages } as any;
    }
  }

  // 10. YouTube Search
  if (endpoint.startsWith('/api/youtube/search')) {
    const url = new URL(endpoint, 'http://localhost');
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const filtered = q
      ? STARTER_TRACKS.filter(
          (t) => t.title.toLowerCase().includes(q) || t.channelTitle.toLowerCase().includes(q)
        )
      : STARTER_TRACKS;
    return {
      items: filtered.length > 0 ? filtered : STARTER_TRACKS,
      source: 'offline-curated',
    } as any;
  }

  // 11. Playlists
  if (endpoint.startsWith('/api/playlists')) {
    let playlists: UserPlaylist[] = [];
    try {
      playlists = JSON.parse(localStorage.getItem(LOCAL_PLAYLISTS_KEY) || '[]');
    } catch {
      playlists = [];
    }
    if (method === 'POST') {
      const pl: UserPlaylist = {
        playlistId: 'pl_' + Date.now(),
        userId: body.userId || 'user',
        name: body.name || 'My Playlist',
        description: body.description || '',
        trackCount: Array.isArray(body.tracks) ? body.tracks.length : 0,
        thumbnailUrl: body.tracks?.[0]?.thumbnailUrl,
        tracks: body.tracks || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      playlists.unshift(pl);
      localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(playlists));
      return { playlist: pl } as any;
    }
    return { playlists } as any;
  }

  // 12. Delete Data
  if (endpoint === '/api/user/delete-data') {
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    localStorage.removeItem(LOCAL_PLAYLISTS_KEY);
    return { success: true } as any;
  }
  if (endpoint === '/api/user/me') {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    localStorage.removeItem(LOCAL_PLAYLISTS_KEY);
    setStoredToken(null);
    return { success: true } as any;
  }

  return {} as any;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const targetUrl = apiBaseUrl ? `${apiBaseUrl}${endpoint}` : endpoint;

  try {
    const res = await fetch(targetUrl, {
      ...options,
      headers,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data as T;
    }

    // If server returned 404 or backend unavailable, fall back seamlessly
    if (res.status === 404 || res.status === 502 || res.status === 503) {
      return handleOfflineFallback<T>(endpoint, options);
    }

    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed with status ${res.status}`);
  } catch (err: any) {
    // If network error (backend not reachable), fall back seamlessly
    if (
      err.name === 'TypeError' ||
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('status 404')
    ) {
      return handleOfflineFallback<T>(endpoint, options);
    }
    throw err;
  }
}
