import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { receiveEuCopyrightNotice, receiveUkCopyrightNotice } from '@services/copyright-notices'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { linkCopyrightEmailIntakeToNotice } from '@services/copyright-notices/email-threading'
import { counterNoticeBody } from '@services/copyright-notices/route-test-fixtures'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'

const DAY_MS = 24 * 60 * 60 * 1000

// Cases already open before intake was switched off, created below the HTTP intake routes.
async function openUsCase() {
  const poster = await createTestUser()
  const imageId = await insertTestImage(poster.id)
  const postId = await insertTestPost({
    title: `kill switch case ${crypto.randomUUID()}`,
    slug: `kill-switch-case-${crypto.randomUUID()}`,
    createdById: poster.id,
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
  return { noticeId: notice.id, poster }
}

function territorialNotice() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
}

async function signedIn(user: Awaited<ReturnType<typeof createTestUser>>) {
  const request = createRequest()
  await request.authenticateAs(user)
  return request
}

describe('copyright in-case responses with intake switched off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts poster appeals and counter-notices on an existing case', async () => {
    const { noticeId, poster } = await openUsCase()
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const request = await signedIn(poster)
    await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({})
      .expect(503)
    const appeal = await request
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
      .expect(201)
    expect(appeal.body.is_duplicate).toBe(false)
    const counterNotice = await request
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(counterNoticeBody(targetId))
      .expect(201)
    expect(counterNotice.body.is_duplicate).toBe(false)
  })

  it('accepts staff capabilities and guest court, supplement, and withdrawal filings', async () => {
    const { noticeId } = await openUsCase()
    const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
    const issued = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString() })
      .expect(201)
    const guest = createRequest()
    for (const kind of ['supplement', 'court_or_ccb_hold', 'withdrawal']) {
      const filed = await guest
        .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
        .set('Copyright-Guest-Capability', issued.body.copyright_guest_capability.token)
        .send({ kind, statement: `Guest ${kind} filing ${crypto.randomUUID()}` })
        .expect(201)
      expect(filed.body.copyright_submission.kind).toBe(kind)
    }
  })

  // Email is ingested and reviewed while intake is off (#1443): staff record an emailed in-case
  // filing as correspondence, and the only email decision that stays closed is opening a new case.
  it('records an emailed filing on an existing case as correspondence', async () => {
    const { noticeId } = await openUsCase()
    const reply = await createParsedCopyrightEmailIntake()
    await linkCopyrightEmailIntakeToNotice({ intakeId: reply.id, noticeId, linkKind: 'thread' })
    const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
    const queued = await staff.get(`/api/v1/copyright-email-intakes/${reply.id}`).expect(200)
    expect(queued.body.copyright_email_intake).toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: noticeId },
    })

    const decision = {
      kind: 'supplement',
      rationale: 'The email supplements the existing case.',
      manual_fallback_reason: 'No recommendation is available while intake is off.',
      submission_summary: 'Additional hosted-use information.',
    }
    const path = `/api/v1/copyright-email-intakes/${reply.id}/correspondence`
    const admitted = await staff.post(path).send(decision).expect(201)
    expect(admitted.body).toMatchObject({
      copyright_notice: { id: noticeId },
      is_duplicate: false,
    })
    const replay = await staff.post(path).send(decision).expect(200)
    expect(replay.body.is_duplicate).toBe(true)
  })

  it('refuses to approve an emailed notice but still lets staff reject it', async () => {
    const [approved, rejected] = await Promise.all([
      createParsedCopyrightEmailIntake(),
      createParsedCopyrightEmailIntake(),
    ])
    const staff = await signedIn(await createTestUser({ extraRoles: ['moderator'] }))
    const decision = { rationale: 'Staff decision.', manual_fallback_reason: 'No agent output.' }

    const refused = await staff
      .post(`/api/v1/copyright-email-intakes/${approved.id}/approvals`)
      .send(decision)
      .expect(503)
    expect(refused.body.message).toBe('Copyright intake is not available')
    await expect(readCopyrightEmailIntakeReview(approved.id)).resolves.toEqual([])

    const rejection = await staff
      .post(`/api/v1/copyright-email-intakes/${rejected.id}/rejections`)
      .send(decision)
      .expect(200)
    expect(rejection.body).toEqual({ reply_queued: true })
    await expect(readCopyrightEmailIntakeReview(rejected.id)).resolves.toEqual([
      { decision: 'rejected', promoted_copyright_notice_id: null },
    ])
  })

  it('accepts EU and UK redress and staff decisions on existing territorial notices', async () => {
    const [claimant, moderator, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const admin = await signedIn(administrator)
    for (const [jurisdiction, prefix] of [
      ['eu_dsa', 'eu'],
      ['uk', 'uk'],
    ]) {
      await admin
        .post('/api/v1/copyright-territorial-policies')
        .send({
          jurisdiction,
          policy_version: `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        })
        .expect(201)
    }
    const claimantRequest = await signedIn(claimant)
    const staff = await signedIn(moderator)
    for (const route of ['/api/v1/copyright-eu-notices', '/api/v1/copyright-uk-notices']) {
      await claimantRequest
        .post(route)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({})
        .expect(503)
    }

    const eu = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), territorialNotice())
    const euNotice = `/api/v1/copyright-eu-notices/${eu.notice_id}`
    await staff
      .post(`${euNotice}/statements-of-reasons`)
      .send({ statement: 'Staff statement of reasons' })
      .expect(201)
    const euRedress = await claimantRequest
      .post(`${euNotice}/redress-requests`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ explanation: 'Please review the restriction' })
      .expect(201)
    await staff
      .post(
        `${euNotice}/redress-requests/${euRedress.body.copyright_eu_redress_request.id}/decisions`,
      )
      .send({ staff_disposition: 'maintain', rationale: 'Staff kept the statement' })
      .expect(201)
    await claimantRequest
      .post(`${euNotice}/supervised-complaints`)
      .send({
        authority_reference: `dsc-${crypto.randomUUID()}`,
        explanation: 'Complaint filed with the authority',
      })
      .expect(201)

    const uk = await receiveUkCopyrightNotice(claimant, crypto.randomUUID(), territorialNotice())
    const ukNotice = `/api/v1/copyright-uk-notices/${uk.notice_id}`
    await staff
      .post(`${ukNotice}/reviews`)
      .send({ rationale: 'Staff review rationale' })
      .expect(201)
    const ukRedress = await claimantRequest
      .post(`${ukNotice}/redress-requests`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ explanation: 'Please review this notice' })
      .expect(201)
    expect(ukRedress.body.copyright_uk_redress_request.is_duplicate).toBe(false)
  })
})
