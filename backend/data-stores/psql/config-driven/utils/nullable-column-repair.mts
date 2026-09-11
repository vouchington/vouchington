import {
  buildCatalogGuardedColumnRepairSql,
  buildCatalogGuardedDoBlock,
} from './catalog-guarded-ddl.mts'

export function buildCatalogGuardedNullableColumnRepairSql(
  table: string,
  columnName: string,
  columnType: string,
  defaultExpression: string | null,
): string {
  const lock = [`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`]
  const hasNoDefault = defaultExpression === null
  return [
    buildCatalogGuardedColumnRepairSql(table, columnName, columnType),
    buildCatalogGuardedDoBlock(
      'IF EXISTS',
      lock,
      [
        '    SELECT 1 FROM pg_attribute attribute',
        '    LEFT JOIN pg_attrdef column_default ON column_default.adrelid = attribute.attrelid AND column_default.adnum = attribute.attnum',
        `    WHERE attribute.attrelid = '${table}'::regclass AND attribute.attname = '${columnName}'`,
        '      AND NOT attribute.attisdropped',
        hasNoDefault
          ? '      AND column_default.adbin IS NOT NULL'
          : `      AND pg_get_expr(column_default.adbin, column_default.adrelid) IS DISTINCT FROM '${defaultExpression}'`,
      ],
      [
        `    ALTER TABLE ${table}`,
        hasNoDefault
          ? `      ALTER COLUMN ${columnName} DROP DEFAULT;`
          : `      ALTER COLUMN ${columnName} SET DEFAULT ${defaultExpression};`,
      ],
    ),
    buildCatalogGuardedDoBlock(
      'IF EXISTS',
      lock,
      [
        '    SELECT 1 FROM pg_attribute',
        `    WHERE attrelid = '${table}'::regclass AND attname = '${columnName}'`,
        '      AND NOT attisdropped AND attnotnull',
      ],
      [`    ALTER TABLE ${table}`, `      ALTER COLUMN ${columnName} DROP NOT NULL;`],
    ),
  ].join('\n\n')
}
