import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
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
 * JamTogether Data Layer (AWS DynamoDB Engine)
 *
 * Persists application state directly to Amazon DynamoDB in real-time
 * with high-speed local fallback cache at `.data/dynamodb-store.json`.
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
   * Deletes all records from memory, local disk, and the remote AWS DynamoDB table.
   */
  async clearAll(): Promise<number> {
    const totalLocal = this.items.size;
    this.items.clear();
    this.saveToDisk();

    let remoteCount = 0;
    if (docClient) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            ProjectionExpression: 'PK, SK',
          })
        );
        const items = scanRes.Items || [];
        for (const item of items) {
          try {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: item.PK, SK: item.SK },
              })
            );
            remoteCount++;
          } catch {
            // continue
          }
        }
      } catch (e) {
        console.warn('Failed remote DynamoDB complete table wipe:', (e as Error).message);
      }
    }
    return Math.max(totalLocal, remoteCount);
  }

  /**
   * Wipes all records of a specific entity type from memory, disk, and AWS DynamoDB.
   */
  async wipeByEntity(entityType: DynamoRecord['entityType']): Promise<number> {
    let count = 0;
    const toDeleteRemote: { PK: string; SK: string }[] = [];
    for (const [key, item] of this.items.entries()) {
      if (item.entityType === entityType) {
        toDeleteRemote.push({ PK: item.PK, SK: item.SK });
        this.items.delete(key);
        count++;
      }
    }
    this.saveToDisk();

    if (docClient) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'entityType = :eType',
            ExpressionAttributeValues: { ':eType': entityType },
            ProjectionExpression: 'PK, SK',
          })
        );
        const remoteItems = scanRes.Items || [];
        for (const it of remoteItems) {
          if (!toDeleteRemote.some((x) => x.PK === it.PK && x.SK === it.SK)) {
            toDeleteRemote.push({ PK: it.PK, SK: it.SK });
            count++;
          }
        }

        for (const key of toDeleteRemote) {
          try {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLE_NAME,
                Key: key,
              })
            );
          } catch {}
        }
      } catch (e) {
        console.warn(`Failed remote DynamoDB wipe for entity ${entityType}:`, (e as Error).message);
      }
    }
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
