import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { addTestUserRole, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { createTestCopyrightMcpQueueCase } from '@voucha/test-helpers/copyright-mcp-read-fixtures'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { openTestGuestCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { createAcceptedCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/accepted-notice'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { listCopyrightStaffEmailIntakePage } from '@services/copyright-notices/copyright-email-intake-page'
import { copyrightStaffQueueCursorScope } from '@services/copyright-notices/read-models-staff'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { appendCopyrightEmailIntakeRecommendation } from '@services/copyright-notices/email-recommendations'
import { reviewCopyrightFormIntake } from '@services/copyright-notices/form-reviews'
import { findSchemaViolation } from '../schema-validator.mts'
import { ALL_TOOLS } from '../registry/index.mts'
import type { Tool } from '@services/openai-agents/tool-types'

function readTool<TArgs>(name: string): Tool<TArgs> {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === name)
  if (!tool) throw new Error(`Missing copyright read tool: ${name}`)
  return tool as Tool<TArgs>
}

describe('copyright admin MCP reads against live services', () => {
  it('omits raw email fields, lists bounded pages, and reads a staff case without guest tokens', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const intake = await createParsedCopyrightEmailIntake()
    const foreign = await createParsedCopyrightEmailIntake()
    const noticeId = await openTestGuestCopyrightNotice()

    const detail = (await readTool<{ id: string }>('get_copyright_email_intake').function(
      administrator,
    )({ id: intake.id })) as Record<string, unknown>
    expect(detail).toHaveProperty('copyright_email_intake')
    const projected = detail['copyright_email_intake'] as Record<string, unknown>
    expect(projected).toMatchObject({ id: intake.id, recommendation: null })
    expect(projected).not.toHaveProperty('raw_email')
    expect(projected).not.toHaveProperty('parsed_email')
    expect(projected).not.toHaveProperty('parser_error')

    // The MCP list stays unscoped. Shared tests pass owned ids to the page the tool calls.
    const queue = await listCopyrightStaffEmailIntakePage(administrator, {
      limit: 1,
      intakeIds: [intake.id],
    })
    expect(queue.copyright_email_intakes.map(item => item.id)).toEqual([intake.id])
    expect(queue.copyright_email_intakes.map(item => item.id)).not.toContain(foreign.id)
    expect(queue.page_info).toEqual({
      has_next_page: false,
      start_cursor: expect.any(String),
      end_cursor: null,
    })

    const capabilities = (await readTool<{ id: string; limit?: number }>(
      'list_copyright_guest_capabilities',
    ).function(administrator)({ id: noticeId, limit: 1 })) as {
      copyright_guest_capabilities: unknown[]
    }
    expect(capabilities.copyright_guest_capabilities).toEqual([])

    const acceptedNoticeId = await createAcceptedCopyrightNotice(await createCopyrightFormFixture())
    const staffCase = (await readTool<{ id: string }>('get_copyright_case').function(administrator)(
      { id: acceptedNoticeId },
    )) as { copyright_notice: Record<string, unknown> }
    expect(staffCase.copyright_notice).toMatchObject({ id: acceptedNoticeId, viewer_role: 'staff' })
    expect(staffCase.copyright_notice).toHaveProperty('submissions')
    expect(staffCase.copyright_notice).toHaveProperty('timeline')
  })
  it('redacts persisted recommendation contact before untrusted structured output is wrapped', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const intake = await createParsedCopyrightEmailIntake()
    const marker = crypto.randomUUID()
    const email = `intake-${marker}@example.test`
    const phone = '415-555-0181'
    const contactExcerpt = `source-contact-${marker}`
    await appendCopyrightEmailIntakeRecommendation({
      intakeId: intake.id,
      inputSha256: Buffer.alloc(32, 23),
      promptVersion: 'copyright-mcp-read-test',
      model: 'test-model',
      structuredOutput: {
        claimant_name: 'Claimant Name',
        claimant_contact: `17 Secret Lane ${marker}`,
        claimant_email: email,
        counter_notice_name: 'Poster Name',
        counter_notice_address: `29 Secret Lane ${marker}`,
        counter_notice_telephone: phone,
        counter_notice_electronic_signature: 'Poster Signature',
        submission_summary: `Please call ${phone}`,
        appeal_reason: `Please email ${email}`,
        work_description: `Work described by ${email}`,
        moderator_reasoning: `Check ${phone}`,
        missing_information: [`Reply to ${email}`],
        source_evidence: [
          { field: 'claimant_contact', excerpt: contactExcerpt },
          { field: 'claimant_email', excerpt: contactExcerpt },
          { field: 'counter_notice_address', excerpt: contactExcerpt },
          { field: 'counter_notice_telephone', excerpt: contactExcerpt },
          { field: 'counter_notice_name', excerpt: `Poster Name ${email}` },
        ],
      },
    })
    const tool = readTool<{ id: string }>('get_copyright_email_intake')
    const result = (await tool.function(administrator)({ id: intake.id })) as {
      copyright_email_intake: { recommendation: { structured_output: string } }
    }
    const intakeOutput = result.copyright_email_intake
    expect(intakeOutput).not.toHaveProperty('raw_email')
    expect(intakeOutput).not.toHaveProperty('parsed_email')
    expect(intakeOutput).not.toHaveProperty('parser_error')
    const wrapped = intakeOutput.recommendation.structured_output
    expect(wrapped).toContain('<external-content')
    expect(wrapped).toContain('[redacted]')
    expect(wrapped).toContain('Claimant Name')
    expect(wrapped).toContain('Poster Name')
    expect(wrapped).toContain('Poster Signature')
    expect(wrapped).not.toContain(email)
    expect(wrapped).not.toContain(phone)
    expect(wrapped).not.toContain(marker)
    expect(wrapped).not.toContain(contactExcerpt)
    expect(wrapped).not.toContain('"field":"claimant_email"')
    expect(wrapped).toContain('[email removed]')
    if (!tool.meta?.outputSchema) throw new Error('Email intake tool output schema missing')
    expect(findSchemaViolation(tool.meta.outputSchema, result)).toBeNull()
  })

  it('redacts claimant, counter-notice and hold contacts in an actual queued case before wrapping', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const scene = await createTestCopyrightMcpQueueCase()
    const tool = readTool<{ after?: string; limit?: number }>('list_copyright_review_queue')
    const [queueKey] = await readCopyrightStaffQueueCursorRows([scene.noticeId])
    if (!queueKey) throw new Error('Copyright staff queue fixture has no queued notices')
    const after = encodeScopedTierPreciseUuidCursor(
      queueKey.waiting_since,
      queueKey.tier,
      previousUuid(queueKey.id),
      copyrightStaffQueueCursorScope,
    )
    const result = (await tool.function(administrator)({ after, limit: 1 })) as {
      copyright_notices: Array<Record<string, unknown>>
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    if (!tool.meta?.outputSchema) throw new Error('Queue tool output schema missing')
    expect(findSchemaViolation(tool.meta.outputSchema, result)).toBeNull()
    expect(result.copyright_notices.map(item => item['id'])).toEqual([scene.noticeId])
    const item = result.copyright_notices[0]!
    const claimant = item['claimant'] as { display_name: string; contact: string }
    expect(claimant.display_name).toContain('Claimant Name')
    expect(claimant.contact).toContain('[redacted]')
    const serialized = JSON.stringify(item)
    expect(serialized).not.toContain(scene.contactEmail)
    expect(serialized).not.toContain(scene.phone)
    expect(serialized).not.toContain(scene.address)
    const counter = (item['counter_notices'] as Array<{ statement: string }>)[0]!
    const hold = (item['legal_holds'] as Array<{ statement: string }>)[0]!
    for (const statement of [counter.statement, hold.statement]) {
      expect(statement).toContain('[redacted]')
      expect(statement).not.toContain(scene.marker)
    }
    expect(counter.statement).toContain('Poster Name')
    expect(counter.statement).toContain('Poster Signature')
    expect(hold.statement).toContain('Counsel Name')
    const form = item['form_review'] as {
      screening: {
        rationale: string
        guidance: { summary: string; elements: Array<{ gap: string | null }> }
      }
    }
    expect(form.screening.rationale).toContain('<external-content')
    expect(form.screening.guidance.summary).toContain('<external-content')
    expect(
      form.screening.guidance.elements.some(element => element.gap?.includes('<external-content')),
    ).toBe(true)

    await reviewCopyrightFormIntake({
      intakeId: scene.intakeId,
      currentUser: administrator,
      is_accepted: true,
      rationale: 'The submitted notice is complete.',
    })
    const caseTool = readTool<{ id: string }>('get_copyright_case')
    for (const party of [scene.claimant, scene.poster]) {
      await addTestUserRole(party.id, 'administrator')
      const dualRole = await getTestPrivateUserById(party.id)
      if (!dualRole) throw new Error('Dual-role copyright party disappeared')
      expect(dualRole.roles).toContain('administrator')
      const detail = (await caseTool.function(dualRole)({ id: scene.noticeId })) as {
        copyright_notice: { viewer_role: string; submissions: unknown[] }
      }
      expect(detail.copyright_notice.viewer_role).toBe('staff')
      expect(detail.copyright_notice.submissions).toHaveLength(3)
      if (!caseTool.meta?.outputSchema) throw new Error('Case tool output schema missing')
      expect(findSchemaViolation(caseTool.meta.outputSchema, detail)).toBeNull()
    }
  })
})

/** Immediate UUID predecessor so a same-timestamp keyset starts on this notice. */
function previousUuid(id: string): string {
  const bytes = Buffer.from(id.replaceAll('-', ''), 'hex')
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    const value = bytes[index]!
    if (value === 0) {
      bytes[index] = 0xff
      continue
    }
    bytes[index] = value - 1
    break
  }
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
