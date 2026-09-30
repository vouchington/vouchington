import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../entities/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import {
  admitCopyrightEmailCorrespondence,
  createCopyrightEmailIntake,
  createCopyrightNoticeAggregate,
  recordCopyrightEmailParse,
} from '../../../services/copyright-notices/index.mts'
import { linkCopyrightEmailIntakeToNotice } from '../../../services/copyright-notices/email-threading.mts'

export async function createTestCopyrightStaff(): Promise<PrivateUser> {
  const record = await createTestUserDirect()
  return { ...record, roles: ['moderator'] } as PrivateUser
}

export async function openTestGuestCopyrightNotice(): Promise<string> {
  const owner = await createTestUserDirect()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `guest capability ${crypto.randomUUID()}`,
    slug: `guest-capability-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'guest_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return notice.id
}

/** Admits a threaded claimant email as a withdrawal of the notice. */
export async function admitTestCopyrightEmailWithdrawal(input: {
  noticeId: string
  moderator: PrivateUser
}): Promise<void> {
  const sesMessageId = `ses-withdrawal-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 9),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: 'claimant@example.test',
    subject: 'Withdrawal',
    bodyText: 'I withdraw my copyright notice.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: intake.id,
    noticeId: input.noticeId,
    linkKind: 'thread',
  })
  await admitCopyrightEmailCorrespondence({
    currentUser: input.moderator,
    intakeId: intake.id,
    kind: 'withdrawal',
    targetIds: [],
    structuredSubmission: { summary: 'The claimant withdraws the notice.' },
    rationale: 'The claimant withdrew the notice by email.',
    recommendationId: null,
    manualFallbackReason: 'Agent output is unavailable.',
  })
}
