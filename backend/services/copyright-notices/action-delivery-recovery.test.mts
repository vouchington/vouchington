import { describe, expect, it } from 'vitest'
import { listRecoverableCopyrightActionIntentIds } from './action-delivery-state.mts'

describe('copyright action delivery recovery', () => {
  it('lists recoverable action intents without throwing on an empty lease set', async () => {
    await expect(listRecoverableCopyrightActionIntentIds(10, new Date())).resolves.toEqual(
      expect.any(Array),
    )
  })
})
