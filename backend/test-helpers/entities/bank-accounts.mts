import { insertTestTopic } from './topics.mts'
import { createRandomString } from '../data.mts'

/**
 * Insert a test bank account topic
 */
export async function insertTestBankAccount(data: {
  name?: string
  createdById: string
}): Promise<string> {
  const slug = `bank-account-${createRandomString(10)}`
  const name = data.name || `Test Bank Account ${createRandomString(8)}`
  return await insertTestTopic({
    name,
    slug,
    createdById: data.createdById,
    topicType: 'bank_account',
  })
}
