import { describe, expect, it } from 'vitest'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { seedUnusedCopyrightGuestCapability } from '@voucha/test-helpers/copyright-operational-guest-capabilities'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { issueCopyrightGuestCapability, revokeCopyrightGuestCapability } from './index.mts'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('copyright evidence retention capability clocks', () => {
  const setClock = useCopyrightRetentionWorkClock()
  const bucket = useFakeCopyrightEvidenceBucket()
  useCopyrightOperationalCursorReservation()

  it('drops revoked planned expiry while another live capability still protects the case', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const evidenceKey = entry.evidenceKeys[0]!
    bucket.put(evidenceKey)
    const issuedAt = new Date()
    const capabilities = []
    for (const days of [7, 14]) {
      capabilities.push(
        await issueCopyrightGuestCapability({
          issuedAt,
          currentUser: entry.moderator,
          noticeId: entry.noticeId,
          expiresAt: new Date(issuedAt.getTime() + days * DAY_MS),
        }),
      )
    }
    await revokeCopyrightGuestCapability({
      currentUser: entry.moderator,
      noticeId: entry.noticeId,
      capabilityId: capabilities[0]!.id,
      revokedAt: issuedAt,
    })
    const originalColumns = await readCopyrightRetentionColumns(entry.noticeId)

    const retentionTime = new Date(shiftUtcCalendarMonths(issuedAt, 72).getTime() + 3 * DAY_MS)
    await setClock(retentionTime)
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toBeNull()
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.toEqual(originalColumns)
    expect(bucket.countVersions(evidenceKey)).toBe(1)

    await setClock(issuedAt)
    await revokeCopyrightGuestCapability({
      currentUser: entry.moderator,
      noticeId: entry.noticeId,
      capabilityId: capabilities[1]!.id,
      revokedAt: issuedAt,
    })
    await setClock(retentionTime)
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.not.toBeNull()
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.not.toEqual(
      originalColumns,
    )
    expect(bucket.countVersions(evidenceKey)).toBe(0)
  })

  it('keeps retired unused capability expiry in the evidence retention clock', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const evidenceKey = entry.evidenceKeys[0]!
    bucket.put(evidenceKey)
    const issuedAt = new Date()
    const expiry = new Date(issuedAt.getTime() + 20 * DAY_MS)
    const capabilityId = await seedUnusedCopyrightGuestCapability(entry.noticeId, expiry)
    await positionCopyrightOperationalCursor('guest_capabilities', capabilityId)
    await sweepCopyrightOperationalRetention('guest_capabilities', {
      now: new Date(issuedAt.getTime() + 111 * DAY_MS),
      retentionDays: 90,
      batchSize: 10,
      maxBatches: 10,
    })
    expect(await readCopyrightOperationalRow('guest_capabilities', capabilityId)).toBe(false)
    const originalColumns = await readCopyrightRetentionColumns(entry.noticeId)

    const retentionBoundary = shiftUtcCalendarMonths(expiry, 72)
    await setClock(new Date(retentionBoundary.getTime() - 1))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toBeNull()
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.toEqual(originalColumns)
    expect(bucket.countVersions(evidenceKey)).toBe(1)

    await setClock(retentionBoundary)
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.not.toBeNull()
    await expect(readCopyrightRetentionColumns(entry.noticeId)).resolves.not.toEqual(
      originalColumns,
    )
    expect(bucket.countVersions(evidenceKey)).toBe(0)
  })
})
