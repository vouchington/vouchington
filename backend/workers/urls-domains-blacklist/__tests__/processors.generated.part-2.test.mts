import { describe, it, expect, vi } from 'vitest'
import { processBlacklistSourceSync } from '../processors.mts'

describe('processBlacklistSourceSync with mocks', () => {
  it('handles non-existent source without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(processBlacklistSourceSync({ sourceId: 32000 })).resolves.toBeUndefined()
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
