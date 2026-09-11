import type { VoteSchemaConfig } from './election-schema-config.mts'
import {
  buildCatalogGuardedColumnRepairSql,
  buildConstraintAddAndValidateSql,
  buildVoteTableConstraintReferencedTable,
  buildVoteTableConstraintName,
} from './catalog-guarded-ddl.mts'
import { buildCatalogGuardedNullableColumnRepairSql } from './nullable-column-repair.mts'
import {
  buildNeutralScoreProvenanceRepairSql,
  buildSemanticScoreProvenanceRepairSql,
} from './neutral-score-provenance-schema.mts'

type ColumnRepair = readonly [columnName: string, columnDefinition: string]
const voteTableColumnRepairs: readonly ColumnRepair[] = [
  ['id', 'UUID DEFAULT uuidv7() NOT NULL'],
  ['ip_address', 'INET'],
  ['device_id', 'UUID'],
  ['session_id', 'UUID'],
  ['user_agent_id', 'UUID'],
]

export function buildVoteTableAlterColumns(config: VoteSchemaConfig): string {
  const table = config.voteTable
  const statements = [
    ...voteTableColumnRepairs.map(([name, definition]) =>
      buildCatalogGuardedColumnRepairSql(table, name, definition),
    ),
    ...buildConstraintAddAndValidateSql(
      table,
      `${table}_user_agent_id_fkey`,
      'FOREIGN KEY (user_agent_id) REFERENCES vote_user_agents ON DELETE SET NULL',
      'vote_user_agents',
    ),
  ]

  statements.push(
    buildCatalogGuardedNullableColumnRepairSql(table, 'score', 'SMALLINT', null),
    ...buildConstraintAddAndValidateSql(
      table,
      `chk_${table}_score_domain`,
      config.voteScoreConstraint ?? 'CHECK (score IS NULL OR score BETWEEN -2 AND 2)',
    ),
  )

  statements.push(...buildNeutralScoreProvenanceRepairSql(table, config.tracksNeutralScore))
  statements.push(...buildSemanticScoreProvenanceRepairSql(table, config.tracksSemanticScore))

  for (const colDef of config.voteAdditionalColumns ?? []) {
    const trimmedColDef = colDef.trim()
    const firstSpaceIndex = trimmedColDef.indexOf(' ')
    const colName = firstSpaceIndex === -1 ? trimmedColDef : trimmedColDef.slice(0, firstSpaceIndex)
    const colDefinition =
      firstSpaceIndex === -1 ? 'TEXT' : trimmedColDef.slice(firstSpaceIndex + 1).trim()
    statements.push(
      buildCatalogGuardedColumnRepairSql(
        table,
        colName,
        buildNullableRepairColumnDefinition(colDefinition),
      ),
    )
  }

  for (const constraintSql of config.voteTableConstraints ?? []) {
    statements.push(
      ...buildConstraintAddAndValidateSql(
        table,
        buildVoteTableConstraintName(table, constraintSql),
        constraintSql,
        buildVoteTableConstraintReferencedTable(table, constraintSql),
      ),
    )
  }

  return statements.join('\n\n')
}

function buildNullableRepairColumnDefinition(columnDefinition: string): string {
  return columnDefinition.replace(/\s+NOT\s+NULL\b/gi, '').trim()
}
