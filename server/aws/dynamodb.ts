import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import { exportToExcel } from '../storage/excelStore.ts';
import {
  UserProfile,
  JamRoom,
  RoomMember,
  QueueItem,
  ChatMessage,
  PlaybackState,
  Friendship,
  ListeningHistoryEntry,
  DynamoDBTableSchemaDoc,
} from '../../src/types/jam.ts';

/**
 * JamTogether Data Layer (File & Excel Database Engine)
 *
 * Persists application state to disk in real-time:
 * 1. Microsoft Excel Workbook (.xlsx) at `data/jamtogether_database.xlsx` with sheets for Users, JamRooms, MusicQueue, etc.
 * 2. High-speed local store at `.data/dynamodb-store.json`.
 * 3. Starts 100% from scratch with no pre-seeded dummy records.
 */

export interface DynamoRecord {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  entityType:
    | 'USER'
    | 'ROOM'
    | 'MEMBER'
    | 'QUEUE'
    | 'MESSAGE'
    | 'PLAYBACK'
    | 'FRIENDSHIP'
    | 'HISTORY'
    | 'PLAYLIST';
  data: any;
  updatedAt: number;
}

const isAwsDynamoConfigured = Boolean(
  (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.DYNAMODB_ENDPOINT
);

const TABLE_NAME = `${process.env.DYNAMODB_TABLE_PREFIX || 'JamTogether_'}CoreTable`;

let docClient: DynamoDBDocumentClient | null = null;
if (isAwsDynamoConfigured) {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
  });
  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

const DATA_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'dynamodb-store.json');

class DynamoDBStore {
  private items: Map<string, DynamoRecord> = new Map();

  constructor() {
    this.loadFromDisk();
    // Initialize empty Excel database if empty
    if (this.items.size === 0) {
      exportToExcel([]);
    }
  }

  private compositeKey(pk: string, sk: string): string {
    return `${pk}||${sk}`;
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(LOCAL_DB_FILE)) {
        const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8').trim().replace(/^\uFEFF/, '');
        if (raw) {
          const parsed: DynamoRecord[] = JSON.parse(raw);
          for (const item of parsed) {
            this.items.set(this.compositeKey(item.PK, item.SK), item);
          }
        }
      }
    } catch (err) {
      console.warn('Initializing fresh local database store:', err);
    }
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const arr = Array.from(this.items.values());
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
      // Sync immediately with Microsoft Excel database
      exportToExcel(arr);
    } catch (err) {
      console.error('Failed to persist database store:', err);
    }
  }

  async put(record: DynamoRecord): Promise<void> {
    this.items.set(this.compositeKey(record.PK, record.SK), record);
    this.saveToDisk();

    if (docClient) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: record,
          })
        );
      } catch (e) {
        console.warn('Remote sync fallback to local store:', (e as Error).message);
      }
    }
  }

  async get(pk: string, sk: string): Promise<DynamoRecord | null> {
    if (docClient) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
          })
        );
        if (res.Item) return res.Item as DynamoRecord;
      } catch (e) {
        // Fallback to local
      }
    }
    return this.items.get(this.compositeKey(pk, sk)) || null;
  }

  async queryByPK(pk: string, skPrefix?: string): Promise<DynamoRecord[]> {
    if (docClient) {
      try {
        const res = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: skPrefix
              ? 'PK = :pk AND begins_with(SK, :skPrefix)'
              : 'PK = :pk',
            ExpressionAttributeValues: skPrefix
              ? { ':pk': pk, ':skPrefix': skPrefix }
              : { ':pk': pk },
          })
        );
        if (res.Items && res.Items.length > 0) {
          return res.Items as DynamoRecord[];
        }
      } catch (e) {
        // Fallback to local
      }
    }

    const results: DynamoRecord[] = [];
    for (const item of this.items.values()) {
      if (item.PK === pk && (!skPrefix || item.SK.startsWith(skPrefix))) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.SK.localeCompare(b.SK));
  }

  async queryByEntity(entityType: DynamoRecord['entityType']): Promise<DynamoRecord[]> {
    const results: DynamoRecord[] = [];
    for (const item of this.items.values()) {
      if (item.entityType === entityType) {
        results.push(item);
      }
    }
    return results;
  }

  async queryByGSI1(gsi1pk: string, gsi1skPrefix?: string): Promise<DynamoRecord[]> {
    const results: DynamoRecord[] = [];
    for (const item of this.items.values()) {
      if (
        item.GSI1PK === gsi1pk &&
        (!gsi1skPrefix || (item.GSI1SK && item.GSI1SK.startsWith(gsi1skPrefix)))
      ) {
        results.push(item);
      }
    }
    return results;
  }

  async delete(pk: string, sk: string): Promise<void> {
    this.items.delete(this.compositeKey(pk, sk));
    this.saveToDisk();

    if (docClient) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
          })
        );
      } catch (e) {
        // Ignore remote error in fallback mode
      }
    }
  }

  getAllRecords(): DynamoRecord[] {
    return Array.from(this.items.values());
  }

  /**
   * Resets database to empty state (scratch).
   */
  clearAll(): void {
    this.items.clear();
    this.saveToDisk();
  }

  /**
   * Wipes all records of a specific entity type.
   */
  wipeByEntity(entityType: DynamoRecord['entityType']): number {
    let count = 0;
    for (const [key, item] of this.items.entries()) {
      if (item.entityType === entityType) {
        this.items.delete(key);
        count++;
      }
    }
    this.saveToDisk();
    return count;
  }
}

