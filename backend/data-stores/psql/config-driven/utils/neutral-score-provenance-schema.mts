import {
  buildCatalogGuardedColumnRepairSql,
  buildCatalogGuardedDoBlock,
  buildConstraintAddAndValidateSql,
  buildConstraintDefinitionRepairSql,
} from './catalog-guarded-ddl.mts'

export function neutralScoreProvenanceColumnSql(tracksNeutralScore: boolean | undefined): string {
  return tracksNeutralScore ? 'score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE,' : ''
}

export function semanticScoreProvenanceColumnSql(tracksSemanticScore: boolean | undefined): string {
  return tracksSemanticScore ? 'score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE,' : ''
}

export function buildNeutralScoreProvenanceRepairSql(
  table: string,
  tracksNeutralScore: boolean | undefined,
): string[] {
  if (!tracksNeutralScore) return []

  return [
    buildCatalogGuardedColumnRepairSql(table, 'score_is_neutral', 'BOOLEAN NOT NULL DEFAULT FALSE'),
    buildLegacyUnnamedNeutralScoreConstraintDropSql(table),
    buildConstraintDefinitionRepairSql(
      table,
      `chk_${table}_score_is_neutral`,
      'IS NOT DISTINCT FROM 0',
    ),
    ...buildConstraintAddAndValidateSql(
      table,
      `chk_${table}_score_is_neutral`,
      'CHECK (NOT score_is_neutral OR score IS NOT DISTINCT FROM 0)',
    ),
  ]
}

export function buildSemanticScoreProvenanceRepairSql(
  table: string,
  tracksSemanticScore: boolean | undefined,
): string[] {
  if (!tracksSemanticScore) return []

  return [
    buildCatalogGuardedColumnRepairSql(
      table,
      'score_is_semantic',
      'BOOLEAN NOT NULL DEFAULT FALSE',
    ),
    ...buildConstraintAddAndValidateSql(
      table,
      `chk_${table}_score_is_semantic`,
      'CHECK (NOT score_is_semantic OR score IS NOT NULL)',
    ),
  ]
}

function buildLegacyUnnamedNeutralScoreConstraintDropSql(table: string): string {
  return buildCatalogGuardedDoBlock(
    'IF EXISTS',
    [`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`],
    [
      '    SELECT 1',
      '    FROM pg_constraint constraint_definition',
      `    WHERE constraint_definition.conname = '${table}_check'`,
      `      AND constraint_definition.conrelid = '${table}'::regclass`,
      "      AND pg_get_constraintdef(constraint_definition.oid) LIKE '%score_is_neutral%'",
    ],
    [`    ALTER TABLE ${table}`, `      DROP CONSTRAINT ${table}_check;`],
  )
}
