import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers/postgres-lock-wait'
import { getEntityRelationMetadataOrThrow } from '../entity-relations/metadata.mts'
import { upsertEntityRelation } from '../entity-relations/upsert.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge lifecycle lock order', () => {
  it('lets a guarded writer acquire its attachment fence before the waiting merge', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceId = (await createTestTopic({ user: admin })).id
    const destinationId = (await createTestTopic({ user: admin })).id
    const source = (await getTopicByAny(sourceId))!
    const destination = (await getTopicByAny(destinationId))!
    let outcome: Promise<{ value: unknown } | { error: unknown }> | undefined
    {
      await using writer = await beginTransaction()
      const follow = getEntityRelationMetadataOrThrow({
        subjectType: 'user',
        objectType: 'topic',
        predicate: 'follow',
      })
      await upsertEntityRelation(admin, follow, { id: admin.id }, [{ id: sourceId }], {
        query: writer,
        vote: false,
      })
      const writerProcessId = await getTestPostgresBackendProcessId(writer)
      outcome = mergeTopicAliases(admin, source, destination).then(
        value => ({ value }),
        err => ({ error: err }),
      )
      await waitForTestPostgresLockWaiter(writerProcessId, 'lockTopicRssFeedAttachmentLifecycles')
      await writer.commit()
    }
    await expect(outcome).resolves.toMatchObject({
      value: { destination_topic_id: destinationId },
    })
  })
})
