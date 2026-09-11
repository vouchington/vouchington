import { describe, it, expect } from 'vitest'
import { resolveTypeAttributeNames } from '../topic-edit-model'

describe('resolveTypeAttributeNames', () => {
  it('resolves present id fields to names and ignores non-id and unresolved fields', async () => {
    const names = await resolveTypeAttributeNames(
      {
        bank_id: 'bank-1',
        brand_id: 'missing',
        annual_fee: { amount: 9500, currency: 'usd' },
      },
      async topicId => (topicId === 'bank-1' ? 'Chase' : undefined),
    )

    expect(names).toEqual({ bank_id: 'Chase' })
  })

  it('omits ids whose lookup rejects', async () => {
    const names = await resolveTypeAttributeNames({ bank_id: 'bank-1' }, async () => {
      throw new Error('boom')
    })

    expect(names).toEqual({})
  })

  it('returns an empty map for nullish attrs without invoking the lookup', async () => {
    let calls = 0
    const lookup = async (topicId: string) => {
      calls++
      return topicId
    }

    expect(await resolveTypeAttributeNames(null, lookup)).toEqual({})
    expect(await resolveTypeAttributeNames(undefined, lookup)).toEqual({})
    expect(calls).toBe(0)
  })

  it('returns an empty map and runs no lookups when no id fields are set', async () => {
    let calls = 0
    const names = await resolveTypeAttributeNames(
      { annual_fee: { amount: 9500, currency: 'usd' } },
      async topicId => {
        calls++
        return topicId
      },
    )

    expect(names).toEqual({})
    expect(calls).toBe(0)
  })
})
