import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const args = process.argv.slice(2)
if (
  args.length !== 0 &&
  (args.length !== 2 || args[0] !== '--pr' || !/^[1-9]\d*$/u.test(args[1]!))
) {
  throw new Error('Usage: pnpm run db:snapshot:update [-- --pr <pull-request-number>]')
}

const repositoryInfo = JSON.parse(
  (await execFile('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'])).stdout,
) as { nameWithOwner: string; defaultBranchRef: { name: string } }
const repository = repositoryInfo.nameWithOwner
const prArguments = args.length === 2 ? [args[1]!] : []
const { stdout } = await execFile('gh', [
  'pr',
  'view',
  ...prArguments,
  '--repo',
  repository,
  '--json',
  'number,headRefOid,headRepositoryOwner,state',
])
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
