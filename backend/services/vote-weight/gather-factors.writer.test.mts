import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { read, write } from '@data-stores/psql'

import { gatherVoteWeightFactors } from './gather-factors.mts'

const mockRead = vi.fn<typeof read>()
const mockWrite = vi.fn<typeof write>()

const factorRow = {
  current_weight: 1,
  vote_weight_admin_set_at: null,
  account_created_at: new Date(),
  oauth_count: 0,
  oauth_older_than_1_year: 0,
  oauth_older_than_5_years: 0,
  distinct_auth_method_count: 1,
  membership_plan: null,
  is_admin: false,
  penalty_multiplier: 1,
  is_identity_verified: true,
}

describe('gatherVoteWeightFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['reader', false, mockRead, mockWrite],
    ['writer', true, mockWrite, mockRead],
  ])('uses the %s pool when requested', async (_name, readFromWriter, selected, unselected) => {
    selected.mockResolvedValueOnce({ rows: [factorRow] } as never)

    await expect(
      gatherVoteWeightFactors(
        'user-1',
        { readFromWriter },
        {
          read: mockRead as never,
          write: mockWrite as never,
        },
      ),
    ).resolves.toMatchObject({ isIdentityVerified: true })
    expect(unselected).not.toHaveBeenCalled()
  })
})
