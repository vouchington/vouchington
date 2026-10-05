import { randomBytes } from 'node:crypto'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestImage, insertTestPostImage } from '@voucha/test-helpers'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import {
  createMcpCopyrightFormIntake,
  createRecommendedMcpCopyrightEmailIntake,
  publishTestHostedPostImageDelivery,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightFormReviewActor } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
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

  it('accepts only server-owned fields for email approval and rejection', async () => {
    const admin = await createTestUser({ administrator: true })
    const id = crypto.randomUUID()
    for (const name of ['approve_copyright_email_intake', 'reject_copyright_email_intake']) {
      await expect(
        callTestCopyrightWriteTool(admin, name, {
          intake_id: id,
          rationale: 'Human staff determination.',
          claimant_email: 'injected@example.test',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
      await expect(
        callTestCopyrightWriteTool(admin, name, {
          intake_id: id,
          rationale: 'Human staff determination.',
          reply_email: 'injected@example.test',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    }
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

  it('approves only a complete latest recommendation resolving to one hosted image', async () => {
    const admin = await createTestUser({ administrator: true })
    installTestMediaDeliveryEdge()
    const hosted = await createHostedImagePost('public')
    await publishTestHostedPostImageDelivery(hosted.postId, hosted.imageId)
    const valid = {
      claimant_contact: 'Synthetic claimant contact',
      claimant_email: 'claimant@example.test',
      work_description: 'An original photograph.',
      electronic_signature: 'Synthetic claimant',
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      target_urls: [`https://voucha.ai/discussion/${hosted.postId}`],
    }
    const rationale = 'Staff verified the recommendation against the hosted image.'
    const noRecommendation = await createParsedCopyrightEmailIntake()
    const noRecommendationResult = await callTestCopyrightWriteTool(
      admin,
      'approve_copyright_email_intake',
      { intake_id: noRecommendation.id, rationale },
    )
    expect(noRecommendationResult.isError).toBe(true)
    expect(await readCopyrightEmailIntakeReview(noRecommendation.id)).toEqual([])

    const invalid = [
      { ...valid, claimant_contact: '' },
      { ...valid, has_good_faith_belief: false },
      {
        ...valid,
        target_urls: [`https://voucha.ai/discussion/${crypto.randomUUID()}`],
      },
    ]
    const ambiguous = await createHostedImagePost('public')
    await publishTestHostedPostImageDelivery(ambiguous.postId, ambiguous.imageId)
    const secondImageId = await insertTestImage(ambiguous.poster.id)
    await insertTestPostImage({
      postId: ambiguous.postId,
      imageId: secondImageId,
    })
    await publishTestHostedPostImageDelivery(ambiguous.postId, secondImageId)
    invalid.push({
      ...valid,
      target_urls: [`https://voucha.ai/discussion/${ambiguous.postId}`],
    })
    for (const output of invalid) {
      const intake = await createRecommendedMcpCopyrightEmailIntake(output)
      const result = await callTestCopyrightWriteTool(admin, 'approve_copyright_email_intake', {
        intake_id: intake.id,
        rationale,
      })
      expect(result.isError).toBe(true)
      const block = result.content[0]
      if (block?.type !== 'text') throw new Error('Expected approval validation error')
      expect(JSON.parse(block.text)).toMatchObject({ error: { status: 422 } })
      expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([])
    }

    const intake = await createRecommendedMcpCopyrightEmailIntake(valid)
    const approved = await callTestCopyrightWriteTool(admin, 'approve_copyright_email_intake', {
      intake_id: intake.id,
      rationale,
    })
    expect(approved.isError).not.toBe(true)
    expect(approved.structuredContent).toMatchObject({
      copyright_notice: { id: expect.any(String) },
      copyright_submission: { id: expect.any(String) },
    })
    expect(await readCopyrightEmailIntakeReview(intake.id)).toMatchObject([
      {
        decision: 'approved',
        promoted_copyright_notice_id: expect.any(String),
      },
    ])
  })
})
