import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRecommendedMcpCopyrightEmailIntake,
  publishTestHostedPostImageDelivery,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  readCopyrightEmailIntakeNoticeLinks,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

type Outcome = { status: number; message?: string; noticeId?: string }
type Approve = (intakeId: string, body: Record<string, unknown>) => Promise<Outcome>

const rationale = 'Staff read the raw email and stated each declaration.'

async function restSurface(): Promise<Approve> {
  const staff = createRequest()
  await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return async (intakeId, body) => {
    const response = await staff
      .post(`/api/v1/copyright-email-intakes/${intakeId}/approvals`)
      .send(body)
    return {
      status: response.status,
      message: response.body.message,
      noticeId: response.body.copyright_notice?.id,
    }
  }
}

async function mcpSurface(): Promise<Approve> {
  const admin = await createTestUser({ administrator: true })
  return async (intakeId, body) => {
    const result = await callMcpTool(
      'approve_copyright_email_intake',
      { intake_id: intakeId, ...body },
      { ...admin, membership_plan: null },
      ['copyright-notices:read', 'copyright-notices:write'],
      ADMIN_MCP_SERVER_CONFIG,
      true,
    )
    if (!result.isError) {
      const notice = result.structuredContent?.['copyright_notice'] as { id: string } | undefined
      return { status: 201, noticeId: notice?.id }
    }
    const block = result.content[0]
    if (block?.type !== 'text') throw new Error('Expected a typed MCP error')
    const { error } = JSON.parse(block.text)
    return { status: error.status, message: error.message }
  }
}

const SURFACES = [
  ['REST', restSurface],
  ['MCP', mcpSurface],
] as const

async function approvalFixture(overrides: Record<string, unknown> = {}) {
  const { form } = await createCopyrightFormFixture()
  const [target] = form.targets
  await publishTestHostedPostImageDelivery(target!.post_id, target!.image_id)
  const intake = await createParsedCopyrightEmailIntake()
  const body = {
    ...form,
    rationale,
    manual_fallback_reason: 'No recommendation is available.',
    ...overrides,
  }
  return { intake, body }
}

describe('copyright email approval parity between REST and MCP', () => {
  useCopyrightMcpDecisionTools()
  useCopyrightIntakeEnvironment()
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(SURFACES)(
    '%s: the same valid body creates a notice that links the raw email',
    async (_name, surface) => {
      const approve = await surface()
      const { intake, body } = await approvalFixture({
        claimant_display_name: 'Caller stated name',
      })

      const outcome = await approve(intake.id, body)

      expect(outcome).toMatchObject({ status: 201, noticeId: expect.any(String) })
      const noticeId = outcome.noticeId!
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
        { decision: 'approved', promoted_copyright_notice_id: noticeId },
      ])
      await expect(readCopyrightEmailIntakeNoticeLinks(intake.id)).resolves.toEqual([
        { copyright_notice_id: noticeId, link_kind: 'initial' },
      ])
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      expect(aggregate?.notice.claimant_display_name).toBe('Caller stated name')
      expect(aggregate?.evidenceArtifacts).toEqual([
        expect.objectContaining({
          storage_key: intake.raw_storage_key,
          sha256: intake.raw_sha256,
          mime_type: 'message/rfc822',
        }),
      ])
    },
  )

  it.each([
    ['an untrue good-faith declaration', { has_good_faith_belief: false }],
    ['an untrue accuracy declaration', { has_accuracy_authority_under_penalty_of_perjury: false }],
    ['an invalid claimant email', { claimant_email: 'not-an-email' }],
  ])('answers 422 with the same message on both surfaces for %s', async (_label, override) => {
    const outcomes: Outcome[] = []
    for (const [, surface] of SURFACES) {
      const approve = await surface()
      const { intake, body } = await approvalFixture(override)
      outcomes.push(await approve(intake.id, body))
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
    }

    expect(outcomes[0]!.status).toBe(422)
    expect(outcomes[1]).toEqual(outcomes[0])
  })

  it.each([
    ['a missing good-faith declaration', 'has_good_faith_belief'],
    ['a missing accuracy declaration', 'has_accuracy_authority_under_penalty_of_perjury'],
    ['a missing claimant contact', 'claimant_contact'],
  ])('answers the same 422 on both surfaces for %s', async (_label, field) => {
    const outcomes: Outcome[] = []
    for (const [, surface] of SURFACES) {
      const approve = await surface()
      const { intake, body } = await approvalFixture()
      const withoutField = Object.fromEntries(Object.entries(body).filter(([key]) => key !== field))
      outcomes.push(await approve(intake.id, withoutField))
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
    }

    expect(outcomes[0]).toMatchObject({ status: 422 })
    expect(outcomes[1]).toEqual(outcomes[0])
  })

  it('treats the recommendation as guidance: the caller values win over the extraction', async () => {
    const approve = await mcpSurface()
    const { form } = await createCopyrightFormFixture()
    await publishTestHostedPostImageDelivery(form.targets[0]!.post_id, form.targets[0]!.image_id)
    const intake = await createRecommendedMcpCopyrightEmailIntake({
      claimant_name: 'Extracted claimant name',
      claimant_contact: 'Extracted contact',
      claimant_email: 'extracted@example.test',
      work_description: 'Extracted work',
      electronic_signature: 'Extracted signature',
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      target_urls: [],
    })
    const body = {
      ...form,
      claimant_display_name: 'Moderator corrected name',
      rationale,
      manual_fallback_reason: 'The extraction named the wrong claimant.',
    }

    const outcome = await approve(intake.id, body)

    expect(outcome.status).toBe(201)
    const aggregate = await getCopyrightNoticePrivateAggregate(outcome.noticeId!)
    expect(aggregate?.notice.claimant_display_name).toBe('Moderator corrected name')
  })

  it('keeps the tool hidden and rejected while copyright.mcpDecisionTools is off', async () => {
    const admin = await createTestUser({ administrator: true })
    const { intake, body } = await approvalFixture()

    await expect(
      callMcpTool(
        'approve_copyright_email_intake',
        { intake_id: intake.id, ...body },
        { ...admin, membership_plan: null },
        ['copyright-notices:read', 'copyright-notices:write'],
        ADMIN_MCP_SERVER_CONFIG,
        false,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MethodNotFound })
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
  })
})
