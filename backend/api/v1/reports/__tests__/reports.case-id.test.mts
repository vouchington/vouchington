import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestModerationReportCaseId,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { ListResponse } from '@voucha/types/pagination'

type ReportListItem = {
  id: string
  case_id: string
  reporter_user_id?: string
  note?: string | null
}

type ReportListResponse = ListResponse<ReportListItem> & {
  page_info: ListResponse<ReportListItem>['page_info'] & { has_previous_page: boolean }
}

function assertReportListResponse(body: unknown): asserts body is ReportListResponse {
  expect(body).toBeTypeOf('object')
  expect(body).not.toBeNull()

  const response = body as Record<string, unknown>
  expect(Object.keys(response).toSorted()).toEqual(['page_info', 'results'])
  expect(Array.isArray(response.results)).toBe(true)
  expect(response.page_info).toBeTypeOf('object')
  expect(response.page_info).not.toBeNull()

  const pageInfo = response.page_info as Record<string, unknown>
  expect(Object.keys(pageInfo).toSorted()).toEqual([
    'end_cursor',
    'has_next_page',
    'has_previous_page',
    'start_cursor',
  ])
  expect(pageInfo.has_next_page).toBeTypeOf('boolean')
  expect(pageInfo.has_previous_page).toBeTypeOf('boolean')
  expect(pageInfo.end_cursor === null || typeof pageInfo.end_cursor === 'string').toBe(true)
  expect(pageInfo.start_cursor === null || typeof pageInfo.start_cursor === 'string').toBe(true)
}

describe('GET /api/v1/reports case ids', () => {
  let member: PrivateUser
  let staff: PrivateUser

  beforeAll(async () => {
    member = await createTestUser()
    staff = await createTestUser({ administrator: true })
  })

  it.each([
    { label: 'staff', viewer: () => staff, redacted: false },
    { label: 'member-redacted', viewer: () => member, redacted: true },
  ])('returns the exact case id for $label flat reports', async ({ viewer, redacted }) => {
    const reporter = await createTestUser()
    const targetPostId = await insertTestPost({
      createdById: member.id,
      slug: `report-case-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Case ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: targetPostId,
      createdAt: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999)),
    })
    const caseId = await getTestModerationReportCaseId(reportId)

    const request = createRequest()
    await request.authenticateAs(viewer())
    const response = await request.get('/api/v1/reports?sort=created_at_desc&limit=100').expect(200)
    assertReportListResponse(response.body)
    const report = response.body.results.find(item => item.id === reportId)
    if (!report) throw new Error(`Expected report ${reportId} in paginated results`)

    expect(report).toMatchObject({ id: reportId, case_id: caseId })
    expect(Object.hasOwn(report, 'reporter_user_id')).toBe(!redacted)
    expect(Object.hasOwn(report, 'note')).toBe(!redacted)
  })
})
