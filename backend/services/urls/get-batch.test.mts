import { it, expect, describe } from 'vitest'
import { getUrlsByIdBatch } from './get-batch.mts'
import { createTestUrlWithHostname } from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'

describe('get-batch', () => {
  it('getUrlsByIdBatch returns empty array for empty input', async () => {
    const results = await getUrlsByIdBatch([])
    expect(results).toEqual([])
  })

  it('getUrlsByIdBatch returns null for non-existent URLs while preserving order', async () => {
    const results = await getUrlsByIdBatch([uuidv7(), uuidv7()])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getUrlsByIdBatch preserves duplicate input positions for mixed-case IDs', async () => {
    const firstUrlId = await createTestUrlWithHostname()
    const secondUrlId = await createTestUrlWithHostname()
    const missingUrlId = uuidv7()

    const results = await getUrlsByIdBatch([
      firstUrlId.toUpperCase(),
      missingUrlId.toUpperCase(),
      firstUrlId,
      secondUrlId,
    ])

    expect(results).toHaveLength(4)
    expect(results[0]?.id).toBe(firstUrlId)
    expect(results[1]).toBeNull()
    expect(results[2]?.id).toBe(firstUrlId)
    expect(results[3]?.id).toBe(secondUrlId)
  })

  it('getUrlsByIdBatch throws for invalid IDs', async () => {
    await expect(getUrlsByIdBatch(['invalid-id'])).rejects.toThrow('Invalid URL ID')
  })
})
