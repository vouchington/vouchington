import { randomBytes, randomUUID } from 'node:crypto'
import { beforeEach, afterEach } from 'vitest'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createCopyrightFormIntake,
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'
import { linkCopyrightEmailIntakeToNotice } from '../services/copyright-notices/email-threading.mts'
import { createParsedCopyrightEmailIntake } from '../services/copyright-notices/email-intake-test-fixtures.mts'
import { appendCopyrightEmailIntakeRecommendation } from '../services/copyright-notices/email-recommendations.mts'
import { copyrightConfig } from '../services/copyright-notices/config.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

/** Test-fork switch override; never persists operator config into the shared database. */
export function useCopyrightMcpDecisionTools(enabled = true): void {
  let restore: (() => void) | undefined
  beforeEach(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      mcpDecisionTools: enabled,
    })
  })
  afterEach(() => {
    restore?.()
    restore = undefined
  })
}

/** A real guest form awaiting a staff review, with a hosted image owned by a separate poster. */
export async function createMcpCopyrightFormIntake() {
  const { claimant, postId, imageId } = await createHostedImagePost('public')
  return createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Synthetic copyright claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'An original photograph.',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Synthetic claimant',
      claimantTargets: [
        {
          surfaceKind: 'post-image',
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  })
}

/** Stores one latest recommendation on a fresh parsed intake. */
export async function createRecommendedMcpCopyrightEmailIntake(
  structuredOutput: Record<string, unknown>,
) {
  const intake = await createParsedCopyrightEmailIntake()
  await appendCopyrightEmailIntakeRecommendation({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    promptVersion: 'copyright-email-intake-v1',
    model: 'synthetic-test-model',
    structuredOutput,
  })
  return intake
}

/** A linked, parsed email with one eligible target and a fresh model recommendation. */
export async function createRecommendedMcpCopyrightCorrespondence(
  structuredOutput: Record<string, unknown>,
) {
  const poster = await createTestUser()
  const postId = await insertTestPost({
    title: `MCP correspondence ${randomUUID()}`,
    slug: `mcp-correspondence-${randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(poster.id)
  const placementId = await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${randomUUID()}`,
    workDescription: 'Original photograph',
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'email',
      bodyCiphertext: 'ciphertext',
    },
    targets: [
      {
        placementId,
        placementRevision: 1,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      },
    ],
  })
  const targetId = (await getCopyrightNoticePrivateAggregate(notice.id))?.targets[0]?.id
  if (!targetId) throw new Error('Correspondence target missing')
  const sesMessageId = `ses-mcp-${randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 8),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `poster-${randomUUID()}@example.test`,
    subject: 'Counter-notice',
    bodyText: 'I dispute the restriction.',
    messageId: `<${randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: intake.id,
    noticeId: notice.id,
    linkKind: 'thread',
  })
  await appendCopyrightEmailIntakeRecommendation({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    promptVersion: 'copyright-email-intake-v1',
    model: 'synthetic-test-model',
    structuredOutput,
  })
  return { intake, noticeId: notice.id, targetId }
}
