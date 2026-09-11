import { it, expect, describe } from 'vitest'
import { deleteOldInvalidCrawls } from './cleanup.mts'

describe('cleanup', () => {
  it('deleteOldInvalidCrawls', async () => {
    const deletedCount = await deleteOldInvalidCrawls()
    expect(typeof deletedCount).toBe('number')
  })
})
