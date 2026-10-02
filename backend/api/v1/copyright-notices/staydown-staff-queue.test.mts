import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import * as imageEnqueues from '@queues/images/enqueues'
import { recordCopyrightStaydownExactMatch } from '@services/copyright-notices/staydown-matches'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
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
  staydown_matches: Array<{
    id: string
    image_id: string
    registered_image_id: string
    uploaded_by_id: string
    match_kind: string
    hamming_distance: number
  }>
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
    .send({ accepted: true, rationale: 'The signed notice is complete.' })
    .expect(200)
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const imageId = aggregate!.targets[0]!.image_id
  const uploader = await createTestUser()
  await recordCopyrightStaydownExactMatch({ imageId, uploadedById: uploader.id })
  const [match] = await readCopyrightStaydownMatches(noticeId)
  return { noticeId, moderator, staff, imageId, uploader, matchId: match!.id }
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
      staydown_matches: [
        {
          id: matched.matchId,
          image_id: matched.imageId,
          registered_image_id: matched.imageId,
          uploaded_by_id: matched.uploader.id,
          match_kind: 'exact',
          hamming_distance: 0,
        },
      ],
    })
    expect(Date.parse(queued!.waiting_since)).toBeLessThanOrEqual(Date.now())
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
