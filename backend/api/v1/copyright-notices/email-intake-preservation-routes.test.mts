import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  readCopyrightReceiptReview,
  seedCopyrightReceiptReview,
} from '@voucha/test-helpers/copyright-receipt-review-retirement'
import { sweepCopyrightReceiptReviews } from '@services/copyright-notices/retention-receipt-reviews'

const oldReview = new Date('2001-01-01T00:00:00.000Z')
const holdPath = (id: string) => `/api/v1/copyright-email-intakes/${id}/preservation-holds`
const releasePath = (id: string) => `${holdPath(id)}/releases`

async function createStaffRequest() {
  const staff = await createTestUser({ extraRoles: ['moderator'] })
  const request = createRequest()
  await request.authenticateAs(staff)
  return { staff, request }
}

describe('standalone copyright receipt preservation routes', () => {
  it('places a hold after private intake erasure and requires the exact token to release it', async () => {
    const { staff, request } = await createStaffRequest()
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: staff.id,
      reviewedAt: oldReview,
    })
    const placed = await request
      .post(holdPath(receipt.id))
      .send({ kind: 'court_request' })
      .expect(201)
    expect(placed.body.hold).toMatchObject({ kind: 'court_request', token: expect.any(String) })
    expect((await readCopyrightReceiptReview(receipt.id))?.current_preservation_hold_token).toBe(
      placed.body.hold.token,
    )
    await request.post(holdPath(receipt.id)).send({ kind: 'court_request' }).expect(409)

    await request
      .post(releasePath(receipt.id))
      .send({ hold_token: crypto.randomUUID() })
      .expect(409)
    const released = await request
      .post(releasePath(receipt.id))
      .send({ hold_token: placed.body.hold.token })
      .expect(201)
    expect(released.body.hold.released_at).toEqual(expect.any(String))
    await request
      .post(releasePath(receipt.id))
      .send({ hold_token: placed.body.hold.token })
      .expect(409)
    expect(
      (await readCopyrightReceiptReview(receipt.id))?.current_preservation_hold_token,
    ).toBeNull()
  })

  it('restricts both hold transitions to staff and validates closed request bodies', async () => {
    const { staff, request } = await createStaffRequest()
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: staff.id,
      reviewedAt: oldReview,
    })
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    await createRequest().post(holdPath(receipt.id)).send({ kind: 'court_request' }).expect(401)
    await member.post(holdPath(receipt.id)).send({ kind: 'court_request' }).expect(403)
    await member.post(releasePath(receipt.id)).send({ hold_token: crypto.randomUUID() }).expect(403)
    await request.post(holdPath(receipt.id)).send({ kind: 'unsupported' }).expect(422)
    await request
      .post(holdPath(receipt.id))
      .send({ kind: 'court_request', extra: true })
      .expect(422)
    await request.post(releasePath(receipt.id)).send({ hold_token: 'not-a-uuid' }).expect(422)
    expect(
      (await readCopyrightReceiptReview(receipt.id))?.current_preservation_hold_token,
    ).toBeNull()
  })

  it('cannot hold a final review after its finite retirement', async () => {
    const { staff, request } = await createStaffRequest()
    const receipt = await seedCopyrightReceiptReview({
      reviewerId: staff.id,
      reviewedAt: oldReview,
    })
    await sweepCopyrightReceiptReviews({ batchSize: 10, maxBatches: 1 })
    await request.post(holdPath(receipt.id)).send({ kind: 'court_request' }).expect(409)
    expect((await readCopyrightReceiptReview(receipt.id))?.review_decision).toBeNull()
  })
})
