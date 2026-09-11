import { VOTE_SCHEMA_CONFIGS, type VoteSchemaConfig } from './utils/election-schema-config.mts'
import {
  buildCatalogGuardedColumnRepairSql,
  buildConstraintAddAndValidateSql,
} from './utils/catalog-guarded-ddl.mts'
import { generateLegacySentimentZeroVoteRepairSql } from './utils/legacy-sentiment-zero-vote-repair.mts'
import {
  createVoteDefaultPartitionSql,
  createVoteIndexesSql,
} from './utils/election-vote-table-sql.mts'
import { buildVoteTableAlterColumns } from './utils/election-vote-table-alter-columns-sql.mts'
import {
  neutralScoreProvenanceColumnSql,
  semanticScoreProvenanceColumnSql,
} from './utils/neutral-score-provenance-schema.mts'
type ColumnRepair = readonly [columnName: string, columnDefinition: string]
const voteScoreColumnRepairs: readonly ColumnRepair[] = [
  ['votes_score_up', 'DOUBLE PRECISION NOT NULL DEFAULT 0'],
  ['votes_score_none', 'DOUBLE PRECISION NOT NULL DEFAULT 0'],
  ['votes_score_down', 'DOUBLE PRECISION NOT NULL DEFAULT 0'],
  ['votes_count_up', 'INT NOT NULL DEFAULT 0'],
  ['votes_count_none', 'INT NOT NULL DEFAULT 0'],
  ['votes_count_down', 'INT NOT NULL DEFAULT 0'],
  [
    'votes_score_sort',
    `DOUBLE PRECISION GENERATED ALWAYS AS (fn_wilson_score_lower_bound(
  votes_score_up, votes_score_up + votes_score_none + votes_score_down
)) STORED`,
  ],
  [
    'votes_score_net',
    `DOUBLE PRECISION GENERATED ALWAYS AS (
  votes_score_up - votes_score_down
) STORED`,
  ],
]
const voteScoreConstraintColumns = [
  'votes_score_up',
  'votes_score_none',
  'votes_score_down',
  'votes_count_up',
  'votes_count_none',
  'votes_count_down',
]
export default () =>
  [
    ...VOTE_SCHEMA_CONFIGS.map(createVoteSchemaSql),
    generateLegacySentimentZeroVoteRepairSql(),
  ].join('\n\n')

function createVoteSchemaSql(config: VoteSchemaConfig): string {
  const parts: string[] = [`-- ${config.entityType} vote schema`]

  if (config.entityTable !== null) {
    parts.push(addEntityVoteColumnsSql(config))
  }

  parts.push(createVoteTableSql(config))
  parts.push(createVoteDefaultPartitionSql(config.voteTable))
  parts.push(buildVoteTableAlterColumns(config))
  parts.push(createVoteIndexesSql(config.voteTable, config.entityIdColumn))

  return parts.join('\n\n')
}

function addEntityVoteColumnsSql(config: VoteSchemaConfig): string {
  const table = config.entityTable!
  const sortCols = (config.entitySortColumns ?? config.entityKeyColumns).join(', ')
  const deletedAtClause = config.deletedAtFilter ? ' AND deleted_at IS NULL' : ''
  return [
    ...voteScoreColumnRepairs.map(([name, definition]) =>
      buildCatalogGuardedColumnRepairSql(table, name, definition),
    ),
    ...voteScoreConstraintColumns.flatMap(columnName =>
      buildConstraintAddAndValidateSql(
        table,
        `chk_${table}_${columnName}`,
        `CHECK (${columnName} >= 0)`,
      ),
    ),
    `CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__id
ON ${table} (votes_score_sort DESC, ${sortCols})${config.deletedAtFilter ? '\nWHERE deleted_at IS NULL' : ''};

CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__pos__id
ON ${table} (votes_score_sort DESC, ${sortCols})
WHERE votes_score_net > 0${deletedAtClause};`,
  ].join('\n\n')
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
  ${config.tracksNeutralScore ? `CONSTRAINT chk_${config.voteTable}_score_is_neutral CHECK (NOT score_is_neutral OR score IS NOT DISTINCT FROM 0),` : ''}
  ${config.tracksSemanticScore ? `CONSTRAINT chk_${config.voteTable}_score_is_semantic CHECK (NOT score_is_semantic OR score IS NOT NULL),` : ''}
  ip_address INET,
  device_id UUID,
  session_id UUID,
  user_agent_id UUID REFERENCES vote_user_agents ON DELETE SET NULL,
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

  if (config.entityTable !== null) {
    return [
      `${config.entityIdColumn} UUID NOT NULL REFERENCES ${config.entityTable} ON DELETE CASCADE,`,
    ]
  }

  return [`${config.entityIdColumn} UUID NOT NULL,`]
}
