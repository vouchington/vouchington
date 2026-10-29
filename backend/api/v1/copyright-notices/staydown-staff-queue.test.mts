import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import * as imageEnqueues from '@queues/content-analysis/enqueues/image-jobs'
import {
  fillCopyrightStaydownEntryHash,
  recordCopyrightStaydownPerceptualMatches,
  recordCopyrightStaydownExactMatch,
} from '@services/copyright-notices/staydown-matches'
import {
  createTestUser,
  insertTestImage,
  setTestUserProfileImage,
  getTestImageSurfacePlacements,
  softDeleteUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { deliverInitialCopyrightWithhold } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  readCopyrightStaydownEntries,
  readCopyrightStaydownMatches,
} from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'

type StaffRequest = ReturnType<typeof createRequest>

type QueueCase = {
  id: string
  reasons: string[]
  waiting_since: string
  action_intents: Array<{ id: string; target_id: string }>
  staydown_matches: Array<{
    id: string
    image_id: string
    registered_image_id: string
    target_id: string
    uploaded_by_id: string
    uploaded_by_username: string | null
    image_placement: { image_id: string; placement_id: string; placement_revision: number } | null
    match_kind: string
    hamming_distance: number
  }>
  staydown_matches_has_more: boolean
}

/**
 * A form case a moderator accepted over HTTP, which registers its image for staydown, then
 * re-uploaded by another member: the case staff see when staydown finds a match.
 */
async function createMatchedCase() {
  const { notice } = await createClearScreenedForm()
  const noticeId = notice.intake.copyright_notice_id
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const staff = createRequest()
  await staff.authenticateAs(moderator)
  await staff
    .post(`/api/v1/copyright-form-intakes/${notice.intake.id}/reviews`)
    .send({ is_accepted: true, rationale: 'The signed notice is complete.' })
    .expect(200)
  // Acceptance records an intent; execute its normal delivery path before asserting withheld media.
  await deliverInitialCopyrightWithhold(noticeId, {})
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const imageId = aggregate!.targets[0]!.image_id
  const uploader = await createTestUser()
  await recordCopyrightStaydownExactMatch({ imageId, uploadedById: uploader.id })
  const [match] = await readCopyrightStaydownMatches(noticeId)
  return {
    noticeId,
    moderator,
    staff,
    imageId,
    uploader,
    targetId: aggregate!.targets[0]!.id,
    matchId: match!.id,
  }
}

async function readQueuedCase(staff: StaffRequest, noticeId: string) {
  const after = await readCopyrightStaffQueueCursorBefore([noticeId])
  const page = await staff
    .get(`/api/v1/copyright-notices/review-queue?limit=1&after=${encodeURIComponent(after)}`)
    .expect(200)
  return (page.body.copyright_notices as QueueCase[])[0]
}

