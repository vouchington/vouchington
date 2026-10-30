import { it, expect, describe } from 'vitest'
import { getPostElectionById } from './get-election.mts'

describe('get-election', () => {
  describe('getPostElectionById', () => {
    it('returns null for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const election = await getPostElectionById(nonExistentId)

      expect(election).toBeNull()
    })
  })
})
