import 'dotenv/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'JamTogether_';
const TABLE_NAME = `${TABLE_PREFIX}CoreTable`;

async function main() {
  console.log('--- JamTogether AWS DynamoDB Provisioning ---');
  console.log(`Region: ${REGION}`);
  console.log(`Target Table Name: ${TABLE_NAME}\n`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: Missing AWS credentials in .env file.');
    console.error('Please add the following to your .env file:');
    console.error('  AWS_REGION="us-east-1"');
    console.error('  AWS_ACCESS_KEY_ID="your-access-key-id"');
    console.error('  AWS_SECRET_ACCESS_KEY="your-secret-access-key"\n');
    process.exit(1);
  }

  const client = new DynamoDBClient({
    region: REGION,
    ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
  });

  try {
    console.log(`🔍 Checking if table "${TABLE_NAME}" already exists...`);
    const desc = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`✅ Table "${TABLE_NAME}" already exists (Status: ${desc.Table?.TableStatus}).`);
    console.log('Your JamTogether backend is ready to use DynamoDB!');
    return;
  } catch (err: any) {
    if (err.name !== 'ResourceNotFoundException') {
      console.error('❌ Error checking DynamoDB table:', err.message);
      process.exit(1);
    }
  }

  console.log(`🚀 Creating table "${TABLE_NAME}" with On-Demand billing (Pay-Per-Request)...`);

  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
      })
    );

    console.log(`⏳ Table creation requested. Waiting for table to become ACTIVE...`);
    let active = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const desc = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (desc.Table?.TableStatus === 'ACTIVE') {
        active = true;
        break;
      }
      process.stdout.write('.');
    }

    if (active) {
      console.log(`\n🎉 SUCCESS! DynamoDB table "${TABLE_NAME}" is ACTIVE and ready!`);
      console.log('Now start your server with `npm run dev` and it will automatically use DynamoDB.');
    } else {
      console.log(`\n⚠️ Table was requested, but taking longer to become ACTIVE. Check your AWS Console.`);
    }
  } catch (err: any) {
    if (err instanceof ResourceInUseException) {
      console.log(`✅ Table "${TABLE_NAME}" is already created.`);
    } else {
      console.error('❌ Failed to create table:', err.message);
    }
  }
}

main();
