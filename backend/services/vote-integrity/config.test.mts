import { describe, expect, it } from 'vitest'
import {
  INTEGRITY_FLAG_STATUSES as SHARED_INTEGRITY_FLAG_STATUSES,
  VOTE_INTEGRITY_FLAG_TYPES as SHARED_VOTE_INTEGRITY_FLAG_TYPES,
  VOTE_INTEGRITY_RESOLUTIONS as SHARED_VOTE_INTEGRITY_RESOLUTIONS,
} from '@ts-shared/utils/moderation-catalogs'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import {
  ENTITY_VOTE_TABLES,
  INTEGRITY_FLAG_STATUSES,
  VOTE_INTEGRITY_FLAG_TYPES,
  VOTE_INTEGRITY_RESOLUTIONS,
} from './config.mts'

describe('vote integrity config', () => {
  it('re-exports shared moderation catalogs', () => {
    expect(INTEGRITY_FLAG_STATUSES).toBe(SHARED_INTEGRITY_FLAG_STATUSES)
    expect(VOTE_INTEGRITY_FLAG_TYPES).toBe(SHARED_VOTE_INTEGRITY_FLAG_TYPES)
    expect(VOTE_INTEGRITY_RESOLUTIONS).toBe(SHARED_VOTE_INTEGRITY_RESOLUTIONS)
  })

  it('whitelists every ENTITY_VOTE_TABLES identifier used by detection queries', () => {
    for (const config of Object.values(ENTITY_VOTE_TABLES)) {
      expect(VOTE_TABLE_IDENTIFIERS.has(config.voteTable)).toBe(true)
      expect(VOTE_ENTITY_ID_COLUMN_IDENTIFIERS.has(config.entityIdColumn)).toBe(true)
    }
  })
})
