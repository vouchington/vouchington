import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  createClassifierDecisionBatchAt,
  createClassifierRunSchemaFixture,
} from '../../test-helpers/data-stores/psql/classifier-runs/schema-fixture.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'

describe('retained classifier decisions', () => {
  it('finishes an expired reservation only for its live run and replays the same result', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const at = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)
    const batchId = await createClassifierDecisionBatchAt({
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      postId: fixture.postId,
      at,
      completed: false,
    })
    const run = await createClassifierRunSchemaFixture({
      classifierId: fixture.classifierId,
      postId: fixture.postId,
      decisionBatchId: batchId,
    })
    const now = new Date()
    await run.update({
      lease_token: randomUUID(),
      leased_at: now,
      lease_expires_at: new Date(now.getTime() + 60_000),
    })
    const input = {
      batchId,
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic' as const,
              topicId: fixture.topicId,
              storedCandidateId: null,
              probability: 0.8,
              rawResponse: { type: 'noul', probability: 0.8 },
            },
          ],
        },
      ],
    }

    await expect(persistClassifierDecision(input)).rejects.toThrow('outside the retention window')
    await expect(persistClassifierDecision(input, { activeRunId: randomUUID() })).rejects.toThrow(
      'outside the retention window',
    )
    await run.update({
      leased_at: new Date(now.getTime() - 120_000),
      lease_expires_at: new Date(now.getTime() - 60_000),
    })
    await expect(persistClassifierDecision(input, { activeRunId: run.id })).rejects.toThrow(
      'outside the retention window',
    )
    await run.update({
      leased_at: new Date(),
      lease_expires_at: new Date(Date.now() + 60_000),
    })
    const persisted = await persistClassifierDecision(input, { activeRunId: run.id })
    expect(persisted).toMatchObject({ replayed: false, decision: { batchId } })
    const replay = await persistClassifierDecision(input, { activeRunId: run.id })
    expect(replay).toMatchObject({ replayed: true, decision: { batchId } })

    await run.update({ outcomes_persisted_at: new Date() })
    await expect(persistClassifierDecision(input, { activeRunId: run.id })).rejects.toThrow(
      'outside the retention window',
    )
  })
})
