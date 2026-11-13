import { assertCopyrightApiManualAssociation } from '@voucha/test-helpers/copyright-api-submission-outcomes'
import { assertCopyrightEmailApprovalAdmission } from '@voucha/test-helpers/copyright-api-admission-outcomes'
import {
  createCopyrightApiRecommendedIntake as createRecommendedMcpCopyrightEmailIntake,
  seedCopyrightApiManualAssociation,
} from '@voucha/test-helpers/copyright-api-admission-fixtures'
import { seedUnmatchedCopyrightEmailReply } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { randomUUID } from 'node:crypto'
import {
  publishTestHostedPostImageDelivery,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  readCopyrightEmailIntakeNoticeLinks,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createCommittedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-committed-intake'
import {
  createCopyrightNoticeForManualAssociation,
  readCopyrightEmailManualAssociationEvent,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { callMcpTool } from './call-tool.mts'
import { LEGAL_MCP_SERVER_CONFIG } from './config.mts'

type Outcome = { status: number; code?: string; message?: string; noticeId?: string }
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
      code: response.status === 409 ? response.body.code : undefined,
      message: response.body.message,
      noticeId: response.body.copyright_notice?.id,
    }
  }
}

async function mcpSurface(): Promise<Approve> {
  const admin = await createTestUser({ administrator: true })
  return async (intakeId, body) => {
    const result = await callMcpTool(
      'review_copyright_email_intake',
      { option: 'approve', arguments: { intake_id: intakeId, ...body } },
      { ...admin, membership_plan: null },
      ['copyright-notices:read', 'copyright-notices:write'],
      LEGAL_MCP_SERVER_CONFIG,
      true,
    )
    if (!result.isError) {
      const notice = result.structuredContent?.['copyright_notice'] as { id: string } | undefined
      return { status: 201, noticeId: notice?.id }
    }
    const block = result.content[0]
    if (block?.type !== 'text') throw new Error('Expected a typed MCP error')
    const { error } = JSON.parse(block.text)
    return {
      status: error.status,
      code: error.status === 409 ? error.code : undefined,
      message: error.message,
    }
  }
}

const SURFACES = [
  ['REST', restSurface],
  ['MCP', mcpSurface],
] as const

async function associateSurface(
  surface: 'REST' | 'MCP',
  intakeId: string,
  noticeId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (surface === 'REST') {
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const response = await staff
      .post(`/api/v1/copyright-email-intakes/${intakeId}/notice-associations`)
      .send({ copyright_notice_id: noticeId })
    return { status: response.status, body: response.body }
  }
  const admin = await createTestUser({ administrator: true })
  const response = await callMcpTool(
    'associate_copyright_email_intake_with_notice',
    { intake_id: intakeId, copyright_notice_id: noticeId },
    { ...admin, membership_plan: null },
    ['copyright-notices:read', 'copyright-notices:write'],
    LEGAL_MCP_SERVER_CONFIG,
    true,
  )
  if (!response.isError) return { status: 201, body: response.structuredContent ?? {} }
  const block = response.content[0]
  if (block?.type !== 'text') throw new Error('Expected a typed MCP error')
  const { error } = JSON.parse(block.text)
  return { status: error.status, body: error }
}

async function approvalFixture(overrides: Record<string, unknown> = {}) {
  const { form } = await createCopyrightFormFixture()
  const [target] = form.targets
  await publishTestHostedPostImageDelivery(target!.post_id, target!.image_id)
  const intake = await createCommittedCopyrightEmailIntake()
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

  it.each(['REST', 'MCP'] as const)(
    '%s associates one unresolved intake and returns the same case/intake pair',
    async surface => {
      const intake = await seedUnmatchedCopyrightEmailReply()
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const outcome = await associateSurface(surface, intake.id, noticeId)
      expect.hasAssertions()
      await assertCopyrightApiManualAssociation(outcome, intake.id, noticeId)
    },
  )

  it('lets staff resolve an existing case for the picker before acceptance', async () => {
    const workDescription = `searched-work-${randomUUID()}`
    const noticeId = await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      workDescription,
    )
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const response = await staff
      .get(`/api/v1/copyright-notices/association-targets?q=${encodeURIComponent(workDescription)}`)
      .expect(200)
    expect(response.body.copyright_notices).toContainEqual(
      expect.objectContaining({ id: noticeId, jurisdiction: 'us_dmca' }),
    )
  })

  it.each(['REST', 'MCP'] as const)(
    '%s returns 404 for a missing case and 409 for an intake already linked by staff',
    async surface => {
      const intake = await seedUnmatchedCopyrightEmailReply()
      const noticeId = await createCopyrightNoticeForManualAssociation()
      const missing = await associateSurface(surface, intake.id, crypto.randomUUID())
      expect(missing.status).toBe(404)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
      await seedCopyrightApiManualAssociation(intake.id, noticeId)
      const conflict = await associateSurface(surface, intake.id, noticeId)
      expect(conflict.status).toBe(409)
      expect(conflict.body.code).toBe('copyright_email_thread_changed')
      expect(await readCopyrightEmailManualAssociationEvent(intake.id)).toHaveLength(1)
    },
  )

  it.each(SURFACES)(
    '%s: the same valid body creates a notice that links the raw email',
    async (_name, surface) => {
      const approve = await surface()
      const { intake, body } = await approvalFixture({
        claimant_display_name: 'Caller stated name',
      })

      const outcome = await approve(intake.id, body)

      expect.hasAssertions()
      await assertCopyrightEmailApprovalAdmission(
        outcome,
        intake,
        'Caller stated name',
        body.targets[0]!.image_id,
      )
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

    expect.hasAssertions()
    await assertCopyrightEmailApprovalAdmission(
      outcome,
      intake,
      'Moderator corrected name',
      body.targets[0]!.image_id,
    )
  })

  it('keeps the tool hidden and rejected while copyright.mcpDecisionTools is off', async () => {
    const admin = await createTestUser({ administrator: true })
    const { intake, body } = await approvalFixture()

    await expect(
      callMcpTool(
        'review_copyright_email_intake',
        { option: 'approve', arguments: { intake_id: intake.id, ...body } },
        { ...admin, membership_plan: null },
        ['copyright-notices:read', 'copyright-notices:write'],
        LEGAL_MCP_SERVER_CONFIG,
        false,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MethodNotFound })
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
  })
})
