import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'
import { createRandomString } from '../data.mts'

/**
 * Insert a test rewards program status topic
 */
export async function insertTestRewardsProgramStatus(data: {
  name?: string
  createdById: string
}): Promise<string> {
  const slug = `status-${createRandomString(10)}`
  const name = data.name || `Test Status ${createRandomString(8)}`
  const topicId = await insertTestTopic({
    name,
    slug,
    createdById: data.createdById,
  })

  // Insert into topics__rewards_program_statuses table
  await write(sql`
    INSERT INTO topics__rewards_program_statuses (topic_id)
    VALUES (${topicId})
  `)

  return topicId
}
