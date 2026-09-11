import { describe, expect, it } from 'vitest'
import { nextEntryFor } from '../store'

describe('semantic vote reconciliation', () => {
  it('keeps raw voter counts when sentiment changes strength without changing sign', () => {
    expect(nextEntryFor({ currentVote: 'like', countUp: 4, countDown: 2 }, 'vouch')).toEqual({
      currentVote: 'vouch',
      countUp: 4,
      countDown: 2,
    })
  })

  it('updates the sign counts for sign changes, neutral, and clear', () => {
    const disavow = nextEntryFor({ currentVote: 'vouch', countUp: 4, countDown: 2 }, 'disavow')
    expect(disavow).toMatchObject({ countUp: 3, countDown: 3 })

    const neutral = nextEntryFor(disavow, 'neutral')
    expect(neutral).toMatchObject({ countUp: 3, countDown: 2 })

    expect(nextEntryFor(neutral, null)).toMatchObject({ countUp: 3, countDown: 2 })
  })
})
