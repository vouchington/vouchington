import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  rejectPostgresReadForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'

import { gatherVoteWeightFactors } from './gather-factors.mts'

const MARKER = '/* gatherVoteWeightFactors */'
const poolFailure = new Error('pool rejected')

describe('gatherVoteWeightFactors', () => {
  it.each([
    ['reader', false, rejectPostgresReadForTest, rejectPostgresWriteForTest],
    ['writer', true, rejectPostgresWriteForTest, rejectPostgresReadForTest],
  ])(
    'uses the %s pool when requested',
    async (_name, readFromWriter, rejectSelected, rejectUnselected) => {
      const user = await createTestUser()

      const restoreSelected = rejectSelected(MARKER, poolFailure)
      try {
        await expect(gatherVoteWeightFactors(user.id, { readFromWriter })).rejects.toBe(poolFailure)
      } finally {
        restoreSelected()
      }

      const restoreUnselected = rejectUnselected(MARKER, poolFailure)
      try {
        await expect(gatherVoteWeightFactors(user.id, { readFromWriter })).resolves.toMatchObject({
          oauthCount: 0,
          isAdmin: false,
          penaltyMultiplier: 1,
        })
      } finally {
        restoreUnselected()
      }
    },
  )
})
