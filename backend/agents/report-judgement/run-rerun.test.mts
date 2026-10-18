import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { moderationAiConfig } from '@services/moderation-ai-config'
import { read, readPool, writePool } from '@data-stores/psql'
import { getLatestJudgementForEntity } from '@services/moderation-reports/judgements'
import { runReportJudgementAgent } from './run.mts'
import {
  makeModelCallResult,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import type { AgentModelCaller } from '@agents/_shared'

describe('runReportJudgementAgent manual reruns', () => {
  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationAiConfig])
  })

  it('saves the context loaded before the model call', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const laterReporter = await createTestUser()
    const rerunUser = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-rerun-context-${randomUUID().slice(0, 8)}`,
      title: `RJA Rerun Context ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const callModel = vi.fn<AgentModelCaller<never>>(async () => {
      await insertTestModerationReport({
        reporterUserId: laterReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'illegal_content',
      })
      return makeModelCallResult({
        recommended_action: 'warn',
        public_response: 'Warning issued.',
        internal_response: 'Manual rerun.',
      })
    })

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: rerunUser.id,
      },
      TEST_MODEL_SELECTION,
      callModel,
    )

    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement!.rerun_by_id).toBe(rerunUser.id)
    expect(judgement!.context_report_count).toBe(1)
  })

  it('bypasses the community judgement flag', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rerunUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `RJA Comm Rerun ${randomUUID().slice(0, 8)}`,
      slug: `rja-comm-rerun-${randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-comm-rerun-post-${randomUUID().slice(0, 8)}`,
      title: `RJA Comm Rerun Post ${randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const callModel = vi.fn<AgentModelCaller<never>>(() =>
      Promise.resolve(
        makeModelCallResult({
          recommended_action: 'warn',
          public_response: 'Warning issued.',
          internal_response: 'Manual rerun.',
        }),
      ),
    )

    await runReportJudgementAgent(
      {
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: rerunUser.id,
      },
      TEST_MODEL_SELECTION,
      callModel,
    )

    expect(callModel).toHaveBeenCalledOnce()
    const judgement = await getLatestJudgementForEntity('post', postId)
    expect(judgement!.rerun_by_id).toBe(rerunUser.id)
  })

  it('reads the manual rerun input from the primary and exits that scope before model IO', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rerunUser = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `rja-primary-rerun-${randomUUID().slice(0, 8)}`,
      title: 'Primary-routed rerun',
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    let primaryAcquisitions = 0
    let replicaAcquisitions = 0
    const onPrimaryAcquire = () => {
      primaryAcquisitions += 1
    }
    const onReplicaAcquire = () => {
      replicaAcquisitions += 1
    }
    writePool.on('acquire', onPrimaryAcquire)
    readPool.on('acquire', onReplicaAcquire)
    try {
      await runReportJudgementAgent(
        {
          entityType: 'post',
          entityId: postId,
          triggeringReportId: reportId,
          rerunById: rerunUser.id,
        },
        TEST_MODEL_SELECTION,
        async () => {
          expect(primaryAcquisitions).toBeGreaterThan(0)
          expect(replicaAcquisitions).toBe(0)
          await read('/* reportJudgementManualRerunPrimaryScope */ SELECT 1')
          expect(replicaAcquisitions).toBeGreaterThan(0)
          return makeModelCallResult({
            recommended_action: 'warn',
            public_response: 'Warning issued.',
            internal_response: 'Primary-routed rerun.',
          })
        },
      )
    } finally {
      writePool.off('acquire', onPrimaryAcquire)
      readPool.off('acquire', onReplicaAcquire)
    }
  })
})