export const dynamoStore = new DynamoDBStore();

export const DYNAMODB_ARCHITECTURE_DOCS: DynamoDBTableSchemaDoc[] = [
  {
    tableName: 'Users',
    partitionKey: 'PK (USER#<userId>)',
    sortKey: 'SK (PROFILE)',
    gsi1: 'GSI1PK (USERNAME#<username>) / GSI1SK (EMAIL#<email>)',
    accessPatterns: [
      'GetUserById: GetItem(PK=USER#<id>, SK=PROFILE)',
      'LookupByUsername: Query GSI1(GSI1PK=USERNAME#<username>)',
    ],
    sampleKey: { PK: 'USER#<userId>', SK: 'PROFILE' },
  },
  {
    tableName: 'JamRooms',
    partitionKey: 'PK (ROOM#<roomId>)',
    sortKey: 'SK (METADATA)',
    gsi1: 'GSI1PK (ROOM_CODE#<code_or_public>) / GSI1SK (VISIBILITY#<PUBLIC|PRIVATE>)',
    accessPatterns: [
      'GetRoomMetadata: GetItem(PK=ROOM#<id>, SK=METADATA)',
      'JoinByRoomCode: Query GSI1(GSI1PK=ROOM_CODE#JAM-XXXX)',
    ],
    sampleKey: { PK: 'ROOM#<roomId>', SK: 'METADATA' },
  },
  {
    tableName: 'JamMembers',
    partitionKey: 'PK (ROOM#<roomId>)',
    sortKey: 'SK (MEMBER#<userId>)',
    gsi1: 'GSI1PK (USER#<userId>) / GSI1SK (ROOM#<roomId>)',
    accessPatterns: [
      'ListRoomParticipants: Query(PK=ROOM#<id>, SK begins_with MEMBER#)',
      'ListUserJoinedRooms: Query GSI1(GSI1PK=USER#<id>)',
    ],
    sampleKey: { PK: 'ROOM#<roomId>', SK: 'MEMBER#<userId>' },
  },
  {
    tableName: 'JamQueue',
    partitionKey: 'PK (ROOM#<roomId>)',
    sortKey: 'SK (QUEUE#<paddedOrderIndex>#<itemId>)',
    accessPatterns: [
      'FetchOrderedQueue: Query(PK=ROOM#<id>, SK begins_with QUEUE#)',
      'ReorderTrack: Delete old SK & PutItem with updated zero-padded orderIndex',
    ],
    sampleKey: { PK: 'ROOM#<roomId>', SK: 'QUEUE#000100#<itemId>' },
  },
  {
    tableName: 'JamPlaybackState',
    partitionKey: 'PK (ROOM#<roomId>)',
    sortKey: 'SK (PLAYBACK)',
    accessPatterns: [
      'GetAuthoritativeSync: GetItem(PK=ROOM#<id>, SK=PLAYBACK)',
      'BroadcastSyncMutation: PutItem with serverTimestamp + positionSec',
    ],
    sampleKey: { PK: 'ROOM#<roomId>', SK: 'PLAYBACK' },
  },
  {
    tableName: 'JamMessages',
    partitionKey: 'PK (ROOM#<roomId>)',
    sortKey: 'SK (MSG#<epochTimestamp>#<messageId>)',
    accessPatterns: [
      'LoadRecentRoomChat: Query(PK=ROOM#<id>, SK begins_with MSG#, ScanIndexForward=true)',
      'ToggleEmojiReaction: UpdateItem reactions map on MSG#<ts>#<id>',
    ],
    sampleKey: { PK: 'ROOM#<roomId>', SK: 'MSG#<epoch>#<messageId>' },
  },
  {
    tableName: 'Friendships',
    partitionKey: 'PK (USER#<userId>)',
    sortKey: 'SK (FRIEND#<friendId>)',
    accessPatterns: [
      'ListUserFriendsAndPresence: Query(PK=USER#<id>, SK begins_with FRIEND#)',
      'SendOrAcceptInvite: PutItem bidirectional FRIENDSHIP items',
    ],
    sampleKey: { PK: 'USER#<userId>', SK: 'FRIEND#<friendId>' },
  },
  {
    tableName: 'ListeningHistory',
    partitionKey: 'PK (USER#<userId>)',
    sortKey: 'SK (HISTORY#<epochTimestamp>#<entryId>)',
    accessPatterns: [
      'GetRecentListeningHistory: Query(PK=USER#<id>, SK begins_with HISTORY#, ScanIndexForward=false)',
    ],
    sampleKey: { PK: 'USER#<userId>', SK: 'HISTORY#<epoch>#<entryId>' },
  },
];
