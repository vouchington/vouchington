import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { VOTE_SCHEMA_CONFIGS } from './election-schema-config.mts'

// Defensive SQL-identifier allow-sets for vote-query callsites that splice
// table/column names into SQL via `.append()`. Derived from the canonical
// VOTE_SCHEMA_CONFIGS registry so a new vote entity extends the whitelist
// automatically — never hand-maintain these as a duplicate list.

export const VOTE_TABLE_IDENTIFIERS: ReadonlySet<string> = new Set([
  ...VOTE_SCHEMA_CONFIGS.map(config => config.voteTable),
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election ? [getEntityRelationVoteTableName(metadata)] : [],
  ),
  'view_entity_relation_votes',
])

export const VOTE_ENTITY_ID_COLUMN_IDENTIFIERS: ReadonlySet<string> = new Set([
  ...VOTE_SCHEMA_CONFIGS.map(config => config.entityIdColumn),
  'entity_relation_id',
])

export const ELECTION_ENTITY_TABLE_IDENTIFIERS: ReadonlySet<string> = new Set(
  VOTE_SCHEMA_CONFIGS.flatMap(config => (config.entityTable ? [config.entityTable] : [])),
)

/** Preserves every owner word and separator while fitting PostgreSQL's identifier limit. */
export function getElectionIndexName(table: string, suffix: string): string {
  const words = table.split(/(_+)/)
  const render = () => `idx_${words.join('')}__${suffix}`
  while (Buffer.byteLength(render()) > 63) {
    let longest = -1
    for (let index = 0; index < words.length; index += 2) {
      if (
        words[index]!.length > 3 &&
        (longest < 0 || words[index]!.length > words[longest]!.length)
      )
        longest = index
    }
    if (longest < 0) throw new Error(`Election index suffix cannot fit: ${table} ${suffix}`)
    words[longest] = words[longest]!.slice(0, -1)
  }
  return render()
}

export function getEntityRelationVoteTableIdentifier(relation: string): string {
  const metadata = entityRelationMetadatum.find(
    item => item.election && item.table_name === relation,
  )
  if (!metadata) throw new Error(`Unknown elected entity relation: ${relation}`)
  return getEntityRelationVoteTableName(metadata)
}
