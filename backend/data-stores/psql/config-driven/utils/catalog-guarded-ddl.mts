export function buildConstraintAddAndValidateSql(
  table: string,
  constraintName: string,
  constraintSql: string,
  referencedTable?: string,
): string[] {
  return [
    buildCatalogGuardedConstraintAddSql(table, constraintName, constraintSql, referencedTable),
    buildCatalogGuardedConstraintValidateSql(table, constraintName),
  ]
}

function buildCatalogGuardedConstraintAddSql(
  table: string,
  constraintName: string,
  constraintSql: string,
  referencedTable?: string,
): string {
  return buildCatalogGuardedDoBlock(
    'IF NOT EXISTS',
    [
      ...(referencedTable ? [`LOCK TABLE ${referencedTable} IN SHARE ROW EXCLUSIVE MODE;`] : []),
      `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`,
    ],
    [
      '    SELECT 1',
      '    FROM pg_constraint',
      `    WHERE conname = '${constraintName}'`,
      `      AND conrelid = '${table}'::regclass`,
    ],
    [
      `    ALTER TABLE ${table}`,
      `      ADD CONSTRAINT ${constraintName}`,
      `      ${constraintSql} NOT VALID;`,
    ],
  )
}

function buildCatalogGuardedConstraintValidateSql(table: string, constraintName: string): string {
  return buildCatalogGuardedDoBlock(
    'IF EXISTS',
    [],
    [
      '    SELECT 1',
      '    FROM pg_constraint',
      `    WHERE conname = '${constraintName}'`,
      `      AND conrelid = '${table}'::regclass`,
      '      AND NOT convalidated',
    ],
    [`    ALTER TABLE ${table}`, `      VALIDATE CONSTRAINT ${constraintName};`],
  )
}

export function buildCatalogGuardedDoBlock(
  header: 'IF EXISTS' | 'IF NOT EXISTS',
  serializationLines: readonly string[],
  conditionLines: readonly string[],
  actionLines: readonly string[],
): string {
  if (serializationLines.length) {
    return [
      'DO $$ BEGIN',
      `  ${header} (`,
      ...conditionLines,
      '  ) THEN',
      ...serializationLines.map(line => `    ${line}`),
      `    ${header} (`,
      ...conditionLines.map(line => `  ${line}`),
      '    ) THEN',
      ...actionLines.map(line => `  ${line}`),
      '    END IF;',
      '  END IF;',
      'END $$;',
    ].join('\n')
  }

  return [
    'DO $$ BEGIN',
    `  ${header} (`,
    ...conditionLines,
    '  ) THEN',
    ...actionLines,
    '  END IF;',
    'END $$;',
  ].join('\n')
}
