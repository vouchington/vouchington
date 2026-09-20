import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanupAnalyticsLocalFiles, runDataRetentionCleanup } from './cleanup.mts'

describe('cleanupAnalyticsLocalFiles', () => {
  const originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
  const originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR

  afterEach(() => {
    restoreAnalyticsEnv()
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
    process.env.ANALYTICS_BACKEND = 'firehose'
    const now = new Date()
    const emptyWindow = {
      lowerBoundDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      maxBatches: 10,
      now,
    }

    await expect(
      runDataRetentionCleanup({
        softDeletedUsers: emptyWindow,
        oldReferralAttributions: emptyWindow,
        orphanedOAuthAccounts: emptyWindow,
        expiredOAuthAuthorizations: emptyWindow,
        expiredOAuthServerArtifacts: emptyWindow,
        expiredBlueskyLinkCompletions: emptyWindow,
        abandonedBlueskyLinkSessions: emptyWindow,
        expiredContributionAdmissions: emptyWindow,
        expiredContributionQuotaConsumptions: emptyWindow,
        expiredTopicImportAttempts: emptyWindow,
      }),
    ).resolves.toEqual({
      softDeletedUsers: { deleted: 0, hasMore: false },
      oldReferralAttributions: { deleted: 0, hasMore: false },
      orphanedOAuthAccounts: { deleted: 0, hasMore: false },
      expiredOAuthAuthorizations: { deleted: 0, hasMore: false },
      expiredOAuthServerArtifacts: { deleted: 0, hasMore: false },
      expiredBlueskyLinkCompletions: { deleted: 0, hasMore: false },
      abandonedBlueskyLinkSessions: { deleted: 0, hasMore: false },
      expiredContributionAdmissions: { deleted: 0, hasMore: false },
      expiredContributionQuotaConsumptions: { deleted: 0, hasMore: false },
      expiredTopicImportAttempts: { deleted: 0, hasMore: false },
      terminalNotificationPushIntents: { deleted: 0, hasMore: false },
    })
  }, 60_000)

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
