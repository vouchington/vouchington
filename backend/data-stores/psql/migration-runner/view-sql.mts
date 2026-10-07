import { escapeLiteral } from 'pg'

import type { ManagedViewDeclaration } from 'vouchington-tooling/sql-ast'

export { extractViewDeclarations, type ManagedViewDeclaration } from 'vouchington-tooling/sql-ast'

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
