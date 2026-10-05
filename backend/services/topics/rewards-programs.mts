import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import { assertTopicExists } from './validation.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'

type RewardsProgramAttributes = {
  company_topic_id?: string | null
}

export async function getRewardsProgramAttributes(
  topic: Topic,
): Promise<RewardsProgramAttributes | null> {
  assert(topic.topic_type === 'rewards_program', 400, 'Topic is not a rewards program')

  const { rows } = await read(sql`/* getRewardsProgramAttributes */
    SELECT
      company_topic_id
    FROM rewards_program_topics
    WHERE topic_id = ${topic.id}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function updateRewardsProgramAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: RewardsProgramAttributes,
): Promise<RewardsProgramAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  assert(topic.topic_type === 'rewards_program', 400, 'Topic is not a rewards program')

  const columns: string[] = []
  const values: unknown[] = []

  if ('company_topic_id' in attributes) {
    if (attributes.company_topic_id != null)
      await assertTopicExists(attributes.company_topic_id, 'company_topic_id')
    columns.push('company_topic_id')
    values.push(attributes.company_topic_id ?? null)
  }

  return upsertTopicAttributes<RewardsProgramAttributes>(
    'rewards_program_topics',
    topic.id,
    columns,
    values,
  )
}
