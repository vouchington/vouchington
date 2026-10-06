import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countEuTransparencyReportsBy } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { describe, expect, it } from 'vitest'
import { withdrawCopyrightJurisdictionPolicyApproval } from '@services/copyright-notices/jurisdiction-policy'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const start = '2026-01-01T00:00:00.000Z'
const end = '2026-02-01T00:00:00.000Z'

function reportPath(format?: string, periodStart = start, periodEnd = end): string {
  const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd })
  if (format) params.set('format', format)
  return `/api/v1/copyright-eu-reports?${params}`
}

describe('DSA copyright transparency report GET', () => {
  useDsaTransparencyReports()
  useCopyrightIntakeEnvironment()

  it('returns aggregate JSON without creating a durable report', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get(reportPath()).expect(200)
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.copyright_eu_report).toMatchObject({
      period_start: start,
      period_end: end,
      receipt_count: expect.any(Number),
      notices_received_count: expect.any(Number),
      complaints_by_submitter: {
        notifier: expect.any(Number),
        poster: expect.any(Number),
        reviewer: expect.any(Number),
      },
    })
    expect(response.body.copyright_eu_report).not.toHaveProperty('id')
    expect(response.body.copyright_eu_report).not.toHaveProperty('jurisdiction_policy_approval_id')
  })

  it('counts a receipt after withdrawing its approval and does not persist GET output', async () => {
    const { administrator, claimant, staff, staffRequest } = await createTerritorialActors()
    const periodStart = new Date(Date.now() - 60_000).toISOString()
    const periodEnd = new Date(Date.now() + 86_400_000).toISOString()
    const reportCount = await countEuTransparencyReportsBy(staff.id)
    const before = await staffRequest.get(reportPath(undefined, periodStart, periodEnd)).expect(200)
    expect(await countEuTransparencyReportsBy(staff.id)).toBe(reportCount)

    const approval = await approveJurisdictionPolicy(administrator, 'eu_dsa')
    await seedPendingTerritorialNotice('eu_dsa', claimant)
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)

    const after = await staffRequest.get(reportPath(undefined, periodStart, periodEnd)).expect(200)
    expect(after.body.copyright_eu_report.receipt_count).toBeGreaterThanOrEqual(
      before.body.copyright_eu_report.receipt_count + 1,
    )
    expect(await countEuTransparencyReportsBy(staff.id)).toBe(reportCount)
  })

  it.each(['csv_notices', 'csv_complaints'] as const)(
    'serves %s as attachment with CRLF and no TOTAL row',
    async format => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const request = createRequest()
      await request.authenticateAs(staff)
      const response = await request.get(reportPath(format)).expect(200)
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
      expect(response.headers['content-disposition']).toMatch(/^attachment;/)
      expect(response.headers['content-disposition']).toContain(`copyright-${format}.csv`)
      expect(response.text).toContain('\r\n')
      expect(response.text).not.toMatch(/^TOTAL,/m)
    },
  )

  it('requires UTC-midnight CSV bounds and rejects invalid periods and formats', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(staff)
    await request.get(reportPath('csv_notices', '2026-01-01T12:00:00.000Z')).expect(422)
    await request.get(reportPath('unknown')).expect(422)
    await request.get(reportPath('json', end, start)).expect(422)
    await request.get('/api/v1/copyright-eu-reports').expect(422)
    await request.get(`/api/v1/copyright-eu-reports?period_start=${start}`).expect(422)
    await request.get(`/api/v1/copyright-eu-reports?period_end=${end}`).expect(422)
  })

  it('checks staff authorization before parsing report parameters', async () => {
    const member = await createTestUser()
    const request = createRequest()
    await request.get('/api/v1/copyright-eu-reports').expect(401)
    await request.authenticateAs(member)
    await request.get('/api/v1/copyright-eu-reports').expect(403)
  })
})

describe('DSA copyright transparency report switch off', () => {
  useDsaTransparencyReports(false)

  it('checks authorization before the off switch and returns 404 to staff', async () => {
    await createRequest().get('/api/v1/copyright-eu-reports').expect(401)
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    await member.get('/api/v1/copyright-eu-reports').expect(403)
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(staff)
    await request.get('/api/v1/copyright-eu-reports').expect(404)
  })
})
