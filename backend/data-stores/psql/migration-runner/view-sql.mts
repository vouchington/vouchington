import { parseSync, type RangeVar } from '@libpg-query/parser'
import { escapeLiteral } from 'pg'

export type ManagedViewDeclaration = {
  name: string
  type: 'materialized view' | 'view'
}

/**
 * Returns a PostgreSQL-quoted identifier. Simple lowercase names are returned unquoted;
 * names containing uppercase, spaces, punctuation, or other special characters are
 * wrapped in double-quotes with internal double-quotes escaped as "".
 */
function quotePgName(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Builds the qualified view reference (schema.view or just view) from the
 * unquoted identifiers the parser returns.
 */
function buildViewRef(view: RangeVar & { relname: string }): string {
  const name = quotePgName(view.relname)
  if (!view.schemaname) return name
  return `${quotePgName(view.schemaname)}.${name}`
}

/**
 * Extracts typed declarations from CREATE [OR REPLACE] VIEW and CREATE MATERIALIZED VIEW
 * statements in the given SQL string. Comments and string literals are ignored (the real
 * PostgreSQL 18 parser handles all quoting and comment forms correctly).
 *
 * Requires loadSqlParserModule() from sql-statements.mts to have resolved
 * before the first call.
 */
export function extractViewDeclarations(sql: string): ManagedViewDeclaration[] {
  if (!sql.trim()) return []
  let result
  try {
    result = parseSync(sql)
  } catch {
    return []
  }
  const declarations: ManagedViewDeclaration[] = []
  for (const stmt of result.stmts ?? []) {
    const node = stmt.stmt
    if (!node) continue
    if ('ViewStmt' in node) {
      const view = node.ViewStmt.view
      if (view?.relname) {
        declarations.push({
          name: buildViewRef(view as RangeVar & { relname: string }),
          type: 'view',
        })
      }
      continue
    }
    if ('CreateTableAsStmt' in node && node.CreateTableAsStmt.objtype === 'OBJECT_MATVIEW') {
      const view = node.CreateTableAsStmt.into?.rel
      if (view?.relname) {
        declarations.push({
          name: buildViewRef(view as RangeVar & { relname: string }),
          type: 'materialized view',
        })
      }
    }
  }
  return declarations
}

export function extractViewNames(sql: string): string[] {
  return extractViewDeclarations(sql).map(declaration => declaration.name)
}

export function buildDropViewStatement(declaration: ManagedViewDeclaration): string {
  return `DROP ${declaration.type.toUpperCase()} IF EXISTS ${declaration.name};`
}

export function buildDropViewsStatement(declarations: ManagedViewDeclaration[]): string | null {
  if (declarations.length === 0) return null
  const statements = declarations.map(buildDropViewStatement)
  const names = declarations.map(declaration => declaration.name)
  const body = `
DECLARE
  pending_statements text[] := ARRAY[${statements.map(escapeLiteral).join(', ')}];
  pending_names text[] := ARRAY[${names.map(escapeLiteral).join(', ')}];
  remaining_statements text[];
  remaining_names text[];
  last_detail text;
  last_hint text;
  last_message text;
  index integer;
  progress boolean;
BEGIN
  WHILE cardinality(pending_statements) > 0 LOOP
    remaining_statements := ARRAY[]::text[];
    remaining_names := ARRAY[]::text[];
    progress := false;
    FOR index IN 1..cardinality(pending_statements) LOOP
      BEGIN
        EXECUTE pending_statements[index];
        progress := true;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        GET STACKED DIAGNOSTICS
          last_message = MESSAGE_TEXT,
          last_detail = PG_EXCEPTION_DETAIL,
          last_hint = PG_EXCEPTION_HINT;
        remaining_statements := array_append(remaining_statements, pending_statements[index]);
        remaining_names := array_append(remaining_names, pending_names[index]);
      END;
    END LOOP;
    IF NOT progress THEN
      RAISE EXCEPTION USING
        ERRCODE = '2BP01',
        MESSAGE = 'Forced view teardown made no progress; blocked views: ' || array_to_string(remaining_names, ', '),
        DETAIL = concat_ws(E'\n', last_message, last_detail),
        HINT = last_hint;
    END IF;
    pending_statements := remaining_statements;
    pending_names := remaining_names;
  END LOOP;
END`
  return `DO ${escapeLiteral(body)};`
}
