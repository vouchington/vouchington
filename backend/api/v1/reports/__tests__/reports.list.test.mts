import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
  reviewPendingTestModerationReportsByPostSlugPrefixes as reviewReportsByPostSlugPrefixes,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { reportCursorScope } from '../reports-cursor.mts'

// The shared staff report queue is dirty and parallel: other tests leave pending reports behind
// and never clean up (see backend/test-helpers/CLAUDE.md). This search only asserts properties
// scoped to the report it owns, tolerating that foreign noise instead of requiring a quiet table.
const SEEK_LIMIT = 100
const MAX_SEEK_PAGES = 200

type ReportRow = Record<string, unknown> & { id: string }
type ListResponse = {
  body: { results: ReportRow[]; page_info: { end_cursor: string | null; has_next_page: boolean } }
}

// Pages forward at SEEK_LIMIT until it finds the row with `ownedId`, bounded by MAX_SEEK_PAGES
// rather than table size. Used where the assertion only needs the row's own shape, not its
// position relative to a page boundary.
async function seekOwnedReport(
  request: ReturnType<typeof createRequest>,
  sort: string,
  ownedId: string,
): Promise<ReportRow> {
  let after: string | undefined
  for (let page = 0; page < MAX_SEEK_PAGES; page += 1) {
    const response: ListResponse = await request
      .get('/api/v1/reports')
      .query({ limit: SEEK_LIMIT, sort, ...(after ? { after } : {}) })
      .expect(200)
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
    const match = response.body.results.find(row => row.id === ownedId)
    if (match) return match
    if (!response.body.page_info.has_next_page) break
    after = response.body.page_info.end_cursor ?? undefined
  }
  throw new Error(`seek exceeded ${MAX_SEEK_PAGES} pages without finding owned report ${ownedId}`)
}

describe('GET /api/v1/reports', () => {
  let user: PrivateUser
  let adminUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request.get('/api/v1/reports').expect(401)
  })

  it('returns 200 with redacted data for signed-in non-staff users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get('/api/v1/reports?sort=created_at_desc&limit=1000')
      .expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    for (const report of response.body.results) {
      for (const field of 'reporter_user_id reporter_username note resolved_by_id admin_action_path target_user_id target_is_restricted judgement community_ban_evasion is_system_generated'.split(
        ' ',
      )) {
        expect(report[field]).toBeUndefined()
      }
    }
  })

  it('does not leak staff-only sort fields in non-staff cursors', async () => {
    const reporter = await createTestUser()
    const targetPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-member-cursor-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Member Cursor ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportIds = await Promise.all([
      insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: targetPostId,
        createdAt: new Date(Date.UTC(2602, 0, 1)),
      }),
      insertTestModerationReport({
        reporterUserId: user.id,
        entityType: 'post',
        entityId: targetPostId,
        reason: 'harassment',
        createdAt: new Date(Date.UTC(2602, 0, 1)),
      }),
    ])
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: targetPostId,
      triggeringReportId: reportIds[0]!,
      recommendedAction: 'remove',
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/reports?limit=1&sort=created_at_desc').expect(200)

    const cursor = response.body.page_info.end_cursor
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    expect(Object.keys(decoded).toSorted()).toEqual(['cluster', 'id', 'scope', 'sort', 'status'])
    expect(decoded).not.toHaveProperty('created_at')
    expect(typeof decoded.id).toBe('string')
    expect(JSON.parse(decoded.scope as string)).toEqual({ audience: 'member', ownerId: user.id })

    const otherMember = await createTestUser()
    await request.authenticateAs(otherMember)
    await request
      .get('/api/v1/reports')
      .query({ limit: 1, sort: 'created_at_desc', after: cursor })
      .expect(422)
    await request.authenticateAs(adminUser)
    await request
      .get('/api/v1/reports')
      .query({ limit: 1, sort: 'created_at_desc', after: cursor })
      .expect(422)
  })

  it('returns paginated pending reports for admin', async () => {
    await reviewReportsByPostSlugPrefixes(['report-list-api-'])
    const reporter = await createTestUser()
    const createdAt = new Date()
    const listedPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-list-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report List API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: listedPostId,
      reason: 'spam',
      createdAt,
    })

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const found = await seekOwnedReport(request, 'created_at_desc', reportId)

    expect(found).toMatchObject({
      id: reportId,
      reporter_user_id: reporter.id,
      reporter_username: reporter.username,
    })
  })

  it('respects limit query param', async () => {
    const limitReporter = await createTestUser()
    const limitPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-limit-api-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Limit API ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const postRequest = createRequest()
    await postRequest.authenticateAs(limitReporter)
    await postRequest
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send({ entityType: 'post', entityId: limitPostId, reason: 'spam' })
      .expect(201)

    const getRequest = createRequest()
    await getRequest.authenticateAs(adminUser)
    const response = await getRequest.get('/api/v1/reports?limit=1').expect(200)
    expect(response.body.results.length).toBe(1)
  })

  it('returns 422 for invalid cursor', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const millisecondCursor = Buffer.from(
      JSON.stringify({
        created_at: '2500-01-01T00:00:00.123Z',
        id: crypto.randomUUID(),
      }),
    ).toString('base64url')
    await request.get('/api/v1/reports?after=not-a-date').expect(422)
    await request.get('/api/v1/reports?after=2026').expect(422)
    await request.get(`/api/v1/reports?after=${encodeURIComponent(millisecondCursor)}`).expect(422)
  })

  it('rejects timestamp fields and incomplete mutable sort keys on flat cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const base = {
      cluster: false,
      id: crypto.randomUUID(),
      status: 'pending',
      scope: reportCursorScope('staff', null),
    }
    const forbiddenTimestamp = Buffer.from(
      JSON.stringify({
        ...base,
        created_at: '2026-01-01T00:00:00.000000Z',
        sort: 'created_at_desc',
      }),
    ).toString('base64url')
    const missingSeverityRank = Buffer.from(
      JSON.stringify({ ...base, sort: 'severity', report_count: 1 }),
    ).toString('base64url')
    const missingReportCount = Buffer.from(
      JSON.stringify({ ...base, sort: 'most_reported' }),
    ).toString('base64url')
    const extraField = Buffer.from(
      JSON.stringify({ ...base, sort: 'created_at_desc', extra: true }),
    ).toString('base64url')

    for (const after of [forbiddenTimestamp, missingSeverityRank, missingReportCount, extraField]) {
      await request.get('/api/v1/reports').query({ after }).expect(422)
    }
  })
})
