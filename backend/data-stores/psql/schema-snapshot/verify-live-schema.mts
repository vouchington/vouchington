import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableStringify } from '@modules/utils/stable-stringify'
import { buildSchemaSnapshot } from './build-snapshot.mts'
import { readSchemaCatalog } from './catalog-queries.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Extension versions are provisioned by the platform (AWS Aurora, Homebrew, Docker), not by this
 * app's migrations -- migrations only control which extensions are present, never which version
 * gets installed. Aurora, local dev, and CI can each land on a different pgvector version for
 * reasons entirely outside this codebase's control (Aurora currently caps at pgvector 0.8.1 in
 * this account/region regardless of what a newer image or Homebrew formula would install), so
 * treating the recorded version as a byte-for-byte equality requirement between "live" and
 * "committed" produces permanent, unfixable false positives rather than catching real drift.
 * Extension *presence* still participates in the comparison below -- only `version` is normalized
 * away. Exported for direct unit coverage in `verify-live-schema.test.mts`: this is pure logic
 * with no live-DB dependency, unlike `verifyLiveSchemaMatchesSnapshot` below.
 */
export function normalizeExtensionVersionsForLiveComparison(
  snapshot: SchemaSnapshot,
): SchemaSnapshot {
  return {
    ...snapshot,
    extensions: Object.fromEntries(
      Object.entries(snapshot.extensions ?? {}).map(([name, extension]) => [
        name,
        { ...extension, version: 'platform-provisioned' },
      ]),
    ),
  }
}

/**
 * Confirms the live PostgreSQL catalog structurally matches the committed schema snapshot
 * (`schema.json`). This is what would have caught the incident: a migration file was edited in
 * place after staging already ran the old version, leaving staging with a missing column and a
 * missing table that nothing verified afterward.
 *
 * Deliberately narrower than `generateSchemaSnapshot`'s check mode (`./generate.mts`): that
 * function also re-renders and diffs the generated Markdown docs via `oxfmt`, a devDependency
 * stripped from the production runtime image by `pnpm deploy --prod` (`backend/Dockerfile`). This
 * function compares only the structural JSON payload (no `oxfmt`, no Markdown tree), so it is safe
 * to run unconditionally from the production migrate task (`../migrate.mts`).
 *
 * Exercised against a real database by `backend-postgres-schema` Vitest tests
 * (`../__tests__/schema-snapshot-verification.test.mts`), covering the resolve path and both
 * halves of the incident (missing column, missing table). Like `generateSchemaSnapshot`'s live-DB
 * path, this function is still marked v8-ignore below: `backend-postgres-schema` runs as its own
 * CI job (`tests-postgres-schema.yml`) without `--coverage`, outside `ci.yml`'s `test-coverage`
 * producer set, so no project that actually calls this function ever contributes LCOV to the
 * backend patch-coverage gate -- see docs/development/reference-tests-schema-checks.md.
 *
 * Intentionally does not attempt to pinpoint or repair the diff -- see
 * `reference-migrations-views-and-config-driven.md#staging-schema-drift-pre-launch-only` for why
 * automated schema repair is out of scope.
 */
/* v8 ignore start -- calls the live-DB readSchemaCatalog(); exercised for real only by
   backend-postgres-schema Vitest tests (../__tests__/schema-snapshot-verification.test.mts),
   which don't feed the backend patch-coverage LCOV pipeline -- see
   docs/development/reference-tests-schema-checks.md */
export async function verifyLiveSchemaMatchesSnapshot({
  root = __dirname,
}: { root?: string } = {}): Promise<void> {
  const schemaJsonPath = path.join(root, 'schema.json')
  const [catalog, committedJson] = await Promise.all([
    readSchemaCatalog(),
    readFile(schemaJsonPath, 'utf8'),
  ])
  const live = stableStringify(
    normalizeExtensionVersionsForLiveComparison(buildSchemaSnapshot(catalog)),
  )
  const committed = stableStringify(
    normalizeExtensionVersionsForLiveComparison(JSON.parse(committedJson) as SchemaSnapshot),
  )
  if (live === committed) return

  throw new Error(
    'The live PostgreSQL schema does not match the committed schema snapshot ' +
      `(${schemaJsonPath}). A migration likely did not apply as expected -- for example, a ` +
      'migration file was edited in place after it already ran against this database, so the ' +
      'ledger says it applied but the resulting schema differs from what the file now ' +
      'describes. Compare the live database against schema.json to find the drifted object(s); ' +
      'this check does not resolve drift automatically. See backend/data-stores/psql/' +
      'reference-migrations-views-and-config-driven.md#staging-schema-drift-pre-launch-only.',
  )
}
/* v8 ignore stop */
