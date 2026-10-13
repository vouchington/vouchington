import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { createCopyrightEmailIntake } from '../../../services/copyright-notices/email-intakes.mts'
import { recordCopyrightEmailParse } from '../../../services/copyright-notices/email-intake-parses.mts'
import { promoteCopyrightEmailIntake } from '../../../services/copyright-notices/email-promotion.mts'
import type { CopyrightEmailThreadMatch } from '../../../services/copyright-notices/email-threading.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './email-ses-verdicts.mts'

export function copyrightEmailMessageId(): string {
  return `<${crypto.randomUUID()}@example.test>`
}

/** Parses one owned intake. `messageId` is stored as this intake's Message-ID. */
export async function recordThreadedCopyrightEmail(input: {
  messageId: string | null
  inReplyTo?: string[]
  replyReferences?: string[]
  bodyText?: string
}): Promise<{
  intakeId: string
  match: CopyrightEmailThreadMatch | null
}> {
  const sesMessageId = `ses-thread-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 4),
    rawMimeType: 'message/rfc822',
    rawByteSize: 24,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  const match = await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
    subject: 'Copyright notice',
    bodyText: input.bodyText ?? 'Threaded copyright email.',
    messageId: input.messageId,
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    replyReferences: input.replyReferences ?? [],
    attachments: [],
  })
  return { intakeId: intake.id, match }
}

/** Placement and statutory fields for admitting one already-parsed initial intake. */
export async function copyrightEmailPromotionInput(moderator: PrivateUser, intakeId: string) {
  const poster = await createTestUser()
  const postId = await insertTestPost({
    title: `Copyright thread ${crypto.randomUUID()}`,
    slug: `copyright-thread-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(poster.id)
  const placementId = await insertTestPostImage({ postId, imageId })
  return {
    currentUser: moderator,
    intakeId,
    recommendationId: null,
    manualFallbackReason: 'The agent recommendation is unavailable.',
    jurisdiction: 'us_dmca' as const,
    claimantDisplayName: null,
    claimantContact: 'claimant@example.test',
    claimantEmail: 'claimant@example.test',
    workDescription: 'Original photograph',
    goodFaithBelief: true,
    accuracyAuthorityUnderPenaltyOfPerjury: true,
    electronicSignature: 'Claimant',
    targets: [
      {
        placementId,
        placementRevision: 1,
        imageId,
        bindingFamily: 'post' as const,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      },
    ],
    rationale: 'The root email is a complete statutory notice.',
  }
}

/** Admits an initial intake as its own case so later replies can resolve to it. */
export async function promoteInitialCopyrightEmail(input: {
  moderator: PrivateUser
  messageId: string
}): Promise<{ intakeId: string; noticeId: string }> {
  const { intakeId } = await recordThreadedCopyrightEmail({
    messageId: input.messageId,
    replyReferences: [],
  })
  const promoted = await promoteCopyrightEmailIntake(
    await copyrightEmailPromotionInput(input.moderator, intakeId),
  )
  return { intakeId, noticeId: promoted.noticeId }
}
