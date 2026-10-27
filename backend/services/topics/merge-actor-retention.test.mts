import { getPurgedTopicMergeActorState } from '@voucha/test-helpers/topic-merge-actor'
import {
  createTestTopic,
  createTestUser,
  hardDeleteTestUser,
  hasTestRetainedIdentityRoot,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { createTopicAliases } from './aliases.mts'
import { getTopicByAny } from './get.mts'
import { createTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
import { cleanupRetainedIdentityRoots } from '../data-retention/cleanup-retained-identities.mts'

describe('topic merge actor retention', () => {
  it('completes an admitted merge after its administrator is purged', async () => {
    const owner = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const source = (await getTopicByAny((await createTestTopic({ user: owner })).id))!
    const destination = (await getTopicByAny((await createTestTopic({ user: owner })).id))!
    const alias = `purged-merger-${crypto.randomUUID()}`
    await createTopicAliases(source.id, alias)
    const operation = await createTopicMergeOperation(administrator, source, destination)
    await hardDeleteTestUser(administrator.id)
    let generation: number | null = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    const state = await getPurgedTopicMergeActorState(operation.id, alias)
    expect(state).toMatchObject({
      completed_at: expect.any(Date),
      merged_by_id: administrator.id,
      updated_by_id: null,
      alias_topic_id: destination.id,
      revised_by_id: null,
    })
    await cleanupRetainedIdentityRoots(1_000, { user: [administrator.id] })
    expect(await hasTestRetainedIdentityRoot('user', administrator.id)).toBe(true)
  })
})
