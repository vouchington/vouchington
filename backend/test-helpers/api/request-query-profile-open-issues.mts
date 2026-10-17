// Fails when a temporary baseline entry points at an issue that is not open. Usage:
// node backend/test-helpers/api/request-query-profile-open-issues.mts
// Uses `gh api` with GH_TOKEN, GITHUB_TOKEN, or a gh login; with none it says so and exits 0.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import {
  formatClosedBaselineIssues,
  parseRepeatBaseline,
  temporaryBaselineEntries,
} from '@data-stores/psql/request-query-profile-baseline'

const run = promisify(execFile)
const authenticated =
  Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) ||
  (await run('gh', ['auth', 'token']).then(
    () => true,
    () => false,
  ))
if (!authenticated) {
  process.stdout.write('skipped: no GH_TOKEN, GITHUB_TOKEN, or gh login to check baseline issues\n')
  process.exit(0)
}
const baseline = parseRepeatBaseline(
  JSON.parse(
    readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
  ),
)
const issues = [...new Set(temporaryBaselineEntries(baseline).map(({ issue }) => issue))]
const states = new Map<number, string>()
await Promise.all(
  issues.map(async issue => {
    const { stdout } = await run('gh', [
      'api',
      `repos/{owner}/{repo}/issues/${issue}`,
      '--jq',
      '.state',
    ])
    states.set(issue, stdout.trim())
  }),
)
const closed = formatClosedBaselineIssues(baseline, states)
for (const line of closed) process.stderr.write(`${line}\n`)
process.stdout.write(
  `${issues.length} baseline issues checked, ${closed.length} entries not open\n`,
)
process.exitCode = closed.length > 0 ? 1 : 0
