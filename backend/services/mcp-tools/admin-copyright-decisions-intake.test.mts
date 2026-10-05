import { randomBytes } from 'node:crypto'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createMcpCopyrightFormIntake,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { readTestCopyrightFormReviewActor } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readCopyrightEmailIntakeResponses } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from '@services/copyright-notices/email-intake-test-fixtures'
import { appendCopyrightEmailIntakeRecommendation } from '@services/copyright-notices/email-recommendations'
import { prepareCopyrightEmailDelivery } from '@services/copyright-notices'
import { copyrightIntakeRejectionText } from '@services/copyright-notices/statement-of-reasons-wording'

import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const callTestCopyrightWriteTool = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['copyright-notices:read', 'copyright-notices:write'],
    ADMIN_MCP_SERVER_CONFIG,
    true,
  )

describe('registered copyright intake write tools', () => {
  useCopyrightMcpDecisionTools()
  useCopyrightIntakeEnvironment()

  it('requires bounded rationale, rejects caller-supplied contact fields, and stores the credential owner as reviewer', async () => {
    const admin = await createTestUser({ administrator: true })
    const { intake } = await createMcpCopyrightFormIntake()
    const decision = { id: intake.id, is_accepted: true }

    await expect(
      callTestCopyrightWriteTool(admin, 'review_copyright_form_intake', decision),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    await expect(
      callTestCopyrightWriteTool(admin, 'review_copyright_form_intake', {
        ...decision,
        rationale: 'x'.repeat(10_001),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    await expect(
      callTestCopyrightWriteTool(admin, 'review_copyright_form_intake', {
        ...decision,
        rationale: 'The guest filing identifies the hosted image.',
        claimant_email: 'injected@example.test',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })

    const result = await callTestCopyrightWriteTool(admin, 'review_copyright_form_intake', {
      ...decision,
      rationale: 'The guest filing identifies the hosted image.',
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_notice: { id: intake.copyright_notice_id },
      copyright_submission: { id: intake.copyright_notice_submission_id },
      is_accepted: true,
    })
    expect(await readTestCopyrightFormReviewActor(intake.id)).toBe(admin.id)
  })

  it('accepts only server-owned fields for email rejection', async () => {
    const admin = await createTestUser({ administrator: true })
    const id = crypto.randomUUID()
    for (const injected of [
      { claimant_email: 'injected@example.test' },
      { reply_email: 'injected@example.test' },
    ])
      await expect(
        callTestCopyrightWriteTool(admin, 'reject_copyright_email_intake', {
          intake_id: id,
          rationale: 'Human staff determination.',
          ...injected,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
  })

  it('uses the stored recommendation and fixed rejection text, and queues no reply without a parsed sender', async () => {
    const admin = await createTestUser({ administrator: true })
    const parsed = await createParsedCopyrightEmailIntake()
    const unparsed = await createUnparsedCopyrightEmailIntake()
    const outcomes: Array<{
      queued: boolean
      subject: string | null
      text: string | null
    }> = []
    for (const intake of [parsed, unparsed]) {
      await appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        inputSha256: randomBytes(32),
        promptVersion: 'copyright-email-intake-v1',
        model: 'synthetic-test-model',
        structuredOutput: { recommendation: 'reject' },
      })
      const result = await callTestCopyrightWriteTool(admin, 'reject_copyright_email_intake', {
        intake_id: intake.id,
        rationale: 'Human staff found the email insufficient to open a case.',
      })
      expect(result.isError).not.toBe(true)
      const rejected = (await readCopyrightEmailIntakeResponses(intake.id)).find(
        response => response.delivery_kind === 'email_intake_rejected',
      )
      const delivery = rejected ? await prepareCopyrightEmailDelivery(rejected.id) : null
      outcomes.push({
        queued: result.structuredContent?.['reply_queued'] === true,
        subject: delivery?.subject ?? null,
        text: delivery?.text ?? null,
      })
    }
    expect(outcomes).toEqual([
      {
        queued: true,
        subject: 'We could not accept your copyright notice',
        text: copyrightIntakeRejectionText(parsed.received_at, true),
      },
      { queued: false, subject: null, text: null },
    ])
  })
})
