import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acquireModerationOperationRetentionTestLock } from '@voucha/test-helpers'
import { acquirePaymentOperationRetentionTestLock } from '@voucha/test-helpers/payment-operation-retention'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { flush as flushFirehose } from '../../data-stores/analytics/backend-firehose.mts'
import * as firehoseProvider from '../../modules/aws/firehose.mts'
import { cleanupAnalyticsLocalFiles, runDataRetentionCleanup } from './cleanup.mts'

describe('cleanupAnalyticsLocalFiles', () => {
  const originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
  const originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
  let cleanupFirehose: (() => Promise<void>) | undefined

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'))
  })

  afterEach(async () => {
    try {
      await cleanupFirehose?.()
    } finally {
      cleanupFirehose = undefined
      try {
        restoreAnalyticsEnv()
      } finally {
        vi.useRealTimers()
      }
    }
  })

  it('enforces local analytics retention when analytics backend is local', async () => {
    const localDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-retention-analytics-'))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = localDir
    await writeJsonl(localDir, 'queue_jobs', '2026-01-01', [{ event: 'completed' }])

    await cleanupAnalyticsLocalFiles()

    await expect(
      fs.promises.access(path.join(localDir, 'queue_jobs', '2026-01-01.jsonl')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.promises.rm(localDir, { recursive: true, force: true })
  })

  it('skips local analytics retention when analytics backend is not local', async () => {
    const localDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-retention-analytics-'))
    process.env.ANALYTICS_BACKEND = 'firehose'
    process.env.ANALYTICS_LOCAL_DIR = localDir
    await writeJsonl(localDir, 'queue_jobs', '2026-01-01', [{ event: 'completed' }])

    await cleanupAnalyticsLocalFiles()

    await expect(
      fs.promises.access(path.join(localDir, 'queue_jobs', '2026-01-01.jsonl')),
    ).resolves.toBeUndefined()
    await fs.promises.rm(localDir, { recursive: true, force: true })
  })

  it('runs analytics cleanup as part of the full retention workflow', async () => {
    const moderationLock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => moderationLock.release())
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const firehoseSender = vi.spyOn(firehoseProvider, 'putFirehoseRecordBatch').mockResolvedValue({
      $metadata: {},
      FailedPutCount: 0,
      RequestResponses: [],
    })
    cleanupFirehose = async () => {
      try {
        await flushFirehose()
      } finally {
        firehoseSender.mockRestore()
      }
    }
    process.env.ANALYTICS_BACKEND = 'firehose'
    const now = new Date()
    const limits = { batchSize: 10, maxBatches: 10 }
    const emptyWindow = {
      lowerBoundDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      now,
    }

    await expect(
      runDataRetentionCleanup(limits, {
        retainedIdentityRootIds: {},
        retainedRelationIdentityKeys: {},
        retainedMediaBindingIds: [],
        softDeletedUsers: emptyWindow,
        oldReferralAttributions: emptyWindow,
        histories: emptyWindow,
        orphanedOAuthAccounts: emptyWindow,
        expiredOAuthAuthorizations: { ...emptyWindow, authorizationIds: [] },
        expiredOAuthServerArtifacts: emptyWindow,
        expiredBlueskyLinkCompletions: emptyWindow,
        abandonedBlueskyLinkSessions: emptyWindow,
        expiredContributionAdmissions: emptyWindow,
        expiredContributionQuotaConsumptions: emptyWindow,
        expiredTopicImportAttempts: emptyWindow,
        oldPendingNotificationPushIntents: emptyWindow,
        terminalNotificationPushIntents: emptyWindow,
        terminalStripeEventWork: emptyWindow,
        abandonedMembershipPurchaseIntents: emptyWindow,
        emailAddressLoginTokens: emptyWindow,
        phoneNumberLoginTokens: emptyWindow,
        expiredUserSessions: emptyWindow,
        webPushSubscriptionTombstones: emptyWindow,
        oldModerationQueueClaims: emptyWindow,
        oldModerationMediaReveals: emptyWindow,
        classifierRecords: emptyWindow,
      }),
    ).resolves.toMatchObject({
      retainedIdentityRoots: [],
      retainedRelationIdentities: [],
      retainedMediaBindings: { scanned: 0, deleted: 0, hasMore: false },
      softDeletedUsers: { deleted: 0, hasMore: false },
      oldReferralAttributions: { deleted: 0, hasMore: false },
      histories: {
        dynamic_configuration_revisions: { scanned: 0, changed: 0, hasMore: false },
        referral_attribution_scrub: { scanned: 0, changed: 0, hasMore: false },
      },
      orphanedOAuthAccounts: { deleted: 0, hasMore: false },
      expiredOAuthAuthorizations: { deleted: 0, hasMore: false },
      expiredOAuthServerArtifacts: { deleted: 0, hasMore: false },
      expiredBlueskyLinkCompletions: { deleted: 0, hasMore: false },
      abandonedBlueskyLinkSessions: { deleted: 0, hasMore: false },
      expiredContributionAdmissions: { deleted: 0, hasMore: false },
      expiredContributionQuotaConsumptions: { deleted: 0, hasMore: false },
      expiredTopicImportAttempts: { deleted: 0, hasMore: false },
      oldPendingNotificationPushIntents: { deleted: 0, hasMore: false, continuation: null },
      terminalNotificationPushIntents: { deleted: 0, hasMore: false },
      terminalStripeEventWork: { deleted: 0, hasMore: false, cursorId: null },
      abandonedMembershipPurchaseIntents: { deleted: 0, hasMore: false, cursorId: null },
      emailAddressLoginTokens: { deleted: 0, hasMore: false, continuation: null },
      phoneNumberLoginTokens: { deleted: 0, hasMore: false, continuation: null },
      expiredUserSessions: { deleted: 0, hasMore: false, continuation: null },
      webPushSubscriptionTombstones: { deleted: 0, hasMore: false, continuation: null },
      oldModerationQueueClaims: { deleted: 0, hasMore: false, cursorId: null },
      oldModerationMediaReveals: { deleted: 0, hasMore: false, cursorId: null },
      classifierRecords: {
        runCandidates: { scanned: 0, deleted: 0, hasMore: false },
        agentTopics: { scanned: 0, deleted: 0, hasMore: false },
        localOutcomes: { scanned: 0, deleted: 0, hasMore: false },
        runs: { scanned: 0, deleted: 0, hasMore: false },
        calls: { scanned: 0, deleted: 0, hasMore: false },
        batches: { scanned: 0, deleted: 0, hasMore: false },
      },
    })
    await flushFirehose()
    expect(firehoseSender).toHaveBeenCalled()
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  function restoreAnalyticsEnv() {
    if (originalAnalyticsBackend === undefined) {
      delete process.env.ANALYTICS_BACKEND
    } else {
      process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
    }
    if (originalAnalyticsLocalDir === undefined) {
      delete process.env.ANALYTICS_LOCAL_DIR
    } else {
      process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
    }
  }

  async function writeJsonl(localDir: string, table: string, date: string, rows: unknown[]) {
    const dir = path.join(localDir, table)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(
      path.join(dir, `${date}.jsonl`),
      `${rows.map(row => JSON.stringify(row)).join('\n')}\n`,
    )
  }
})
