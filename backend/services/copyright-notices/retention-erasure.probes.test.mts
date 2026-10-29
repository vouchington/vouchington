import { describe, expect, it } from 'vitest'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { seedUnusedCopyrightGuestCapability } from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import { issueCopyrightGuestCapability, revokeCopyrightGuestCapability } from './index.mts'
import { sweepCopyrightEvidenceRetention } from './retention-erasure.mts'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const none = { erased: 0, ineligible: 0, failed: [] }

describe('copyright evidence retention capability clocks', () => {
  const configure = useCopyrightRetentionConfig()
  useCopyrightOperationalCursorReservation()

  it('drops revoked planned expiry while another live capability still protects the case', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 1 })
    const entry = await createRetentionMinimalCase()
    const now = new Date()
    const capabilities = []
    for (const days of [7, 14]) {
      capabilities.push(
        await issueCopyrightGuestCapability({
          issuedAt: now,
          currentUser: entry.moderator,
          noticeId: entry.noticeId,
          expiresAt: new Date(now.getTime() + days * DAY_MS),
        }),
      )
    }
    await revokeCopyrightGuestCapability({
      currentUser: entry.moderator,
      noticeId: entry.noticeId,
      capabilityId: capabilities[0]!.id,
      revokedAt: now,
    })
    const options = { now: new Date(now.getTime() + 3 * DAY_MS), noticeIds: [entry.noticeId] }
    await expect(sweepCopyrightEvidenceRetention(options)).resolves.toEqual(none)
    await revokeCopyrightGuestCapability({
      currentUser: entry.moderator,
      noticeId: entry.noticeId,
      capabilityId: capabilities[1]!.id,
      revokedAt: now,
    })
    await expect(sweepCopyrightEvidenceRetention(options)).resolves.toEqual({
      erased: 1,
      ineligible: 0,
      failed: [],
    })
  })

  it('keeps retired unused capability expiry in the evidence retention clock', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 1 })
    const entry = await createRetentionMinimalCase()
    const now = new Date()
    const expiry = new Date(now.getTime() + 20 * DAY_MS)
    const capabilityId = await seedUnusedCopyrightGuestCapability(entry.noticeId, expiry)
    await positionCopyrightOperationalCursor('guest_capabilities', capabilityId)
    await sweepCopyrightOperationalRetention('guest_capabilities', {
      now: new Date(now.getTime() + 111 * DAY_MS),
      retentionDays: 90,
      batchSize: 10,
      maxBatches: 10,
    })
    expect(await readCopyrightOperationalRow('guest_capabilities', capabilityId)).toBe(false)
    await expect(
      sweepCopyrightEvidenceRetention({
        now: new Date(expiry.getTime() + DAY_MS - 1),
        noticeIds: [entry.noticeId],
      }),
    ).resolves.toEqual(none)
    await expect(
      sweepCopyrightEvidenceRetention({
        now: new Date(expiry.getTime() + DAY_MS),
        noticeIds: [entry.noticeId],
      }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
  })
})
