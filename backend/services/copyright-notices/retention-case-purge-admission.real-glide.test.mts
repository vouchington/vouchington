import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import type { Job } from 'glide-mq'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  addCopyrightCasePurgeFixtureParty,
  readCopyrightCasePurgeFixture,
  readCopyrightCasePurgeFixtureAccountClock,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  deleteCopyrightPurgeOrphanForTest,
  insertCopyrightPurgeOrphanForTest,
  readCopyrightCaseClocksForTest,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-admission-fixture'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import {
  COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME,
  COPYRIGHT_CASE_PURGE_JOB_NAME,
  copyrightAccountClockSyncJobId,
  copyrightCasePurgeJobId,
  getCopyrightAccountClockSyncJobOptions,
  getCopyrightCasePurgeJobOptions,
} from '../../queues/psql/config.mts'
import { enqueueCopyrightAccountClockSyncBatch } from '../../queues/psql/enqueues/copyright-account-clock-sync.mts'
import { enqueueCopyrightCasePurgeBatch } from '../../queues/psql/enqueues/copyright-case-purge.mts'
import { psql } from '../../queues/psql/queues.mts'
import type {
  CopyrightAccountClockSyncJobData,
  CopyrightCasePurgeJobData,
} from '../../queues/psql/types.mts'
import type { CopyrightCasePurgeAdmissionData } from '../../queues/background/enqueues/notifications-domain.mts'
import { processCopyrightAccountClockSync } from '../../workers/psql/processors/copyright-account-clock-sync.mts'
import { processCopyrightCasePurge } from '../../workers/psql/processors/copyright-case-purge.mts'
import { placeUserPreservationHold } from '../users/preservation-holds.mts'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import { admitCopyrightCasePurgePage } from './retention-case-purge-admission.mts'