describe('copyright staydown staff review', () => {
  useCopyrightIntakeEnvironment()
  useStaydownMatching()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(imageEnqueues, 'enqueueStaydownHash').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers the image a moderator confirms over HTTP and lists a re-upload on the staff queue', async () => {
    const matched = await createMatchedCase()

    expect(await readCopyrightStaydownEntries(matched.noticeId)).toEqual([
      expect.objectContaining({ image_id: matched.imageId }),
    ])
    const queued = await readQueuedCase(matched.staff, matched.noticeId)
    expect(queued).toMatchObject({
      id: matched.noticeId,
      reasons: expect.arrayContaining(['staydown_review']),
      waiting_since: expect.any(String),
      action_intents: [expect.objectContaining({ target_id: matched.targetId })],
      staydown_matches: [
        {
          id: matched.matchId,
          image_id: matched.imageId,
          registered_image_id: matched.imageId,
          target_id: matched.targetId,
          uploaded_by_id: matched.uploader.id,
          uploaded_by_username: matched.uploader.username,
          image_placement: null,
          match_kind: 'exact',
          hamming_distance: 0,
        },
      ],
    })
    expect(Date.parse(queued!.waiting_since)).toBeLessThanOrEqual(Date.now())
  })

  it('offers only live, permitted placements for inspecting matched image bytes', async () => {
    const matched = await createMatchedCase()
    const imageId = await insertTestImage(matched.uploader.id)
    const hash = '01'.repeat(32)
    await fillCopyrightStaydownEntryHash({ imageId: matched.imageId, perceptualHash: hash })
    await recordCopyrightStaydownPerceptualMatches({ imageId, perceptualHash: hash })
    await setTestUserProfileImage(matched.uploader.id, imageId)
    const [placement] = await getTestImageSurfacePlacements({ userId: matched.uploader.id })

    const queued = await readQueuedCase(matched.staff, matched.noticeId)
    expect(queued?.staydown_matches.find(match => match.image_id === imageId)).toMatchObject({
      uploaded_by_username: matched.uploader.username,
      image_placement: {
        image_id: imageId,
        placement_id: placement!.placement_id,
        placement_revision: placement!.placement_revision,
      },
    })
    // The original placement is withheld by the accepted case, so no preview may bypass it.
    expect(
      queued?.staydown_matches.find(match => match.image_id === matched.imageId)?.image_placement,
    ).toBeNull()

    await setTestUserProfileImage(matched.uploader.id, await insertTestImage(matched.uploader.id))
    const afterReplacement = await readQueuedCase(matched.staff, matched.noticeId)
    expect(
      afterReplacement?.staydown_matches.find(match => match.image_id === imageId)?.image_placement,
    ).toBeNull()

    await setTestUserProfileImage(matched.uploader.id, imageId)
    await softDeleteUser(matched.uploader.id)
    const afterDeletion = await readQueuedCase(matched.staff, matched.noticeId)
    expect(afterDeletion?.staydown_matches.find(match => match.image_id === imageId)).toMatchObject(
      {
        uploaded_by_username: null,
        image_placement: null,
      },
    )
  })

  it('shows a bounded first page of pending matches and signals more work', async () => {
    const matched = await createMatchedCase()
    for (let index = 0; index < 25; index++) {
      const uploader = await createTestUser()
      await recordCopyrightStaydownExactMatch({
        imageId: matched.imageId,
        uploadedById: uploader.id,
      })
    }

    const queued = await readQueuedCase(matched.staff, matched.noticeId)
    expect(queued?.staydown_matches).toHaveLength(25)
    expect(queued?.staydown_matches_has_more).toBe(true)
  })

  it('drops the match from the case once staff mark it reviewed, and only once', async () => {
    const matched = await createMatchedCase()
    const reviewPath = `/api/v1/copyright-notices/${matched.noticeId}/staydown-matches/${matched.matchId}/reviews`

    const first = await matched.staff.post(reviewPath).expect(200)
    const second = await matched.staff.post(reviewPath).expect(200)

    expect(first.body).toEqual({ reviewed: true })
    expect(second.body).toEqual({ reviewed: false })
    expect(await readCopyrightStaydownMatches(matched.noticeId)).toEqual([
      expect.objectContaining({
        id: matched.matchId,
        reviewed_at: expect.any(Date),
        reviewed_by_id: matched.moderator.id,
      }),
    ])
    const queued = await readQueuedCase(matched.staff, matched.noticeId).catch(() => undefined)
    expect(queued?.reasons ?? []).not.toContain('staydown_review')
    expect(queued?.staydown_matches ?? []).toEqual([])
  })

  it('answers 404 and leaves the match open when it is reviewed under a different case', async () => {
    const matched = await createMatchedCase()
    const other = await createMatchedCase()

    await matched.staff
      .post(
        `/api/v1/copyright-notices/${other.noticeId}/staydown-matches/${matched.matchId}/reviews`,
      )
      .expect(404)

    expect(await readCopyrightStaydownMatches(matched.noticeId)).toEqual([
      expect.objectContaining({ id: matched.matchId, reviewed_at: null }),
    ])
  })

  it('keeps the queue and the review action to copyright staff', async () => {
    const matched = await createMatchedCase()
    const reviewPath = `/api/v1/copyright-notices/${matched.noticeId}/staydown-matches/${matched.matchId}/reviews`
    const member = createRequest()
    await member.authenticateAs(await createTestUser())

    await createRequest().post(reviewPath).expect(401)
    await member.post(reviewPath).expect(403)
    await member.get('/api/v1/copyright-notices/review-queue').expect(403)

    expect(await readCopyrightStaydownMatches(matched.noticeId)).toEqual([
      expect.objectContaining({ reviewed_at: null }),
    ])
  })
})
