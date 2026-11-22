import { describe, expect, it } from 'vitest'
import { getMinUuidv7ForDate } from '@modules/utils'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { resolveTestRetentionReport } from '@voucha/test-helpers/entities/moderation-retention'
import { runTestRetentionWithCommitAtWait } from '@voucha/test-helpers/moderation-retention-race'
import {
  createTestRetentionSanction,
  getTestRetentionReportAndThread,
  getTestRetentionSanctionAndAppeal,
  insertTestRetentionReportThread,
  insertTestRetentionSanctionAppeal,
} from '@voucha/test-helpers/entities/moderation-retention-child-race'
import { createExactRetentionWindow } from '@voucha/test-helpers/retention-window'
import { getModerationCleanupCandidates } from './cleanup-moderation-candidates.mts'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'
import { deleteExpiredModerationSanctions } from './cleanup-moderation-delete-sanctions.mts'

describe('moderation retention appeal protection', () => {
  it.each(['warnings', 'suspensions', 'bans'] as const)(
    'preserves expired %s when an appeal is arriving',
    async kind => {
      const { aged, now } = createExactRetentionWindow(750)
      const target = await createTestRetentionSanction(kind, aged)
      await using holder = await beginTransaction()
      const appealId = await insertTestRetentionSanctionAppeal(holder, target)
      const after = getMinUuidv7ForDate(aged)
      const before = getMinUuidv7ForDate(new Date(aged.getTime() + 1))
      const deleted = await runTestRetentionWithCommitAtWait({
        holder,
        marker: `/* deleteExpiredModerationSanctions:${kind} */`,
        binding: [target.id],
        run: async query => {
          const ids = await getModerationCleanupCandidates(kind, query, after, before, 2)
          return deleteExpiredModerationSanctions(kind, query, ids, now)
        },
      })
      expect(await getTestRetentionSanctionAndAppeal(target, appealId)).toEqual({
        sanction: true,
        appeal: true,
      })
      expect(deleted).toBe(0)
    },
  )
})

describe('moderation report retention thread protection', () => {
  it('preserves a report reviewed more than 24 months ago when an internal thread opens again', async () => {
    const { aged, now } = createExactRetentionWindow(750)
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const postId = await insertTestPost({
      createdById: user.id,
      slug: `retention-report-thread-${crypto.randomUUID()}`,
      title: 'Retention report thread fixture',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: user.id,
      entityType: 'post',
      entityId: postId,
      createdAt: aged,
    })
    await resolveTestRetentionReport(reportId, aged)
    await using previous = await beginTransaction()
    await insertTestRetentionReportThread(previous, reportId, community.id, aged)
    await previous.commit()
    await using holder = await beginTransaction()
    const threadId = await insertTestRetentionReportThread(holder, reportId, community.id)
    const after = getMinUuidv7ForDate(aged)
    const before = getMinUuidv7ForDate(new Date(aged.getTime() + 1))
    const deleted = await runTestRetentionWithCommitAtWait({
      holder,
      marker: '/* deleteExpiredModerationHistory:reports */',
      binding: [reportId],
      run: async query => {
        const ids = await getModerationCleanupCandidates('reports', query, after, before, 2)
        return deleteExpiredModerationHistory('reports', query, ids, now)
      },
    })
    expect(await getTestRetentionReportAndThread(reportId, threadId)).toEqual({
      report: true,
      thread: true,
    })
    expect(deleted).toBe(0)
  })
})
