import { read } from '@data-stores/psql'
import { FOLLOWER_INBOX_BATCH_SIZE } from '@services/remote-actors'
import {
  REMOTE_FOLLOWER_DIRECTORY_COUNT,
  REMOTE_FOLLOWER_SEED_COUNT,
  REMOTE_FOLLOWER_TABLE_TAG,
  REMOTE_FOLLOWER_TARGET_SPREAD_COUNT,
} from '../seed-data/remote-followers.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'

const { listRemoteFollowerInboxPage } = services
const REMOTE_FOLLOWER_PAGE_LIMIT = FOLLOWER_INBOX_BATCH_SIZE + 1
const LATE_CURSOR_INDEX = REMOTE_FOLLOWER_SEED_COUNT - REMOTE_FOLLOWER_PAGE_LIMIT - 1

export async function runRemoteFollowerScenarios(): Promise<void> {
  await assertRemoteFollowerSeed()
  await runAndCapture('remote-follower-inbox-late-cursor', async () => {
    const page = await listRemoteFollowerInboxPage(
      seedUser.id,
      seedUuid(LATE_CURSOR_INDEX, REMOTE_FOLLOWER_TABLE_TAG),
      REMOTE_FOLLOWER_PAGE_LIMIT,
    )
    if (page.length !== REMOTE_FOLLOWER_PAGE_LIMIT) {
      throw new Error(
        `Expected ${REMOTE_FOLLOWER_PAGE_LIMIT} remote follower candidates after the late cursor, received ${page.length}`,
      )
    }
    return page
  })
}

async function assertRemoteFollowerSeed(): Promise<void> {
  const { rows } = await read<{
    relation_count: string
    directory_count: string
    hostname_link_count: string
    target_count: string
  }>(
    `/* assertRemoteFollowerSeed */
     SELECT
       (SELECT COUNT(*)::text
        FROM relation__remote_actor__follow__user
        WHERE object_id = $1 AND subject_id BETWEEN $2 AND $3) AS relation_count,
       (SELECT COUNT(*)::text
        FROM topics instance_topic
        JOIN topics__fediverse_instances tfi ON tfi.topic_id = instance_topic.id
        WHERE instance_topic.topic_type = 'fediverse_instance'
          AND instance_topic.deleted_at IS NULL
          AND instance_topic.merged_into_topic_id IS NULL
          AND instance_topic.slug LIKE 'remote-follower-directory-%') AS directory_count,
       (SELECT COUNT(*)::text
        FROM remote_actors
        WHERE id BETWEEN $2 AND $3
          AND hostname_id IS NOT NULL) AS hostname_link_count,
       (SELECT COUNT(DISTINCT object_id)::text
        FROM relation__remote_actor__follow__user
        WHERE subject_id BETWEEN $2 AND $3) AS target_count`,
    [
      seedUser.id,
      seedUuid(0, REMOTE_FOLLOWER_TABLE_TAG),
      seedUuid(REMOTE_FOLLOWER_SEED_COUNT - 1, REMOTE_FOLLOWER_TABLE_TAG),
    ],
  )
  if (rows[0]?.relation_count !== String(REMOTE_FOLLOWER_SEED_COUNT)) {
    throw new Error(
      `Expected ${REMOTE_FOLLOWER_SEED_COUNT} remote follower seed rows, received ${rows[0]?.relation_count ?? 'none'}`,
    )
  }
  if (rows[0]?.directory_count !== String(REMOTE_FOLLOWER_DIRECTORY_COUNT)) {
    throw new Error(
      `Expected ${REMOTE_FOLLOWER_DIRECTORY_COUNT} remote follower directories, received ${rows[0]?.directory_count ?? 'none'}`,
    )
  }
  if (rows[0]?.hostname_link_count !== String(REMOTE_FOLLOWER_SEED_COUNT)) {
    throw new Error(
      `Expected ${REMOTE_FOLLOWER_SEED_COUNT} remote follower hostname links, received ${rows[0]?.hostname_link_count ?? 'none'}`,
    )
  }
  if (rows[0]?.target_count !== String(REMOTE_FOLLOWER_TARGET_SPREAD_COUNT + 1)) {
    throw new Error(
      `Expected ${REMOTE_FOLLOWER_TARGET_SPREAD_COUNT + 1} remote follower relation targets, received ${rows[0]?.target_count ?? 'none'}`,
    )
  }
}
