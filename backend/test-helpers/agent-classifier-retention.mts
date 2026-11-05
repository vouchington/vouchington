import { randomInt } from 'node:crypto'
import {
  cleanupClassifierChildRetentionFixture,
  seedClassifierRunPayloadsAt,
} from './classifier-retention.mts'
import { createTestAgentModerationRetentionPage } from './agent-moderation-retention-pages.mts'
import { createSyntheticFixture } from './data-stores/psql/classifier-runs/synthetic-classifier.mts'

/** Rows and plain scopes for one daily runner pass admitting two retention families. */
export async function createAgentClassifierRetentionFixture() {
  const [agent, excludedAgent, classifier, excludedClassifier] = await Promise.all([
    createTestAgentModerationRetentionPage(),
    createTestAgentModerationRetentionPage(),
    createSyntheticFixture(),
    createSyntheticFixture(),
  ])
  const at = new Date(Date.parse('2026-07-20T00:00:00Z') + randomInt(0, 86_400_000))
  const ownedRuns = await seedClassifierRunPayloadsAt({
    slug: classifier.slug,
    postId: classifier.post.id,
    actorId: classifier.actorId,
    currentInputSha256: classifier.post.inputSha256,
    at,
    terminalCount: 3,
  })
  const excludedRuns = await seedClassifierRunPayloadsAt({
    slug: excludedClassifier.slug,
    postId: excludedClassifier.post.id,
    actorId: excludedClassifier.actorId,
    currentInputSha256: excludedClassifier.post.inputSha256,
    at: new Date(at.getTime() + 1),
    terminalCount: 1,
  })
  const options = {
    retention: {
      families: ['agentModerations', 'classifierRecords'] as const,
      agentModerations: {
        postIds: [agent.postId],
        batchSize: 1,
        maxBatches: 1,
        now: new Date('2026-10-29T00:00:00Z'),
      },
      classifierRecords: {
        activeSweeps: ['runs'],
        runIds: [...ownedRuns.terminalIds, ownedRuns.pendingId],
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: at,
        now: new Date(at.getTime() + 90 * 86_400_000 + 2),
      },
    },
  }
  async function cleanup() {
    await cleanupClassifierChildRetentionFixture(
      [...ownedRuns.terminalIds, ownedRuns.pendingId],
      ownedRuns.requestId,
    )
    await cleanupClassifierChildRetentionFixture(
      [...excludedRuns.terminalIds, excludedRuns.pendingId],
      excludedRuns.requestId,
    )
  }
  return { agent, excludedAgent, ownedRuns, excludedRuns, options, cleanup }
}
