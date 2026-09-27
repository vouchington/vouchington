import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const usage = 'Usage: pnpm run db:snapshot:update [-- --pr <pull-request-number>]'

function parsePullRequestNumber(argv: readonly string[]): string | undefined {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  if (args.length === 0) return undefined
  const [flag, pullRequestNumber] = args
  if (
    args.length === 2 &&
    flag === '--pr' &&
    pullRequestNumber !== undefined &&
    /^[1-9]\d*$/u.test(pullRequestNumber)
  ) {
    return pullRequestNumber
  }
  throw new Error(usage)
}

const pullRequestNumber = parsePullRequestNumber(process.argv.slice(2))

const repositoryInfo = JSON.parse(
  (await execFile('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'])).stdout,
) as { nameWithOwner: string; defaultBranchRef: { name: string } }
const repository = repositoryInfo.nameWithOwner
const pullRequestFields = 'number,headRefOid,headRepositoryOwner,state'
// `gh pr view --repo` requires a selector. With no number, GH_REPO targets the
// resolved repository and gh infers the current branch's pull request.
const { stdout } = await execFile(
  'gh',
  pullRequestNumber === undefined
    ? ['pr', 'view', '--json', pullRequestFields]
    : ['pr', 'view', pullRequestNumber, '--repo', repository, '--json', pullRequestFields],
  { env: { ...process.env, GH_REPO: repository } },
)
const pr = JSON.parse(stdout) as {
  number: number
  headRefOid: string
  headRepositoryOwner: { login: string }
  state: string
}
const head = (await execFile('git', ['rev-parse', 'HEAD'])).stdout.trim()
if (
  pr.state !== 'OPEN' ||
  pr.headRepositoryOwner.login !== repository.split('/')[0] ||
  pr.headRefOid !== head
) {
  throw new Error(
    'The open same-repository PR must contain the current pushed HEAD before requesting a snapshot update',
  )
}
await execFile('gh', [
  'workflow',
  'run',
  'postgresql-snapshot-update.yml',
  '--repo',
  repository,
  '--ref',
  repositoryInfo.defaultBranchRef.name,
  '-f',
  `pr_number=${pr.number}`,
])
console.log(
  `Requested PostgreSQL snapshot update for PR #${pr.number}. Fetch the publisher commit before continuing.`,
)
