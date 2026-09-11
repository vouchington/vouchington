import { VOTE_SCHEMA_CONFIGS } from './election-schema-config.mts'

// Defensive SQL-identifier allow-sets for vote-query callsites that splice
// table/column names into SQL via `.append()`. Derived from the canonical
// VOTE_SCHEMA_CONFIGS registry so a new vote entity extends the whitelist
// automatically — never hand-maintain these as a duplicate list.

export const VOTE_TABLE_IDENTIFIERS: ReadonlySet<string> = new Set([
  ...VOTE_SCHEMA_CONFIGS.map(config => config.voteTable),
  'entity_relation_votes',
])

export const VOTE_ENTITY_ID_COLUMN_IDENTIFIERS: ReadonlySet<string> = new Set([
  ...VOTE_SCHEMA_CONFIGS.map(config => config.entityIdColumn),
  'entity_relation_id',
])

export const ELECTION_ENTITY_TABLE_IDENTIFIERS: ReadonlySet<string> = new Set(
  VOTE_SCHEMA_CONFIGS.flatMap(config => (config.entityTable ? [config.entityTable] : [])),
)
