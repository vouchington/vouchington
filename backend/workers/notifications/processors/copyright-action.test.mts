import { describe, expect, it, vi } from 'vitest'
import type { processCopyrightActionIntent } from '@services/copyright-notices'
import { processApplyCopyrightAction } from './copyright-action.mts'

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
})
