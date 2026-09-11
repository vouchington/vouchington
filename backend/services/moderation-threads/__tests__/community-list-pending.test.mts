import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { listCommunityPendingModerationReports } from '@services/moderation-claims/community-pending-reports'
import { escalateModerationQueueItem } from '../escalate.mts'

describe('listCommunityPendingModerationReports', () => {
  let otherUser: PrivateUser

  beforeAll(async () => {
    otherUser = await createTestUser()
  })

  it('sorts community reports by severity by default', async () => {
    const community = await insertTestCommunity({
      createdById: otherUser.id,
      name: `List Community Severity ${crypto.randomUUID().slice(0, 8)}`,
      slug: `list-community-severity-${crypto.randomUUID().slice(0, 8)}`,
    })
    const warnPostId = await insertCommunityReportTarget(community.id, 'warn')
    const removePostId = await insertCommunityReportTarget(community.id, 'remove')
    const [warnReporter, removeReporter] = await Promise.all([createTestUser(), createTestUser()])
    const warnReportId = await insertTestModerationReport({
      reporterUserId: warnReporter!.id,
      entityType: 'post',
      entityId: warnPostId,
      createdAt: new Date(Date.UTC(2501, 0, 1)),
    })
    const removeReportId = await insertTestModerationReport({
      reporterUserId: removeReporter!.id,
      entityType: 'post',
      entityId: removePostId,
      createdAt: new Date(Date.UTC(2501, 0, 1)),
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: warnPostId,
      triggeringReportId: warnReportId,
      recommendedAction: 'warn',
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: removePostId,
      triggeringReportId: removeReportId,
      recommendedAction: 'remove',
    })

    const { reports } = await listCommunityPendingModerationReports({ communityId: community.id })
    const ids = reports.map(r => r.id)

    expect(ids.indexOf(removeReportId)).toBeLessThan(ids.indexOf(warnReportId))
  })

  it('sorts community reports by most reported', async () => {
    const community = await insertTestCommunity({
      createdById: otherUser.id,
      name: `List Community Most Reported ${crypto.randomUUID().slice(0, 8)}`,
      slug: `list-community-most-reported-${crypto.randomUUID().slice(0, 8)}`,
    })
    const heavilyReportedPostId = await insertCommunityReportTarget(community.id, 'heavy')
    const lightlyReportedPostId = await insertCommunityReportTarget(community.id, 'light')
    const reporters = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const heavyReportIds = await Promise.all(
      reporters.slice(0, 2).map(reporter =>
        insertTestModerationReport({
          reporterUserId: reporter!.id,
          entityType: 'post',
          entityId: heavilyReportedPostId,
          createdAt: new Date(Date.UTC(2502, 0, 1)),
        }),
      ),
    )
    const lightReportId = await insertTestModerationReport({
      reporterUserId: reporters[2]!.id,
      entityType: 'post',
      entityId: lightlyReportedPostId,
      createdAt: new Date(Date.UTC(2502, 0, 1)),
    })

    const { reports } = await listCommunityPendingModerationReports({
      communityId: community.id,
      sort: 'most_reported',
    })
    const ids = reports.map(r => r.id)

    expect(ids.indexOf(heavyReportIds[0]!)).toBeLessThan(ids.indexOf(lightReportId))
    expect(ids.indexOf(heavyReportIds[1]!)).toBeLessThan(ids.indexOf(lightReportId))
  })

  it('filters to only escalated reports when escalated=true', async () => {
    const community = await insertTestCommunity({
      createdById: otherUser.id,
      name: `List Community Escalated ${crypto.randomUUID().slice(0, 8)}`,
      slug: `list-community-escalated-${crypto.randomUUID().slice(0, 8)}`,
    })
    const escalatedPostId = await insertCommunityReportTarget(community.id, 'escalated')
    const normalPostId = await insertCommunityReportTarget(community.id, 'normal')
    const [r1, r2] = await Promise.all([createTestUser(), createTestUser()])
    const escalatedReportId = await insertTestModerationReport({
      reporterUserId: r1!.id,
      entityType: 'post',
      entityId: escalatedPostId,
      createdAt: new Date(Date.UTC(2503, 0, 1)),
    })
    await insertTestModerationReport({
      reporterUserId: r2!.id,
      entityType: 'post',
      entityId: normalPostId,
      createdAt: new Date(Date.UTC(2503, 0, 1)),
    })

    await escalateModerationQueueItem(otherUser.id, {
      communityId: community.id,
      reportId: escalatedReportId,
    })

    const { reports } = await listCommunityPendingModerationReports({
      communityId: community.id,
      escalated: true,
    })

    const ids = reports.map(r => r.id)
    expect(ids).toContain(escalatedReportId)
    expect(reports.every(r => r.escalated_at !== null)).toBe(true)
  })

  function insertCommunityReportTarget(communityId: string, label: string) {
    return insertTestPost({
      createdById: otherUser.id,
      slug: `list-community-${label}-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Community ${label} ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId,
    })
  }
})
