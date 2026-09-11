import { extractDroppedIndexNames } from '../migration-runner/index-sql.mts'
import type { RenamedIndex } from '@vouchington/postgres/pg-schema-snapshot'

/**
 * Collects every index name targeted by a `DROP INDEX` statement across the given migration
 * files, for recognizing which detected renames this branch already acknowledges.
 *
 * `readFile` is injected (rather than reading `node:fs` directly) so this stays testable without
 * disk or git I/O, and so the CLI can back it with `git show <rev>:<path>` — the migration's
 * committed content at head, not whatever happens to be on disk.
 *
 * Requires loadSqlParserModule() from ../migration-runner/sql-statements.mts to have resolved
 * before the first call.
 */
export async function collectDeclaredDrops({
  migrationPaths,
  readFile,
}: {
  migrationPaths: string[]
  readFile(path: string): Promise<string | null>
}): Promise<Set<string>> {
  const contents = await Promise.all(migrationPaths.map(path => readFile(path)))
  const declaredDrops = new Set<string>()
  for (const sql of contents) {
    if (sql === null) continue
    for (const name of extractDroppedIndexNames(sql)) declaredDrops.add(name)
  }
  return declaredDrops
}

export type UnacknowledgedRenamesResult = {
  unacknowledged: RenamedIndex[]
  staleAllowlistEntries: string[]
}

/**
 * Splits detected renames into those still requiring acknowledgement and those already covered —
 * by a `DROP INDEX` of the retired name in a migration added on this branch, or by an explicit
 * `retired-index-allowlist.mts` entry — and separately reports allowlist entries that no longer
 * match any detected rename (stale), mirroring stale `allowedIndexes` detection in
 * no-mistakes `postgres-redundant-index`.
 */
export function unacknowledgedRenames(
  renames: RenamedIndex[],
  {
    declaredDrops,
    allowlist,
  }: { declaredDrops: ReadonlySet<string>; allowlist: ReadonlySet<string> },
): UnacknowledgedRenamesResult {
  const lowercaseDrops = new Set([...declaredDrops].map(d => d.toLowerCase()))
  const lowercaseAllowlist = new Map([...allowlist].map(a => [a.toLowerCase(), a]))
  const observedAllowlistEntries = new Set<string>()
  const unacknowledged = renames.filter(rename => {
    const retiredLower = rename.retiredName.toLowerCase()
    if (lowercaseDrops.has(retiredLower)) return false
    const originalAllowlistEntry = lowercaseAllowlist.get(retiredLower)
    if (originalAllowlistEntry !== undefined) {
      observedAllowlistEntries.add(originalAllowlistEntry)
      return false
    }
    return true
  })
  const staleAllowlistEntries = [...allowlist]
    .filter(entry => !observedAllowlistEntries.has(entry))
    .toSorted((left, right) => left.localeCompare(right))
  return { unacknowledged, staleAllowlistEntries }
}
