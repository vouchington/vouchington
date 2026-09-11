import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'
import { createRandomString } from '../data.mts'

/**
 * Insert a test rewards program topic
 */
export async function insertTestRewardsProgram(data: {
  name?: string
  createdById: string
}): Promise<string> {
  const slug = `rewards-program-${createRandomString(10)}`
  const name = data.name || `Test Rewards Program ${createRandomString(8)}`
  const topicId = await insertTestTopic({
    name,
    slug,
    createdById: data.createdById,
  })

  await write(sql`
    INSERT INTO topics__rewards_programs (topic_id)
    VALUES (${topicId})
  `)

  return topicId
}
