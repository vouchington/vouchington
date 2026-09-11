function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

/**
 * Whether an already-parsed AST node is a value that can produce a *different* result on every
 * replay: a PostgreSQL VOLATILE function (`gen_random_uuid()`, `random()`, `nextval(...)`, the
 * `uuid_generate_*`/`uuidv7()`/`uuidv4()` family) or a current-time value (`now()`, `timeofday()`,
 * the `SQLValueFunction` siblings `CURRENT_TIMESTAMP`/`CURRENT_DATE`/`CURRENT_TIME`/
 * `LOCALTIMESTAMP`/`LOCALTIME`, and the typed special literals `TIMESTAMP 'now'`/`DATE 'today'`/
 * `'tomorrow'`/`'yesterday'`). `now()` and `CURRENT_TIMESTAMP` are grouped together deliberately —
 * they are the same function under a different spelling, so on-conflict-convergence.mts must not
 * accept one bare while rejecting the other. `timeofday()` is stricter still: unlike `now()` it is
 * not even frozen for the duration of a transaction. `uuidv4()` (PostgreSQL 18+) is
 * `gen_random_uuid()`'s built-in alias and must stay denylisted alongside it.
 *
 * Session/role-identity `SQLValueFunction`s (`CURRENT_USER`, `SESSION_USER`, `CURRENT_ROLE`,
 * `USER`, `CURRENT_CATALOG`, `CURRENT_SCHEMA`) are intentionally excluded: they are constant for
 * the whole replaying session, not volatile across replays, and the caller (a seed script) never
 * runs as a session-dependent role in a way that changes the value between boots. Likewise the
 * fixed special literals `epoch`/`infinity`/`-infinity`/`allballs` are excluded from
 * `VOLATILE_SPECIAL_DATETIME_LITERALS` below — PostgreSQL resolves them to the same value on every
 * parse, unlike `now`/`today`/`tomorrow`/`yesterday`.
 */
const VOLATILE_FUNCTION_NAMES = new Set([
  'gen_random_uuid',
  'random',
  'nextval',
  'uuidv7',
  'uuidv4',
  'uuid_generate_v1',
  'uuid_generate_v1mc',
  'uuid_generate_v4',
  'now',
  'timeofday',
  'clock_timestamp',
  'statement_timestamp',
  'transaction_timestamp',
])

// PostgreSQL's date/time input functions resolve these strings afresh on every parse; unlike
// `epoch`/`infinity`/`-infinity`/`allballs` they are not fixed values. Matched case-insensitively
// and trimmed, mirroring PostgreSQL's own lenient special-literal parsing.
const VOLATILE_SPECIAL_DATETIME_LITERALS = new Set(['now', 'today', 'tomorrow', 'yesterday'])

// The type names a `TypeCast` can carry when casting a special date/time literal — qualified with
// `pg_catalog` for TIMESTAMP/TIME/their TZ variants, bare for DATE.
const DATETIME_CAST_TYPE_NAMES = new Set(['date', 'time', 'timetz', 'timestamp', 'timestamptz'])

// The `_N` variants are the precision-argument forms (`CURRENT_TIME(3)`) and map to the same
// display name as their bare sibling.
const SQL_VALUE_FUNCTION_FORMS: Record<string, string> = {
  SVFOP_CURRENT_DATE: 'CURRENT_DATE',
  SVFOP_CURRENT_TIME: 'CURRENT_TIME',
  SVFOP_CURRENT_TIME_N: 'CURRENT_TIME',
  SVFOP_CURRENT_TIMESTAMP: 'CURRENT_TIMESTAMP',
  SVFOP_CURRENT_TIMESTAMP_N: 'CURRENT_TIMESTAMP',
  SVFOP_LOCALTIME: 'LOCALTIME',
  SVFOP_LOCALTIME_N: 'LOCALTIME',
  SVFOP_LOCALTIMESTAMP: 'LOCALTIMESTAMP',
  SVFOP_LOCALTIMESTAMP_N: 'LOCALTIMESTAMP',
}

// Matched on the *last* `funcname` element, never the first — `pg_catalog.random()` must not
// bypass the denylist by qualification.
function funcCallVolatileForm(funcCall: Record<string, unknown>): string | undefined {
  const funcname = funcCall.funcname
  if (!Array.isArray(funcname) || funcname.length === 0) return undefined
  const last = funcname.at(-1)
  const name =
    isRecord(last) && isRecord(last.String) && typeof last.String.sval === 'string'
      ? last.String.sval
      : undefined
  return name !== undefined && VOLATILE_FUNCTION_NAMES.has(name) ? `${name}()` : undefined
}

// Matched on the *last* `typeName.names` element, never the first — TIMESTAMP/TIME cast names are
// qualified as `pg_catalog.timestamp`, DATE is bare `date`.
function typeCastVolatileForm(typeCast: Record<string, unknown>): string | undefined {
  const typeName = typeCast.typeName
  const names = isRecord(typeName) && Array.isArray(typeName.names) ? typeName.names : undefined
  const lastName = names?.at(-1)
  const castType =
    isRecord(lastName) && isRecord(lastName.String) && typeof lastName.String.sval === 'string'
      ? lastName.String.sval
      : undefined
  if (castType === undefined || !DATETIME_CAST_TYPE_NAMES.has(castType)) return undefined
  const arg = typeCast.arg
  const sval = isRecord(arg) && isRecord(arg.A_Const) ? arg.A_Const.sval : undefined
  const literal =
    isRecord(sval) && typeof sval.sval === 'string' ? sval.sval.trim().toLowerCase() : undefined
  return literal !== undefined && VOLATILE_SPECIAL_DATETIME_LITERALS.has(literal)
    ? `${castType} '${literal}'`
    : undefined
}

/** Function values that produce a different result on each replay. */
export function volatileValueForm(node: unknown): string | undefined {
  if (!isRecord(node)) return undefined
  if (isRecord(node.FuncCall)) return funcCallVolatileForm(node.FuncCall)
  if (isRecord(node.TypeCast)) return typeCastVolatileForm(node.TypeCast)
  const sqlValueFunction = node.SQLValueFunction
  if (isRecord(sqlValueFunction) && typeof sqlValueFunction.op === 'string') {
    return SQL_VALUE_FUNCTION_FORMS[sqlValueFunction.op]
  }
  return undefined
}
