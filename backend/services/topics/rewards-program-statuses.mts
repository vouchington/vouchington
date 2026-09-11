import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import { assertRewardsProgramStatusExists } from './validation.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'

type RewardsProgramStatusAttributes = {
  lifetime_version_id?: string | null
  order_index?: number
}

export async function getRewardsProgramStatusAttributes(
  topic: Topic,
): Promise<RewardsProgramStatusAttributes | null> {
  assert(
    topic.topic_type === 'rewards_program_status',
    400,
    'Topic is not a rewards program status',
  )

  const { rows } = await read(sql`/* getRewardsProgramStatusAttributes */
    SELECT
      lifetime_version_id,
      order_index
    FROM topics__rewards_program_statuses
    WHERE topic_id = ${topic.id}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function updateRewardsProgramStatusAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: RewardsProgramStatusAttributes,
): Promise<RewardsProgramStatusAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  assert(
    topic.topic_type === 'rewards_program_status',
    400,
    'Topic is not a rewards program status',
  )

  const effectiveRewardsProgramId = topic.rewards_program_id ?? null

  const columns: string[] = []
  const values: unknown[] = []

  if ('lifetime_version_id' in attributes) {
    if (attributes.lifetime_version_id != null) {
      const lifetimeStatus = await assertRewardsProgramStatusExists(
        attributes.lifetime_version_id,
        'lifetime_version_id',
      )
      assert(effectiveRewardsProgramId, 422, 'lifetime_version_id requires rewards_program_id')
      assert(
        lifetimeStatus.rewards_program_id === effectiveRewardsProgramId,
        422,
        'lifetime_version_id must reference a status from the same rewards program',
      )
      assert(
        attributes.lifetime_version_id !== topic.id,
        422,
        'lifetime_version_id cannot reference the same rewards program status',
      )
    }
    columns.push('lifetime_version_id')
    values.push(attributes.lifetime_version_id ?? null)
  }
  if ('order_index' in attributes) {
    assert(
      attributes.order_index !== null && attributes.order_index !== undefined,
      422,
      'order_index is required and must be an integer',
    )
    assert(Number.isInteger(attributes.order_index), 422, 'order_index must be an integer')
    columns.push('order_index')
    values.push(attributes.order_index)
  }

  return upsertTopicAttributes<RewardsProgramStatusAttributes>(
    'topics__rewards_program_statuses',
    topic.id,
    columns,
    values,
  )
}
