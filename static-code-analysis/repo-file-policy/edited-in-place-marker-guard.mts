import { spawnSync } from 'node:child_process'
import {
  LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS,
  POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE,
  PRE_LAUNCH_IN_PLACE_EDITS,
} from './postgres-schema-guardrail-allowlist.mts'

// Kept in sync with the marker text backend/data-stores/psql/AGENTS.md#migration-rules mandates.
const CURRENT_EDITED_IN_PLACE_MARKER =
  '-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)'
// Retired wording. Only files listed in LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS may still use it.
const LEGACY_EDITED_IN_PLACE_MARKER = '-- edited-in-place: pre-launch, never deployed to production'

// Only the `pre-launch` in-place-edit marker is regulated here; the many other
// `-- edited-in-place: <description of what changed>` comments in these files are unrelated
// free-text notes for reviewers and are intentionally left alone.
export function checkEditedInPlaceMarkerWording(
  file: string,
  content: string,
  observedLegacyMarkerMigrations: Set<string>,
  errors: string[],
): void {
  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line?.startsWith('-- edited-in-place: pre-launch,')) continue
    const lineNum = index + 1
    if (!PRE_LAUNCH_IN_PLACE_EDITS.permitted) {
      errors.push(
        `::error file=${file},line=${lineNum}::the pre-launch in-place-edit convention has been ` +
          'retired (PRE_LAUNCH_IN_PLACE_EDITS.permitted is false); remove this marker and treat the ' +
          'file as a normal deployed migration (see backend/data-stores/psql/AGENTS.md#migration-rules)',
      )
      continue
    }
    if (line === CURRENT_EDITED_IN_PLACE_MARKER) continue
    if (line === LEGACY_EDITED_IN_PLACE_MARKER) {
      if (LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS.has(file)) {
        observedLegacyMarkerMigrations.add(file)
        continue
      }
      errors.push(
        `::error file=${file},line=${lineNum}::edited-in-place marker uses the retired wording ` +
          `"never deployed to production"; use "${CURRENT_EDITED_IN_PLACE_MARKER}" (see ` +
          'backend/data-stores/psql/AGENTS.md#migration-rules)',
      )
      continue
    }
    errors.push(
      `::error file=${file},line=${lineNum}::edited-in-place marker must read exactly ` +
        `"${CURRENT_EDITED_IN_PLACE_MARKER}" (see backend/data-stores/psql/AGENTS.md#migration-rules)`,
    )
  }
}

// Called only when POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE is itself tracked, same gating as the
// other allowlist-staleness sweeps in migration-sql-guard.mts.
export function checkStaleLegacyEditedInPlaceMarkerEntries(
  observedLegacyMarkerMigrations: Set<string>,
  errors: string[],
): void {
  for (const file of LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS) {
    if (observedLegacyMarkerMigrations.has(file)) continue
    errors.push(
      `::error file=${POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE}::stale legacy edited-in-place marker allowlist entry: ${file} -- remove it once the file's marker wording is updated or the file no longer exists`,
    )
  }
}

// A valid base has both wording and stale-entry enforcement: its retired-marker paths are
// exactly its allowed paths. Reading those committed SQL lines avoids parsing historical TS.
export function checkLegacyEditedInPlaceMarkerRatchet(
  repoRoot: string,
  currentEntries: ReadonlySet<string>,
  errors: string[],
  baseRef = process.env.BASE_SHA ?? (process.env.GITHUB_ACTIONS === 'true' ? '' : 'origin/main'),
): void {
  if (!baseRef) {
    errors.push(
      '::error::legacy marker ratchet requires BASE_SHA in CI; provide the event base commit',
    )
    return
  }
  const base = spawnSync(
    'git',
    ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  )
  if (base.error || base.status !== 0) {
    errors.push(
      `::error file=${POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE}::cannot read legacy marker comparison base ${baseRef}; fetch the base commit before running repo-file-policy (CI must provide BASE_SHA)`,
    )
    return
  }
  const revision = base.stdout.trim()
  const matches = spawnSync(
    'git',
    [
      'grep',
      '-l',
      '-z',
      '-G',
      '-e',
      `^${LEGACY_EDITED_IN_PLACE_MARKER}$`,
      revision,
      '--',
      ':(glob)backend/data-stores/psql/migrations/**/*.sql',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  if (matches.error || (matches.status !== 0 && matches.status !== 1)) {
    errors.push(
      `::error file=${POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE}::cannot inspect legacy markers at comparison base ${baseRef}`,
    )
    return
  }
  const allowed = new Set(
    matches.stdout
      .split('\0')
      .filter(Boolean)
      .map(path => path.slice(revision.length + 1)),
  )
  for (const file of currentEntries) {
    if (allowed.has(file)) continue
    errors.push(
      `::error file=${POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE}::legacy edited-in-place marker allowlist cannot grow: ${file} had no retired marker at ${baseRef}; remove the entry and use the current wording`,
    )
  }
}
