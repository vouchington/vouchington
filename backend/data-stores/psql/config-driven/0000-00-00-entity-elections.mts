import { VOTE_SCHEMA_CONFIGS, type VoteSchemaConfig } from './utils/election-schema-config.mts'
import {
  createVoteDefaultPartitionSql,
  createVoteIndexesSql,
} from './utils/election-vote-table-sql.mts'
import {
  neutralScoreProvenanceColumnSql,
  semanticScoreProvenanceColumnSql,
} from './utils/neutral-score-provenance-schema.mts'
/** @public loaded by path by the config-driven migration runner */
export default () => VOTE_SCHEMA_CONFIGS.map(createVoteSchemaSql).join('\n\n')

function createVoteSchemaSql(config: VoteSchemaConfig): string {
  const parts: string[] = [`-- ${config.entityType} vote schema`]

  parts.push(addEntityVoteColumnsSql(config))

  parts.push(createVoteTableSql(config))
  parts.push(createVoteDefaultPartitionSql(config.voteTable))
  parts.push(createVoteIndexesSql(config.voteTable, config.entityIdColumn))

  return parts.join('\n\n')
}

function addEntityVoteColumnsSql(config: VoteSchemaConfig): string {
  const table = config.entityTable
  const sortCols = (config.entitySortColumns ?? config.entityKeyColumns).join(', ')
  const deletedAtClause = config.deletedAtFilter ? ' AND deleted_at IS NULL' : ''
  return `CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__id
ON ${table} (votes_score_sort DESC, ${sortCols})${config.deletedAtFilter ? '\nWHERE deleted_at IS NULL' : ''};

CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__pos__id
ON ${table} (votes_score_sort DESC, ${sortCols})
WHERE votes_score_net > 0${deletedAtClause};`
}

function createVoteTableSql(config: VoteSchemaConfig): string {
  const extraColumns = buildVoteTableExtraColumns(config)

  return `CREATE TABLE IF NOT EXISTS ${config.voteTable} (
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  ${extraColumns.join('\n  ')}
  id UUID DEFAULT uuidv7() NOT NULL,
  PRIMARY KEY (${config.entityIdColumn}, id),
  score SMALLINT,
  ${neutralScoreProvenanceColumnSql(config.tracksNeutralScore)}
  ${semanticScoreProvenanceColumnSql(config.tracksSemanticScore)}
  ${config.voteScoreConstraint ?? 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)'},
  CONSTRAINT chk_${config.voteTable}_score_domain ${config.voteScoreConstraint ?? 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)'},
  ${config.tracksNeutralScore ? `CONSTRAINT chk_${config.voteTable}_score_is_neutral CHECK (NOT score_is_neutral OR score IS NOT DISTINCT FROM 0),` : ''}
  ${config.tracksSemanticScore ? `CONSTRAINT chk_${config.voteTable}_score_is_semantic CHECK (NOT score_is_semantic OR score IS NOT NULL),` : ''}
  ip_address INET,
  device_id UUID,
  session_id UUID,
  user_agent_id UUID REFERENCES user_agent_strings ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
) PARTITION BY RANGE (${config.entityIdColumn});`
}

function buildVoteTableExtraColumns(config: VoteSchemaConfig): string[] {
  if (config.voteAdditionalColumns?.length) {
    return [
      ...config.voteAdditionalColumns.map(col => `${col},`),
      ...(config.voteTableConstraints ?? []).map(c => `${c},`),
    ]
  }

  return [
    `${config.entityIdColumn} UUID NOT NULL REFERENCES ${config.entityTable} ON DELETE CASCADE,`,
  ]
}
