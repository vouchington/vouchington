import { describe, expect, it, vi } from 'vitest'
import type {
  createDueStatutoryCopyrightRestoreIntents,
  listRecoverableCopyrightActionIntentIds,
  processCopyrightActionIntent,
  reconcileCopyrightEnforcementRequests,
} from '@services/copyright-notices'
import type { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import {
  processApplyCopyrightAction,
  processReconcileCopyrightActionIntents,
} from './copyright-action.mts'

describe('copyright action delivery', () => {
  it('passes one action intent to the durable processor', async () => {
    const process = vi.fn<typeof processCopyrightActionIntent>().mockResolvedValue('applied')
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processApplyCopyrightAction(
        { intentId: '00000000-0000-7000-8000-000000000001' },
        { processCopyrightActionIntent: process, now: () => now },
      ),
    ).resolves.toBe('applied')
    expect(process).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000001', now)
  })

  it('re-enqueues only durable recoverable action intents', async () => {
    const list = vi
      .fn<typeof listRecoverableCopyrightActionIntentIds>()
      .mockResolvedValue([
        '00000000-0000-7000-8000-000000000001',
        '00000000-0000-7000-8000-000000000002',
      ])
    const enqueue = vi.fn<typeof enqueueApplyCopyrightAction>().mockResolvedValue(undefined)
    const createDue = vi.fn<typeof createDueStatutoryCopyrightRestoreIntents>().mockResolvedValue(1)
    const reconcileEnforcement = vi
      .fn<typeof reconcileCopyrightEnforcementRequests>()
      .mockResolvedValue(1)
    const now = new Date('2026-07-01T12:00:00.000Z')

    await expect(
      processReconcileCopyrightActionIntents({
        listRecoverableCopyrightActionIntentIds: list,
        enqueueApplyCopyrightAction: enqueue,
        createDueStatutoryCopyrightRestoreIntents: createDue,
        reconcileCopyrightEnforcementRequests: reconcileEnforcement,
        now: () => now,
      }),
    ).resolves.toEqual({ enqueued: 2 })
    expect(list).toHaveBeenCalledWith(100, now)
    expect(createDue).toHaveBeenCalledWith(now)
    expect(reconcileEnforcement).toHaveBeenCalledWith(100)
    expect(enqueue).toHaveBeenCalledTimes(2)
  })
})
