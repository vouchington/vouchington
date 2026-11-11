import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { seedCopyrightThreadTokenAtForTest } from '@voucha/test-helpers/copyright-thread-retention'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'

describe('copyright orphan thread token retention', () => {
  useCopyrightOperationalCursorReservation()

  it('retains a young orphan token until its UUIDv7 grace passes', async () => {
    const now = new Date()
    const oldId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const youngId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    })
    await positionCopyrightOperationalCursor('orphan_email_thread_tokens', oldId, youngId)
    await expect(
      sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        now,
        retentionDays: 0,
        batchSize: 10,
        maxBatches: 1,
        recordIds: [oldId, youngId],
      }),
    ).resolves.toMatchObject({ scanned: 2, deleted: 1 })
    expect(await readCopyrightOperationalRow('email_thread_tokens', oldId)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', youngId)).toBe(true)
  })
})
