import { runInitializeScript } from './initialize.mts'

// Bash stubs for the PostgreSQL CLIs dev/initialize's database helpers call. The recording stubs
// append one line per call to "$record", which `runRecordedInitialize` creates and returns.

export type PsqlAnswer = readonly [queryGlob: string, reply: string]

// The migrations-table probe reports an already-migrated database.
export const migratedDatabase: PsqlAnswer = ["to_regclass('migrations')", 't']

// A migrated database whose recently-viewed-topics detector reports a stale schema.
export const staleRecentlyViewedTopics: readonly PsqlAnswer[] = [
  migratedDatabase,
  ['recently_viewed_topics', 't'],
]

// Records `psql:<PGHOST>:<PGPORT>:<target> <flag>`: only the first two arguments, so schema-probe
// SQL stays out of the record.
export const recordPsqlTarget = `printf 'psql:%s:%s:%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1 $2" >> "$record"`

// Prints the reply of the first answer whose glob the query contains, or `f` when none match.
export function answerPsql(answers: readonly PsqlAnswer[]): string {
  const arms = answers.map(([glob, reply]) => `*"${glob}"*) printf '%s' '${reply}' ;;`)
  return `case "$*" in ${[...arms, "*) printf 'f' ;;"].join(' ')} esac`
}

export function stubPsql(...body: string[]): string {
  return `psql() {\n${body.join('\n')}\n}`
}

// dropdb/createdb stubs recording `drop:<db>` and `create:<db>`, with the PGHOST/PGPORT each call
// ran under between the action and the database when `withTarget` is set.
export function recordDropdbAndCreatedb({ withTarget = false } = {}): string {
  const target = withTarget ? `\${PGHOST:-}:\${PGPORT:-}:` : ''
  return ['drop', 'create']
    .map(action => `${action}db() { printf '%s\\n' "${action}:${target}$1" >> "$record"; }`)
    .join('\n')
}

// Runs `script` via dev/initialize with a fresh "$record" file, returning what the recording
// stubs appended to it.
export function runRecordedInitialize({
  script,
  ...options
}: {
  cwd: string
  script: string
  env?: NodeJS.ProcessEnv
}): Promise<string> {
  return runInitializeScript({ ...options, script: `record=$(mktemp)\n${script}\ncat "$record"` })
}
