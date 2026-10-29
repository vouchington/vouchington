import { createRequest } from '@voucha/test-helpers/api/server'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { readCopyrightReceiptPreservationState } from '@voucha/test-helpers/copyright-retention-review-routes'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { sweepUnlinkedCopyrightEmailIntakes } from '@services/copyright-notices/operational-retention-email-intakes'
import { describe, expect, it } from 'vitest'

const DAY_MS = 24 * 60 * 60 * 1_000
const holdPath = (id: string) => `/api/v1/copyright-email-intakes/${id}/preservation-holds`

describe('copyright email receipt preservation routes', () => {
  useCopyrightOperationalCursorReservation()
  const bucket = useFakeCopyrightEvidenceBucket()

  it('requires an active copyright reviewer for receipt preservation', async () => {
    const intake = await createParsedCopyrightEmailIntake()
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    const reviewer = createRequest()
    await reviewer.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))

    await createRequest().post(holdPath(intake.id)).send({ kind: 'court_request' }).expect(401)
    await member.post(holdPath(intake.id)).send({ kind: 'court_request' }).expect(403)
    await reviewer.post(holdPath(intake.id)).send({ kind: 'unknown_reason' }).expect(422)
    expect(await readCopyrightReceiptPreservationState(intake.id)).toMatchObject({
      current_preservation_hold_token: null,
    })
  })

  it('preserves a legal-process receipt through private intake erasure and rejects stale release', async () => {
    const reviewer = await createTestUser({ extraRoles: ['moderator'] })
    const staff = createRequest()
    await staff.authenticateAs(reviewer)
    const intake = await createParsedCopyrightEmailIntake()
    bucket.put(intake.raw_storage_key)
    await staff
      .post(`/api/v1/copyright-email-intakes/${intake.id}/legal-process`)
      .send({ reason: 'A separate legal request concerns this email.' })
      .expect(201)

    const first = await staff.post(holdPath(intake.id)).send({ kind: 'court_request' }).expect(201)
    const firstToken = first.body.copyright_email_intake_preservation_hold.token as string
    expect(first.body.copyright_email_intake_preservation_hold).toMatchObject({
      token: expect.any(String),
      kind: 'court_request',
      placed_at: expect.any(String),
    })
    expect(await readCopyrightReceiptPreservationState(intake.id)).toMatchObject({
      current_preservation_hold_token: firstToken,
      preservation_hold_kind: 'court_request',
      preservation_hold_placed_by_id: reviewer.id,
    })
    const sweepOptions = {
      now: new Date(Date.now() + 91 * DAY_MS),
      retentionDays: 90,
      childLimit: 20,
      maxBatches: 10,
    }
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    expect(await sweepUnlinkedCopyrightEmailIntakes(sweepOptions)).toMatchObject({ erased: 0 })
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: true,
    })
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(1)

    const releasePath = (token: string) => `${holdPath(intake.id)}/${token}/releases`
    await staff.post(releasePath(crypto.randomUUID())).expect(409)
    const firstRelease = await staff.post(releasePath(firstToken)).expect(201)
    expect(firstRelease.body.copyright_email_intake_preservation_hold_release.released_at).toEqual(
      expect.any(String),
    )
    await staff.post(releasePath(firstToken)).expect(409)
    const firstClock = (await readCopyrightReceiptPreservationState(intake.id))!
    expect(firstClock.current_preservation_hold_token).toBeNull()
    expect(firstClock.preservation_hold_released_by_id).toBe(reviewer.id)
    expect(firstClock.last_preservation_hold_released_at).not.toBeNull()

    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    await sweepUnlinkedCopyrightEmailIntakes(sweepOptions)
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
    })
    expect(bucket.countVersions(intake.raw_storage_key)).toBe(0)

    const replacement = await staff
      .post(holdPath(intake.id))
      .send({ kind: 'regulator_request' })
      .expect(201)
    const replacementToken = replacement.body.copyright_email_intake_preservation_hold
      .token as string
    expect(replacementToken).not.toBe(firstToken)
    await staff.post(releasePath(firstToken)).expect(409)
    expect(await readCopyrightReceiptPreservationState(intake.id)).toMatchObject({
      current_preservation_hold_token: replacementToken,
      last_preservation_hold_released_at: firstClock.last_preservation_hold_released_at,
    })
    await staff.post(releasePath(replacementToken)).expect(201)
    const finalClock = (await readCopyrightReceiptPreservationState(intake.id))!
    expect(finalClock.current_preservation_hold_token).toBeNull()
    expect(finalClock.last_preservation_hold_released_at!.getTime()).toBeGreaterThanOrEqual(
      firstClock.last_preservation_hold_released_at!.getTime(),
    )
  })
})
