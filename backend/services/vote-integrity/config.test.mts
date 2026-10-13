import { describe, expect, it } from 'vitest'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { ENTITY_VOTE_TABLES } from './config.mts'

describe('vote integrity config', () => {
  it('whitelists every ENTITY_VOTE_TABLES identifier used by detection queries', () => {
    for (const config of Object.values(ENTITY_VOTE_TABLES)) {
      expect(VOTE_TABLE_IDENTIFIERS.has(config.voteTable)).toBe(true)
      expect(VOTE_ENTITY_ID_COLUMN_IDENTIFIERS.has(config.entityIdColumn)).toBe(true)
    }
  })
})
