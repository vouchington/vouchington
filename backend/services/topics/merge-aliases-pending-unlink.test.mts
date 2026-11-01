import { randomUUID } from 'node:crypto'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getPendingTopicAliasForTest,
  markTopicAliasPendingUnlinkForTest,
} from '@voucha/test-helpers/entities/topic-alias-unlink'
import { mergeTopicsForTest } from '@voucha/test-helpers/merge-topics'
import { describe, expect, it } from 'vitest'
import { createTopic } from './create.mts'

describe('topic merge source-slug alias with a pending unlink', () => {
  it('rejects admission and leaves the alias pending', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceSlug = `pending-source-${randomUUID()}`
    const source = await createTopic(admin, WEB_PROVENANCE, {
      name: `Pending source ${sourceSlug}`,
      slug: sourceSlug,
    })
    const destination = await createTopic(admin, WEB_PROVENANCE, {
      name: `Pending destination ${randomUUID()}`,
      slug: `pending-destination-${randomUUID()}`,
    })
    await markTopicAliasPendingUnlinkForTest(sourceSlug, source.id)

    await expect(mergeTopicsForTest(admin, source, destination)).rejects.toMatchObject({
      status: 409,
    })

    await expect(getPendingTopicAliasForTest(sourceSlug)).resolves.toEqual({
      topic_id: null,
      unlink_topic_id: source.id,
    })
  })
})
