/**
 * Regenerates the ownership table region in .github/workflows/VITEST.md from
 * ci/vitest/project-ownership.mts's VITEST_OWNERSHIP — the single source of truth for which CI
 * job owns each Vitest project. Delegates final formatting to oxfmt's own `format()` API (same
 * engine as `pnpm run oxfmt`/`oxfmt:check`) so hand-rolled table padding never drifts from
 * `oxfmt --check`. Mirrors `formatWithOxfmt` in
 * `backend/data-stores/psql/schema-snapshot/generate.mts`.
 *
 * Usage:
 *   node ci/vitest/generate-ownership-table.mts          # write
 *   node ci/vitest/generate-ownership-table.mts --check  # verify only, exit non-zero if stale
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { VITEST_OWNERSHIP } from './project-ownership.mts'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.join(import.meta.dirname, '../..')
const DEFAULT_DOC_PATH = path.join(ROOT, '.github/workflows/VITEST.md')

const BEGIN = '<!-- BEGIN GENERATED: vitest-ownership -->'
const END = '<!-- END GENERATED -->'

// Job labels that are plain identifiers (no spaces) render as code, e.g. `tooling`; descriptive
// labels render as prose, e.g. Linux + macOS portability.
function renderJobLabel(jobLabel: string): string {
  const parenMatch = /^(\S+)\s+(\(.+\))$/.exec(jobLabel)
  if (parenMatch) return `\`${parenMatch[1]}\` ${parenMatch[2]}`
  return jobLabel.includes(' ') ? jobLabel : `\`${jobLabel}\``
}

// Env-var-shaped credentials (e.g. OPENAI_API_KEY) render as code; descriptive labels (e.g.
// "AWS tests role") render as prose.
const ENV_VAR_SHAPED = /^[A-Z][A-Z0-9_]*$/
function renderCredential(credential: string): string {
  return ENV_VAR_SHAPED.test(credential) ? `\`${credential}\`` : credential
}

function generateOwnershipTable(): string {
  const rows = VITEST_OWNERSHIP.flatMap(job =>
    job.projects.map(
      project =>
        `| \`${project.project}\` | \`${job.workflow}\` | ${renderJobLabel(job.jobLabel)} | ${renderCredential(project.credential)} |`,
    ),
  )
  return [
    '| Vitest project | Workflow | Job | Credential requirement |',
    '| --------------- | -------- | --- | ----------------------- |',
    ...rows,
  ].join('\n')
}

function spliceGeneratedRegion(existing: string, table: string): string {
  const beginIdx = existing.indexOf(BEGIN)
  const endIdx = existing.indexOf(END)
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error(`VITEST.md is missing the ${BEGIN} / ${END} markers`)
  }
  const before = existing.slice(0, beginIdx + BEGIN.length)
  const after = existing.slice(endIdx)
  return `${before}\n\n${table}\n\n${after}`
}

async function formatWithOxfmt(filePath: string, raw: string): Promise<string> {
  const result = await format(filePath, raw)
  if (result.errors.length > 0) {
    throw new Error(
      `oxfmt failed to format ${filePath}:\n${result.errors.map(err => err.message).join('\n')}`,
    )
  }
  return result.code
}

/** Pure render step, exposed for tests: splice the current table into `existing` and format it. */
export async function renderVitestOwnershipDoc(
  existing: string,
  docPath = DEFAULT_DOC_PATH,
): Promise<string> {
  return formatWithOxfmt(docPath, spliceGeneratedRegion(existing, generateOwnershipTable()))
}

export async function writeVitestOwnershipDoc({
  check = false,
  docPath = DEFAULT_DOC_PATH,
}: { check?: boolean; docPath?: string } = {}): Promise<void> {
  const existing = readFileSync(docPath, 'utf8')
  const formatted = await renderVitestOwnershipDoc(existing, docPath)

  if (!check) {
    writeFileSync(docPath, formatted)
    return
  }

  if (existing !== formatted) {
    throw new Error(
      `${docPath} ownership table is stale. Regenerate it by running ` +
        '`node ci/vitest/generate-ownership-table.mts` and commit the result.',
    )
  }
}

/* v8 ignore start -- direct-execution entry; exercised by the static-code-analysis --check CI
   step, not unit tests. writeVitestOwnershipDoc (the testable half) is covered directly in
   generate-ownership-table.test.mts. */
if (process.argv?.[1] && realpathSync(process.argv[1]) === __filename) {
  const check = process.argv.includes('--check')
  try {
    await writeVitestOwnershipDoc({ check })
    console.log(
      check ? 'VITEST.md ownership table is up to date.' : 'VITEST.md ownership table written.',
    )
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
/* v8 ignore stop */
