import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { lookupRetainedCopyrightEmailIntakes } from './retained-email-intake-lookup.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { eraseTestCopyrightEmailIntakeSender } from '@voucha/test-helpers/copyright-email-intake-retention'

describe('retained copyright email intake lookup', () => {
  it('finds a decided unlinked intake after it leaves the queue and lists senderless MIME candidates', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const address = `claimant-${crypto.randomUUID()}@example.test`
    const rejected = await createParsedCopyrightEmailIntake(new Date(), address.toUpperCase())
    const unparsed = await createUnparsedCopyrightEmailIntake()
    const failed = await createUnparsedCopyrightEmailIntake()
    await recordCopyrightEmailParse(failed, {
      status: 'failed',
      error: 'Synthetic MIME parse failure',
    })
    const unrelated = await createParsedCopyrightEmailIntake()
    await rejectCopyrightEmailIntake({
      currentUser: staff,
      intakeId: rejected.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })
    await rejectCopyrightEmailIntake({
      currentUser: staff,
      intakeId: failed.id,
      recommendationId: null,
      manualFallbackReason: 'Unreadable MIME',
      rationale: 'Cannot parse notice',
    })
    const queue = await searchCopyrightStaffEmailIntakes(staff, {
      limit: 100,
      intakeIds: [rejected.id, failed.id],
    })
    expect(queue.intakes).toEqual([])
    const result = await lookupRetainedCopyrightEmailIntakes(staff, {
      senderAddress: ` ${address} `,
      limit: 100,
      intakeIds: [rejected.id, unparsed.id, failed.id, unrelated.id],
    })
    expect(result.matches).toEqual([{ id: rejected.id, linked_notice_id: null }])
    expect(result.raw_review_candidates.map(intake => intake.id).toSorted()).toEqual(
      [unparsed.id, failed.id].toSorted(),
    )
    expect(result.scanned_count).toBe(4)
    expect(result.next_cursor).toBeNull()
  })

  it('advances over empty match pages and same-timestamp rows without skipping or repeating', async () => {
    const staff = await createTestUser({ extraRoles: ['moderator'] })
    const receivedAt = new Date()
    const address = `claimant-${crypto.randomUUID()}@example.test`
    const unrelated = await createParsedCopyrightEmailIntake(receivedAt)
    const matching = await createParsedCopyrightEmailIntake(receivedAt, address)
    const ids = [unrelated.id, matching.id].toSorted()
    const first = await lookupRetainedCopyrightEmailIntakes(staff, {
      senderAddress: address,
      limit: 1,
      intakeIds: ids,
    })
    expect(first.scanned_count).toBe(1)
    expect(first.matches).toEqual(
      ids[0] === matching.id ? [{ id: matching.id, linked_notice_id: null }] : [],
    )
    expect(first.next_cursor).toEqual(expect.any(String))
    await expect(
      lookupRetainedCopyrightEmailIntakes(staff, {
        senderAddress: `other-${crypto.randomUUID()}@example.test`,
        limit: 1,
        intakeIds: ids,
        after: first.next_cursor!,
      }),
    ).rejects.toMatchObject({ status: 400 })
    const second = await lookupRetainedCopyrightEmailIntakes(staff, {
      senderAddress: address,
      limit: 1,
      intakeIds: ids,
      after: first.next_cursor!,
    })
    expect([...first.matches, ...second.matches]).toEqual([
      { id: matching.id, linked_notice_id: null },
    ])
    expect(second.scanned_count).toBe(1)
    expect(second.next_cursor).toBeNull()
    await expect(
      lookupRetainedCopyrightEmailIntakes(staff, {
        senderAddress: address,
        limit: 1,
        after: 'invalid',
        intakeIds: ids,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects nonstaff and invalid lookup inputs', async () => {
    const member = await createTestUser()
    const staff = await createTestUser({ extraRoles: ['administrator'] })
    await expect(
      lookupRetainedCopyrightEmailIntakes(
        { ...staff, suspended_at: new Date() },
        {
          senderAddress: 'claimant@example.test',
          limit: 1,
          intakeIds: [],
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      lookupRetainedCopyrightEmailIntakes(member, {
        senderAddress: 'claimant@example.test',
        limit: 1,
        intakeIds: [],
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      lookupRetainedCopyrightEmailIntakes(staff, {
        senderAddress: 'invalid',
        limit: 1,
        intakeIds: [],
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      lookupRetainedCopyrightEmailIntakes(staff, {
        senderAddress: 'claimant@example.test',
        limit: 101,
        intakeIds: [],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('returns linked case IDs and respects sender and original erasure', async () => {
    const scene = await createRetentionMinimalCase()
    const address = `claimant-${crypto.randomUUID()}@example.test`
    const linked = await createParsedCopyrightEmailIntake(new Date(), address)
    const erased = await createParsedCopyrightEmailIntake(new Date(), address)
    const rawOnly = await createParsedCopyrightEmailIntake(new Date(), address)
    await linkCopyrightEmailIntakeToNotice({
      intakeId: linked.id,
      noticeId: scene.noticeId,
      linkKind: 'initial',
    })
    await eraseTestCopyrightEmailIntakeSender(erased.id, true)
    await eraseTestCopyrightEmailIntakeSender(rawOnly.id, false)
    const result = await lookupRetainedCopyrightEmailIntakes(scene.moderator, {
      senderAddress: address,
      limit: 100,
      intakeIds: [linked.id, erased.id, rawOnly.id],
    })
    expect(result.matches).toEqual([{ id: linked.id, linked_notice_id: scene.noticeId }])
    expect(result.raw_review_candidates).toEqual([{ id: rawOnly.id, linked_notice_id: null }])
    expect(result.scanned_count).toBe(3)
  })
})