describe('copyright purge admission and clock sync', () => {
  const setPageSize = useCopyrightCasePurgePageSize()

  it('admits pending party accounts one page at a time with stable clock-sync jobs', async () => {
    await setPageSize(1)
    const beforeAccounts = v7()
    const [admin, firstCase, secondCase] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionMinimalCase(),
      createRetentionMinimalCase(),
    ])
    const accountIds = [firstCase.posterId, secondCase.posterId]
    await Promise.all([
      addCopyrightCasePurgeFixtureParty(firstCase.noticeId, firstCase.posterId),
      addCopyrightCasePurgeFixtureParty(secondCase.noticeId, secondCase.posterId),
    ])
    await Promise.all(
      accountIds.map(accountId => placeUserPreservationHold(admin, accountId, `admission-${v7()}`)),
    )
    onTestFinished(async () => {
      await Promise.all(
        accountIds.map(async accountId =>
          (await psql.getJob(copyrightAccountClockSyncJobId(accountId)))?.remove(),
        ),
      )
    })

    let cursor: CopyrightCasePurgeAdmissionData = { pendingAccountAfterId: beforeAccounts }
    const admittedIds = new Set<string>()
    for (
      let pageIndex = 0;
      pageIndex < 10 && admittedIds.size < accountIds.length;
      pageIndex += 1
    ) {
      const page = await admitCopyrightCasePurgePage(cursor)
      expect(page.stalled).toBe(false)
      expect(page.admitted).toBeLessThanOrEqual(1)
      if (page.admitted === 1 && page.next.pendingAccountAfterId)
        admittedIds.add(page.next.pendingAccountAfterId)
      cursor = page.next
    }
    expect(admittedIds).toEqual(new Set(accountIds))
    for (const accountId of accountIds) {
      const jobId = copyrightAccountClockSyncJobId(accountId)
      const job = await psql.getJob(jobId)
      expect(job?.data).toMatchObject({ accountUserId: accountId, afterNoticeId: null })
      expect(job?.opts.ordering?.key).toBe(`copyright:account-clock-sync:${accountId}`)
    }
    await enqueueCopyrightAccountClockSyncBatch(accountIds)
    for (const accountId of accountIds)
      expect((await psql.getJob(copyrightAccountClockSyncJobId(accountId)))?.id).toBe(
        copyrightAccountClockSyncJobId(accountId),
      )
    for (const accountId of accountIds) {
      const first = await runCopyrightAccountClockSyncPage({
        accountUserId: accountId,
        afterNoticeId: null,
        sourceVersion: null,
      })
      expect(first.hasMore).toBe(true)
      const second = await runCopyrightAccountClockSyncPage(first.data)
      expect(second.hasMore).toBe(false)
    }
    const candidates = await admitCopyrightCasePurgePage({ pendingAccountsComplete: true })
    expect(candidates.stalled).toBe(false)
    for (const noticeId of [firstCase.noticeId, secondCase.noticeId])
      expect(await psql.getJob(copyrightCasePurgeJobId(noticeId))).toBeNull()
  })

  // no-mistakes-timeout-reason: two real PostgreSQL cases and native worker continuation across bounded pages
  it('continues a native clock-sync job across two cases and clears the account signal', async () => {
    await setPageSize(1)
    const [admin, account, firstCase, secondCase] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUserDirect(),
      createRetentionMinimalCase(),
      createRetentionMinimalCase(),
    ])
    const noticeIds = [firstCase.noticeId, secondCase.noticeId]
    await Promise.all(
      noticeIds.map(noticeId => addCopyrightCasePurgeFixtureParty(noticeId, account.id)),
    )
    const hold = await placeUserPreservationHold(admin, account.id, `clock-sync-${v7()}`)
    expect((await readCopyrightCasePurgeFixtureAccountClock(account.id)).pending).toBe(true)

    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'copyright_account_clock_sync',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      processor: job =>
        processCopyrightAccountClockSync(job as Job<CopyrightAccountClockSyncJobData>),
    })
    try {
      const job = await worker.add(
        {
          name: COPYRIGHT_ACCOUNT_CLOCK_SYNC_JOB_NAME,
          options: getCopyrightAccountClockSyncJobOptions(account.id),
        },
        { accountUserId: account.id, afterNoticeId: null, sourceVersion: null },
      )
      expect(job.id).toBe(copyrightAccountClockSyncJobId(account.id))
      await worker.activated(job, 2)
      await expect(worker.settled(job)).resolves.toBe('completed')
      expect((await readCopyrightCasePurgeFixtureAccountClock(account.id)).pending).toBe(false)
      const clocks = await readCopyrightCaseClocksForTest(noticeIds)
      expect(clocks).toHaveLength(2)
      for (const clock of clocks)
        expect(clock.getTime()).toBeGreaterThanOrEqual(hold.placed_at.getTime())
      await expect(
        runCopyrightAccountClockSyncPage({
          accountUserId: account.id,
          afterNoticeId: null,
          sourceVersion: null,
        }),
      ).resolves.toMatchObject({ hasMore: false })
    } finally {
      await worker.close()
    }
  }, 30_000)

  // no-mistakes-timeout-reason: real queue admission and native worker drain after a retained-owner crash boundary
  it('recovers a retained orphan through stable admission and drains it with a native purge job', async () => {
    await setPageSize(1)
    const beforeOrphan = v7()
    const noticeId = v7()
    await insertCopyrightPurgeOrphanForTest(noticeId)
    onTestFinished(async () => {
      await deleteCopyrightPurgeOrphanForTest(noticeId)
      await (await psql.getJob(copyrightCasePurgeJobId(noticeId)))?.remove()
    })
    const page = await admitCopyrightCasePurgePage({
      pendingAccountsComplete: true,
      caseCandidatesComplete: true,
      orphanAfterId: beforeOrphan,
    })
    expect(page.stalled).toBe(false)
    expect(page.admitted).toBe(1)
    const queued = await psql.getJob(copyrightCasePurgeJobId(noticeId))
    expect(queued?.data).toMatchObject({ noticeId, phase: 'parties' })
    await enqueueCopyrightCasePurgeBatch([noticeId])
    expect((await psql.getJob(copyrightCasePurgeJobId(noticeId)))?.id).toBe(queued?.id)

    const worker = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'copyright_case_purge_orphan',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      processor: job => processCopyrightCasePurge(job as Job<CopyrightCasePurgeJobData>),
    })
    try {
      const job = await worker.add(
        { name: COPYRIGHT_CASE_PURGE_JOB_NAME, options: getCopyrightCasePurgeJobOptions(noticeId) },
        queued!.data as CopyrightCasePurgeJobData,
      )
      expect(job.id).toBe(copyrightCasePurgeJobId(noticeId))
      await expect(worker.settled(job)).resolves.toBe('completed')
      expect(await readCopyrightCasePurgeFixture(noticeId)).toMatchObject({
        live: false,
        retained: false,
      })
    } finally {
      await worker.close()
    }
  }, 30_000)
})
