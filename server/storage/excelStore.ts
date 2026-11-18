import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { DynamoRecord } from '../aws/dynamodb.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const EXCEL_FILE_PATH = path.join(DATA_DIR, 'jamtogether_database.xlsx');

/**
 * Ensures data directory exists.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Saves all records from the file-based store into an organized Microsoft Excel (.xlsx) workbook.
 * Creates dedicated sheets for Users, JamRooms, RoomMembers, MusicQueue, PlaybackState, ChatMessages, History, and Friendships.
 */
export function exportToExcel(records: DynamoRecord[]): string {
  try {
    ensureDataDir();

    const usersRows: any[] = [];
    const roomsRows: any[] = [];
    const membersRows: any[] = [];
    const queueRows: any[] = [];
    const playbackRows: any[] = [];
    const messagesRows: any[] = [];
    const historyRows: any[] = [];
    const friendshipRows: any[] = [];
    const playlistsRows: any[] = [];

    for (const rec of records) {
      const d = rec.data || {};
      const updatedStr = new Date(rec.updatedAt || Date.now()).toISOString();

      switch (rec.entityType) {
        case 'USER':
          usersRows.push({
            'User ID': d.userId || '',
            Username: d.username || '',
            'Display Name': d.displayName || '',
            Email: d.email || '',
            'Is Guest': d.isGuest ? 'Yes' : 'No',
            'Auth Provider': d.authProvider || 'guest',
            Status: d.status || 'online',
            'Avatar URL': d.avatarUrl || '',
            'Avatar (Base64)':
              d.avatarBase64 || (d.avatarUrl && d.avatarUrl.startsWith('data:') ? d.avatarUrl : '') || '',
            'Current Room ID': d.currentRoomId || '',
            'Created At': d.createdAt ? new Date(d.createdAt).toISOString() : updatedStr,
            'Last Updated': updatedStr,
          });
          break;

        case 'ROOM':
          roomsRows.push({
            'Room ID': d.roomId || '',
            'Room Code': d.roomCode || '',
            'Room Name': d.name || '',
            Description: d.description || '',
            Genre: d.genreTag || '',
            'Is Private': d.isPrivate ? 'Yes' : 'No',
            'Host User ID': d.hostUserId || '',
            'Host Username': d.hostUsername || '',
            'Created At': d.createdAt ? new Date(d.createdAt).toISOString() : updatedStr,
            'Last Updated': updatedStr,
          });
          break;

        case 'MEMBER':
          membersRows.push({
            'Room ID': d.roomId || '',
            'User ID': d.userId || '',
            Username: d.username || '',
            'Display Name': d.displayName || '',
            'Is Host': d.isHost ? 'Yes' : 'No',
            'In Voice Chat': d.inVoiceChat ? 'Yes' : 'No',
            'Is Muted': d.isMuted ? 'Yes' : 'No',
            'Joined At': d.joinedAt ? new Date(d.joinedAt).toISOString() : updatedStr,
          });
          break;

        case 'QUEUE':
          queueRows.push({
            'Queue Item ID': d.itemId || '',
            'Room ID': d.roomId || '',
            'Order Index': d.orderIndex || 0,
            'Video ID': d.track?.videoId || '',
            'Song Title': d.track?.title || '',
            'Artist / Channel': d.track?.channelTitle || '',
            Duration: d.track?.durationFormatted || '',
            'Added By (User)': d.addedByUsername || '',
            'Added At': d.addedAt ? new Date(d.addedAt).toISOString() : updatedStr,
          });
          break;

        case 'PLAYBACK':
          playbackRows.push({
            'Room ID': d.roomId || '',
            'Playback Status': d.status || 'stopped',
            'Video ID': d.videoId || '',
            'Song Title': d.track?.title || '',
            'Artist / Channel': d.track?.channelTitle || '',
            'Position (Sec)': d.positionSec || 0,
            'Last Updated': updatedStr,
          });
          break;

        case 'MESSAGE':
          messagesRows.push({
            'Message ID': d.messageId || '',
            'Room ID': d.roomId || '',
            'Sender User ID': d.userId || '',
            'Sender Display Name': d.displayName || '',
            'Message Content': d.text || '',
            'Sent At': d.timestamp ? new Date(d.timestamp).toISOString() : updatedStr,
          });
          break;

        case 'HISTORY':
          historyRows.push({
            'History Entry ID': d.entryId || '',
            'User ID': d.userId || '',
            'Room ID': d.roomId || '',
            'Room Name': d.roomName || '',
            'Video ID': d.track?.videoId || '',
            'Song Title': d.track?.title || '',
            'Played At': d.playedAt ? new Date(d.playedAt).toISOString() : updatedStr,
          });
          break;

        case 'FRIENDSHIP':
          friendshipRows.push({
            'User ID': d.userId || '',
            'Friend User ID': d.friendId || '',
            'Friend Username': d.friendUsername || '',
            'Friend Display Name': d.friendDisplayName || '',
            Status: d.status || 'accepted',
            'Last Updated': updatedStr,
          });
          break;

        case 'PLAYLIST':
          playlistsRows.push({
            'Playlist ID': d.playlistId || '',
            'User ID': d.userId || '',
            'Playlist Name': d.name || '',
            'Track Count': d.trackCount || (Array.isArray(d.tracks) ? d.tracks.length : 0),
            'Source URL': d.sourceUrl || '',
            Description: d.description || '',
            'Created At': d.createdAt ? new Date(d.createdAt).toISOString() : updatedStr,
            'Last Updated': updatedStr,
          });
          break;
      }
    }

    const workbook = XLSX.utils.book_new();

    // Helper to create sheet even if empty (with header structure)
    const appendSheet = (data: any[], defaultColumns: string[], sheetName: string) => {
      const sheetData = data.length > 0 ? data : [defaultColumns.reduce((acc, col) => ({ ...acc, [col]: '' }), {})];
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    };

    appendSheet(
      usersRows,
      [
        'User ID',
        'Username',
        'Display Name',
        'Email',
        'Is Guest',
        'Auth Provider',
        'Status',
        'Avatar URL',
        'Avatar (Base64)',
        'Created At',
      ],
      'Users'
    );

    appendSheet(
      roomsRows,
      ['Room ID', 'Room Code', 'Room Name', 'Description', 'Genre', 'Is Private', 'Host User ID', 'Host Username', 'Created At'],
      'JamRooms'
    );

    appendSheet(
      queueRows,
      ['Queue Item ID', 'Room ID', 'Order Index', 'Video ID', 'Song Title', 'Artist / Channel', 'Duration', 'Added By (User)', 'Added At'],
      'MusicQueue'
    );

    appendSheet(
      membersRows,
      ['Room ID', 'User ID', 'Username', 'Display Name', 'Is Host', 'In Voice Chat', 'Is Muted', 'Joined At'],
      'RoomMembers'
    );

    appendSheet(
      playbackRows,
      ['Room ID', 'Playback Status', 'Video ID', 'Song Title', 'Artist / Channel', 'Position (Sec)', 'Last Updated'],
      'PlaybackState'
    );

    appendSheet(
      messagesRows,
      ['Message ID', 'Room ID', 'Sender User ID', 'Sender Display Name', 'Message Content', 'Sent At'],
      'ChatMessages'
    );

    appendSheet(
      historyRows,
      ['History Entry ID', 'User ID', 'Room ID', 'Room Name', 'Video ID', 'Song Title', 'Played At'],
      'ListeningHistory'
    );

    appendSheet(
      friendshipRows,
      ['User ID', 'Friend User ID', 'Friend Username', 'Friend Display Name', 'Status', 'Last Updated'],
      'Friendships'
    );

    appendSheet(
      playlistsRows,
      ['Playlist ID', 'User ID', 'Playlist Name', 'Track Count', 'Source URL', 'Description', 'Created At'],
      'UserPlaylists'
    );

    XLSX.writeFile(workbook, EXCEL_FILE_PATH);
    return EXCEL_FILE_PATH;
  } catch (err) {
    console.error('Failed to export store to Excel database:', err);
    return EXCEL_FILE_PATH;
  }
}

/**
 * Returns the path to the Excel database.
 */
export function getExcelFilePath(): string {
  return EXCEL_FILE_PATH;
}

/**
 * Returns statistics about the Excel database.
 */
export function getExcelStats(): {
  exists: boolean;
  filePath: string;
  fileSizeBytes: number;
  lastModified: string | null;
  sheetNames: string[];
} {
  const exists = fs.existsSync(EXCEL_FILE_PATH);
  if (!exists) {
    return {
      exists: false,
      filePath: EXCEL_FILE_PATH,
      fileSizeBytes: 0,
      lastModified: null,
      sheetNames: [],
    };
  }

  const stat = fs.statSync(EXCEL_FILE_PATH);
  let sheetNames: string[] = [];
  try {
    const wb = XLSX.readFile(EXCEL_FILE_PATH, { bookSheets: true });
    sheetNames = wb.SheetNames || [];
  } catch {
    // ignore
  }

  return {
    exists: true,
    filePath: EXCEL_FILE_PATH,
    fileSizeBytes: stat.size,
    lastModified: stat.mtime.toISOString(),
    sheetNames,
  };
}
