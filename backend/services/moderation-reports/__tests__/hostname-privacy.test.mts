import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { upsertTestHostnameId } from '@voucha/test-helpers/entities/email-domain-hostname'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'

describe('hostname report privacy', () => {
  it('hides email-only hostnames from public reports while retaining administrator review', async () => {
    const viewer = await createTestUser()
    const administrator = await createTestUser({ administrator: true })
    const privateId = await upsertTestHostnameId(
      `private-report-${crypto.randomUUID()}.example.test`,
      {},
      'private_email',
    )
    const input = parseCreateModerationReportInput({
      entityType: 'url_hostname',
      entityId: privateId,
      reason: 'spam',
      note: null,
    })

    await expect(createModerationReport(viewer.id, WEB_PROVENANCE, input)).rejects.toThrow(
      /Reportable entity not found/,
    )
    const { report } = await createModerationReport(administrator.id, WEB_PROVENANCE, input)
    expect(report.entity_id).toBe(privateId)
  })
})
