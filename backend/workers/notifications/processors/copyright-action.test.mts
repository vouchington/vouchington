import { describe, expect, it } from 'vitest'
import { processApplyCopyrightAction } from './copyright-action.mts'

describe('copyright action delivery', () => {
  it('leaves an unknown action intent unclaimed through the durable processor', async () => {
    await expect(
      processApplyCopyrightAction({ intentId: '00000000-0000-7000-8000-000000000001' }),
    ).resolves.toBe('not_claimed')
  })
})
