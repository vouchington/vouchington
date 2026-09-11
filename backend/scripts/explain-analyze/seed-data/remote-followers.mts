import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const REMOTE_FOLLOWER_SEED_COUNT = 100_000
export const REMOTE_FOLLOWER_TABLE_TAG = '19'
export const REMOTE_FOLLOWER_DIRECTORY_COUNT = 1000
export const REMOTE_FOLLOWER_TARGET_SPREAD_COUNT = 1000
const REMOTE_FOLLOWER_HOSTNAME_TABLE_TAG = '1a'
const REMOTE_FOLLOWER_TOPIC_TABLE_TAG = '1b'

export async function seedRemoteFollowers(count = REMOTE_FOLLOWER_SEED_COUNT): Promise<void> {
  console.log(`Seeding ${count} remote ActivityPub followers...`)
  const targetUserId = seedUuid(0, '01')
  await seedRemoteFollowerDirectories()
  await using transaction = await beginTransaction()
  const query = transaction
  for (let start = 0; start < count; start += 1000) {
    const batchSize = Math.min(1000, count - start)
    const actorValues: unknown[] = []
    const actorRows: string[] = []
    const relationValues: unknown[] = []
    const relationRows: string[] = []
    for (let offset = 0; offset < batchSize; offset++) {
      const index = start + offset
      const actorId = seedUuid(index, REMOTE_FOLLOWER_TABLE_TAG)
      const actorUri = `https://remote-follower-${index}.example/users/actor`
      const hostnameId = seedUuid(
        index % REMOTE_FOLLOWER_DIRECTORY_COUNT,
        REMOTE_FOLLOWER_HOSTNAME_TABLE_TAG,
      )
      actorValues.push(
        actorId,
        actorUri,
        `${actorUri}#main-key`,
        'explain-seed-public-key',
        `${actorUri}/inbox`,
        hostnameId,
      )
      const actorBase = actorValues.length - 5
      actorRows.push(
        `($${actorBase}, $${actorBase + 1}, $${actorBase + 2}, $${actorBase + 3}, $${actorBase + 4}, $${actorBase + 5})`,
      )

      relationValues.push(actorId, targetUserId, targetUserId)
      const relationBase = relationValues.length - 2
      relationRows.push(`($${relationBase}, $${relationBase + 1}, $${relationBase + 2})`)
    }

    await query(
      `/* seedExplainData */ INSERT INTO remote_actors
           (id, actor_uri, key_id, public_key_pem, inbox_url, hostname_id)
         VALUES ${actorRows.join(', ')} ON CONFLICT DO NOTHING`,
      actorValues,
    )
    await query(
      `/* seedExplainData */ INSERT INTO relation__remote_actor__follow__user
           (subject_id, object_id, created_by_id)
         VALUES ${relationRows.join(', ')} ON CONFLICT DO NOTHING`,
      relationValues,
    )
  }

  const targetSpreadCount = Math.min(count, REMOTE_FOLLOWER_TARGET_SPREAD_COUNT)
  const targetSpreadValues: string[] = []
  const targetSpreadRows: string[] = []
  for (let index = 0; index < targetSpreadCount; index++) {
    const remoteActorId = seedUuid(index, REMOTE_FOLLOWER_TABLE_TAG)
    const targetUserId = seedUuid(index + 1, '01')
    targetSpreadValues.push(remoteActorId, targetUserId, targetUserId)
    const targetSpreadBase = targetSpreadValues.length - 2
    targetSpreadRows.push(
      `($${targetSpreadBase}, $${targetSpreadBase + 1}, $${targetSpreadBase + 2})`,
    )
  }
  if (targetSpreadRows.length > 0) {
    await query(
      `/* seedExplainData */ INSERT INTO relation__remote_actor__follow__user
           (subject_id, object_id, created_by_id)
         VALUES ${targetSpreadRows.join(', ')} ON CONFLICT DO NOTHING`,
      targetSpreadValues,
    )
  }
  await transaction.commit()
}

async function seedRemoteFollowerDirectories(): Promise<void> {
  console.log(`Seeding ${REMOTE_FOLLOWER_DIRECTORY_COUNT} remote follower directories...`)
  await using transaction = await beginTransaction()
  const query = transaction
  for (let start = 0; start < REMOTE_FOLLOWER_DIRECTORY_COUNT; start += 500) {
    const batchSize = Math.min(500, REMOTE_FOLLOWER_DIRECTORY_COUNT - start)
    const hostnameValues: unknown[] = []
    const hostnameRows: string[] = []
    const topicValues: unknown[] = []
    const topicRows: string[] = []
    const extensionValues: unknown[] = []
    const extensionRows: string[] = []
    for (let offset = 0; offset < batchSize; offset++) {
      const index = start + offset
      const hostnameId = seedUuid(index, REMOTE_FOLLOWER_HOSTNAME_TABLE_TAG)
      const topicId = seedUuid(index, REMOTE_FOLLOWER_TOPIC_TABLE_TAG)
      const hostname = `remote-follower-directory-${index}.example`
      hostnameValues.push(hostnameId, hostname)
      const hostnameBase = hostnameValues.length - 1
      hostnameRows.push(`($${hostnameBase}, $${hostnameBase + 1})`)
      topicValues.push(
        topicId,
        `Remote follower directory ${index}`,
        `remote-follower-directory-${index}`,
        hostnameId,
        contentHash(`remote-follower-directory-${index}`),
      )
      const topicBase = topicValues.length - 4
      topicRows.push(
        `($${topicBase}, $${topicBase + 1}, $${topicBase + 2}, 'fediverse_instance', $${topicBase + 3}, $${topicBase + 4})`,
      )
      extensionValues.push(topicId)
      extensionRows.push(`($${extensionValues.length})`)
    }
    await query(
      `/* seedExplainData */ INSERT INTO url_hostnames (id, hostname)
         VALUES ${hostnameRows.join(', ')} ON CONFLICT DO NOTHING`,
      hostnameValues,
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics
           (id, name, slug, topic_type, hostname_id, bedrock_nova_multimodal_v1_content_sha256)
         VALUES ${topicRows.join(', ')} ON CONFLICT DO NOTHING`,
      topicValues,
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics__fediverse_instances (topic_id)
         VALUES ${extensionRows.join(', ')} ON CONFLICT DO NOTHING`,
      extensionValues,
    )
  }
  await transaction.commit()
}
