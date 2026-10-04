import { randomBytes, randomUUID } from 'node:crypto'
import type { PrivateUser } from '../../../services/users/types.mts'
import { insertCopyrightEvidenceArtifact } from '../../data-stores/psql/copyright-evidence-artifacts.mts'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../entities/index.mts'
import { createCopyrightNoticeAggregate } from './create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'
import type { RetentionCase } from './retention-parsed-email.mts'

/** Stores one original on a submission; its bucket key is `storageKey`, or a fresh one. */
export async function addRetentionArtifact(
  submissionId: string,
  storageKey = `copyright-inbound/${randomUUID()}.pdf`,
): Promise<string> {
  await insertCopyrightEvidenceArtifact({
    submissionId,
    storageKey,
    sha256: randomBytes(32),
    mimeType: 'application/pdf',
    byteSize: 20,
  })
  return storageKey
}

export type MinimalRetentionCase = RetentionCase & {
  targetId: string
  submissionId: string
  /** The signed-in claimant, when the case was created with one. */
  claimantId: string | null
}

/**
 * A received notice with no screening, restriction or review, so no staff queue holds it open and
 * only the retention clock (and whatever a test adds) decides whether the sweep may erase it.
 * Each of `artifacts` stored originals gets its own bucket key, or reuses `sharedKey`. With
 * `claimant` the notice is filed by a signed-in account instead of an anonymous claimant.
 */
export async function createRetentionMinimalCase(
  options: { artifacts?: number; sharedKey?: string; claimant?: boolean } = {},
): Promise<MinimalRetentionCase> {
  const [poster, moderatorRecord, claimant] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
    options.claimant ? createTestUserDirect() : null,
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
  const imageId = await insertTestImage(poster.id)
  const postId = await insertTestPost({
    title: `retention minimal ${randomUUID()}`,
    slug: `retention-minimal-${randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: claimant?.id ?? null,
    claimantDisplayName: 'Claimant Name',
    claimantContactCiphertext: `ciphertext-${randomUUID()}`,
    workDescription: `Original photograph ${randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  const submissionId = aggregate?.submissions[0]?.id
  const targetId = aggregate?.targets[0]?.id
  if (!submissionId || !targetId) throw new Error('fixture notice disappeared')
  const evidenceKeys = await Promise.all(
    Array.from({ length: options.artifacts ?? 0 }, () =>
      addRetentionArtifact(submissionId, options.sharedKey),
    ),
  )
  return {
    noticeId: notice.id,
    moderator,
    posterId: poster.id,
    evidenceKeys,
    targetId,
    submissionId,
    claimantId: claimant?.id ?? null,
  }
}
