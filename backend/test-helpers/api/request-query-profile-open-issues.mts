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
} from './request-query-profile-baseline.mts'

const run = promisify(execFile)

/* no-mistakes: integration=github */
async function readRepository(): Promise<string> {
  const { stdout } = await run('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ])
  return stdout.trim()
}

/**
 * State of the repository's own issue, or undefined when it is missing. A pull request or an
 * issue transferred elsewhere (the API follows the redirect) is reported as such, never as open.
 */
/* no-mistakes: integration=github */
async function readIssueState(repo: string, issue: number): Promise<string | undefined> {
  try {
    const { stdout } = await run('gh', [
      'api',
      `repos/${repo}/issues/${issue}`,
      '--jq',
      '[.state, .repository_url, has("pull_request")] | @json',
    ])
    const [state, url, isPullRequest] = JSON.parse(stdout) as [string, string, boolean]
    if (isPullRequest) return 'a pull request'
    return url.toLowerCase().endsWith(`/repos/${repo.toLowerCase()}`) ? state : 'transferred'
  } catch (err) {
    // A deleted issue is reported by the entry diagnostic; other errors fail hard.
    if (!/HTTP 404|Not Found/i.test(String((err as { stderr?: unknown }).stderr))) throw err
    return undefined
  }
}
// Pull requests and merge groups check only when they change the baseline file.
const BASELINE_PATH = 'backend/test-helpers/api/request-query-profile-baseline.json'
if (['pull_request', 'merge_group'].includes(process.env.EVENT_NAME ?? '')) {
  const base = process.env.BASE_SHA ?? ''
  // A pull request compares its own layer (HEAD^1, the checkout's synthetic-merge parent); a merge
  // group compares the combined base and head.
  const range = process.env.EVENT_NAME === 'pull_request' ? 'HEAD^1' : base
  if (range === base) await run('git', ['fetch', '--no-tags', '--depth=1', 'origin', base])
  const { stdout } = await run('git', ['diff', '--name-only', range, 'HEAD'])
  if (!stdout.split('\n').includes(BASELINE_PATH)) {
    process.stdout.write('skipped: the baseline file is unchanged\n')
    process.exit(0)
  }
}
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
const repo = await readRepository()
const states = new Map<number, string>()
// Sequential on purpose: few distinct issues, and no burst against the GitHub API.
for (const issue of issues) {
  const state = await readIssueState(repo, issue)
  if (state !== undefined) states.set(issue, state)
}
const closed = formatClosedBaselineIssues(baseline, states)
for (const line of closed) process.stderr.write(`${line}\n`)
process.stdout.write(
  `${issues.length} baseline issues checked, ${closed.length} entries not open\n`,
)
process.exitCode = closed.length > 0 ? 1 : 0
