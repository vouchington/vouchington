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

export function buildCatalogGuardedColumnRepairSql(
  table: string,
  columnName: string,
  columnDefinition: string,
): string {
  return buildCatalogGuardedDoBlock(
    'IF NOT EXISTS',
    [`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`],
    [
      '    SELECT 1',
      '    FROM pg_attribute',
      `    WHERE attrelid = '${table}'::regclass`,
      `      AND attname = '${columnName}'`,
      '      AND NOT attisdropped',
    ],
    [`    ALTER TABLE ${table}`, `      ADD COLUMN ${columnName} ${columnDefinition};`],
  )
}

export function buildConstraintColumnSetRepairSql(
  table: string,
  constraintName: string,
  expectedColumns: readonly string[],
): string {
  const expected = expectedColumns
    .toSorted()
    .map(column => `'${column.replaceAll("'", "''")}'`)
    .join(', ')
  const condition = [
    '    SELECT 1',
    '    FROM pg_constraint constraint_definition',
    `    WHERE constraint_definition.conname = '${constraintName}'`,
    `      AND constraint_definition.conrelid = '${table}'::regclass`,
    '      AND ARRAY(',
    '        SELECT attribute.attname::text',
    '        FROM unnest(constraint_definition.conkey) AS key(attnum)',
    '        JOIN pg_attribute attribute',
    '          ON attribute.attrelid = constraint_definition.conrelid',
    '         AND attribute.attnum = key.attnum',
    '        ORDER BY attribute.attname',
    `      ) IS DISTINCT FROM ARRAY[${expected}]::text[]`,
  ]
  return buildCatalogGuardedDoBlock(
    'IF EXISTS',
    [`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`],
    condition,
    [`    ALTER TABLE ${table}`, `      DROP CONSTRAINT ${constraintName};`],
  )
}

export function buildConstraintDefinitionRepairSql(
  table: string,
  constraintName: string,
  requiredDefinitionFragment: string,
): string {
  const escapedFragment = requiredDefinitionFragment.replaceAll("'", "''")
  return buildCatalogGuardedDoBlock(
    'IF EXISTS',
    [`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`],
    [
      '    SELECT 1',
      '    FROM pg_constraint constraint_definition',
      `    WHERE constraint_definition.conname = '${constraintName}'`,
      `      AND constraint_definition.conrelid = '${table}'::regclass`,
      `      AND POSITION('${escapedFragment}' IN pg_get_constraintdef(constraint_definition.oid)) = 0`,
    ],
    [`    ALTER TABLE ${table}`, `      DROP CONSTRAINT ${constraintName};`],
  )
}

export function buildVoteTableConstraintName(table: string, constraintSql: string): string {
  const metadata = parseVoteTableForeignKey(table, constraintSql)

  const columns = metadata.columns
    .split(',')
    .map(column => column.trim().replaceAll('"', ''))
    .join('_')

  return `${table}_${columns}_fkey`
}

export function buildVoteTableConstraintReferencedTable(
  table: string,
  constraintSql: string,
): string {
  return parseVoteTableForeignKey(table, constraintSql).referencedTable
}

function parseVoteTableForeignKey(
  table: string,
  constraintSql: string,
): { columns: string; referencedTable: string } {
  const match = constraintSql.match(
    /^\s*FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+("[^"]+"|[a-z_][a-z0-9_]*)/i,
  )
  if (!match) {
    throw new TypeError(`unsupported vote table constraint for ${table}: ${constraintSql}`)
  }

  return { columns: match[1], referencedTable: match[2].replaceAll('"', '') }
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
