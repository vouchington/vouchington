import { randomUUID } from 'node:crypto'
import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
  waitUntilTableExists,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb'

// Reads the endpoint and keys that `vitest.setup.aws-emulator.mts` exported, independently of the
// application's clients, so a test can seed the table the code under test reads.
let client: DynamoDBClient | undefined

function emulatorDynamoDb(): DynamoDBClient {
  client ??= new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-west-2' })
  return client
}

/**
 * A table owned by one test file, for code that reads its table name from the environment. The
 * emulator takes a few seconds to make a table ACTIVE, so create it once in `beforeAll` with a
 * hook timeout above that.
 */
export async function createOwnedDynamoDbTable(label: string, hashKey: string): Promise<string> {
  const TableName = `test-${label}-${randomUUID()}`
  await emulatorDynamoDb().send(
    new CreateTableCommand({
      TableName,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: hashKey, KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: hashKey, AttributeType: 'S' }],
    }),
  )
  await waitUntilTableExists({ client: emulatorDynamoDb(), maxWaitTime: 30 }, { TableName })
  return TableName
}

export async function putDynamoDbItem(
  TableName: string,
  Item: Record<string, AttributeValue>,
): Promise<void> {
  await emulatorDynamoDb().send(new PutItemCommand({ TableName, Item }))
}
