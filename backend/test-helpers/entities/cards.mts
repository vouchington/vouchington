import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'
import { createRandomString } from '../data.mts'

/**
 * Assign a referral program topic to a card topic via topics.referral_program_id.
 * The referralProgramId must be a topic of type 'referral_program'.
 */
export async function assignReferralProgramToCard(
  cardTopicId: string,
  referralProgramId: string,
): Promise<void> {
  await write(sql`
    UPDATE topics
    SET referral_program_id = ${referralProgramId}
    WHERE id = ${cardTopicId}
  `)
}

/**
 * Insert a test card topic
 */
export async function insertTestCard(data: {
  name?: string
  createdById: string
}): Promise<string> {
  const slug = `card-${createRandomString(10)}`
  const name = data.name || `Test Card ${createRandomString(8)}`
  const topicId = await insertTestTopic({
    name,
    slug,
    createdById: data.createdById,
    topicType: 'card',
  })

  // Insert into topics__cards table
  await write(sql`
    INSERT INTO topics__cards (topic_id)
    VALUES (${topicId})
  `)

  return topicId
}

/**
 * Insert a test referral program topic
 */
export async function insertTestReferralProgram(data: {
  createdById: string
  name?: string
}): Promise<string> {
  const suffix = createRandomString(10)
  const name = data.name || `Referral Program ${suffix}`
  const topicId = await insertTestTopic({
    name,
    slug: `rp-${suffix}`,
    createdById: data.createdById,
    topicType: 'referral_program',
  })

  // Insert into topics__referral_programs table to satisfy FK constraint
  await write(sql`
    INSERT INTO topics__referral_programs (topic_id, enabled_at)
    VALUES (${topicId}, CURRENT_TIMESTAMP)
    ON CONFLICT (topic_id) DO NOTHING
  `)

  return topicId
}
