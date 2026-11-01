import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { mergeTopicsForTest } from '@voucha/test-helpers/merge-topics'
import { describe, expect, it } from 'vitest'
import { createTopic } from './create.mts'

async function createMergePair() {
  const admin = (await createTestUser({ administrator: true }))!
  const sourceSlug = `pending-source-${randomUUID()}`
  const source = await createTopic(admin, WEB_PROVENANCE, {
    name: `Pending source ${sourceSlug}`,
    slug: sourceSlug,
  })
  const destination = await createTopic(admin, WEB_PROVENANCE, {
    name: `Pending destination ${randomUUID()}`,
    slug: `pending-destination-${randomUUID()}`,
  })
  return { admin, source, destination, sourceSlug }
}

async function markAliasPending(alias: string, topicId: string) {
  await write(
    `/* markSourceSlugAliasPendingForTest */ UPDATE topic_aliases
      SET topic_id = NULL, unlink_requested_at = CURRENT_TIMESTAMP, unlink_topic_id = $2::uuid
      WHERE alias = $1`,
    [alias, topicId],
  )
}

async function expectAliasStillPending(alias: string, topicId: string) {
  const { rows } = await read<{ topic_id: string | null; unlink_topic_id: string | null }>(
    `/* readPendingSourceSlugAliasForTest */ SELECT topic_id, unlink_topic_id
      FROM topic_aliases WHERE alias = $1 AND unlink_requested_at IS NOT NULL`,
    [alias],
  )
  expect(rows).toEqual([{ topic_id: null, unlink_topic_id: topicId }])
}

describe('topic merge source-slug alias with a pending unlink', () => {
  it('rejects admission and leaves the alias pending', async () => {
    const { admin, source, destination, sourceSlug } = await createMergePair()
    await markAliasPending(sourceSlug, source.id)

    await expect(mergeTopicsForTest(admin, source, destination)).rejects.toMatchObject({
      status: 409,
    })

    await expectAliasStillPending(sourceSlug, source.id)
  })
})
