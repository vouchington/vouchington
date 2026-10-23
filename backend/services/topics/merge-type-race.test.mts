import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers/postgres-lock-wait'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge type revalidation', () => {
  it.each(['source', 'destination'] as const)(
    'rejects a %s type change committed after preflight and before its row lock',
    async changedTopic => {
      const admin = await createTestUser({ administrator: true })
      const sourceId = (await createTestTopic({ user: admin, topic_type: 'topic' })).id
      const destinationId = (await createTestTopic({ user: admin, topic_type: 'topic' })).id
      const source = (await getTopicByAny(sourceId))!
      const destination = (await getTopicByAny(destinationId))!
      let outcome: Promise<{ value: unknown } | { error: unknown }> | undefined
      try {
        await using updater = await beginTransaction()
        await updateTopic(
          admin,
          changedTopic === 'source' ? source : destination,
          { topic_type: 'card' },
          { query: updater, skipSideEffects: true, allowTypeChange: true },
        )
        const updaterProcessId = await getTestPostgresBackendProcessId(updater)
        outcome = mergeTopicAliases(admin, source, destination).then(
          value => ({ value }),
          err => ({ error: err }),
        )
        // The uncommitted update is invisible to preflight. Reaching this wait proves that
        // preflight succeeded with matching types; commit exposes the new type to FOR UPDATE.
        await waitForTestPostgresLockWaiter(updaterProcessId, 'mergeTopicAliases lockTopics')
        await updater.commit()
      } finally {
        // The holder is disposed before draining the merge, including an assertion failure.
        if (outcome) await outcome
      }
      expect(await outcome).toMatchObject({
        error: {
          status: 409,
          code: 'topic_merge_type_conflict',
          source_id: source.id,
          destination_id: destination.id,
        },
      })
      await expect(getTopicByAny(source.id)).resolves.toMatchObject({
        id: source.id,
        topic_type: changedTopic === 'source' ? 'card' : 'topic',
      })
      await expect(getTopicByAny(destination.id)).resolves.toMatchObject({
        id: destination.id,
        topic_type: changedTopic === 'destination' ? 'card' : 'topic',
      })
    },
  )
})
