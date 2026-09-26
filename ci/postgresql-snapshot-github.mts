import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import {
  assertCurrentPullRequest,
  postgresImageFromWorkflow,
  type PullRequestIdentity,
  type SnapshotIdentity,
} from './postgresql-snapshot-update-core.mts'

const execFile = promisify(execFileCallback)

export async function githubGet<T>(path: string): Promise<T> {
  const token = process.env.GH_TOKEN
  if (!token) throw new Error('GH_TOKEN is required')
  const { stdout } = await execFile('gh', ['api', path], {
    env: { ...process.env, GH_TOKEN: token },
    maxBuffer: 8_000_000,
  })
  return JSON.parse(stdout) as T
}

export async function pullRequest(
  repository: string,
  number: number,
): Promise<PullRequestIdentity> {
  return githubGet<PullRequestIdentity>(`repos/${repository}/pulls/${number}`)
}

export async function assertBaseAncestor(
  repository: string,
  baseSha: string,
  headSha: string,
): Promise<void> {
  const comparison = await githubGet<{ status: string; merge_base_commit: { sha: string } }>(
    `repos/${repository}/compare/${baseSha}...${headSha}`,
  )
  if (
    !['ahead', 'identical'].includes(comparison.status) ||
    comparison.merge_base_commit.sha !== baseSha
  ) {
    throw new Error(
      'PR head does not contain its current base; update the branch before regenerating',
    )
  }
}

export async function candidateImage(repository: string, headSha: string): Promise<string> {
  const response = await githubGet<{ content: string; encoding: string }>(
    `repos/${repository}/contents/.github/workflows/tests-postgres-schema.yml?ref=${headSha}`,
  )
  if (response.encoding !== 'base64')
    throw new Error('Candidate schema workflow is not base64 content')
  return postgresImageFromWorkflow(Buffer.from(response.content, 'base64').toString('utf8'))
}

export async function assertAuthorizedActor(repository: string, actor: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{1,39}$/u.test(actor)) throw new Error('Invalid GitHub actor')
  const result = await githubGet<{ permission: string; role_name?: string }>(
    `repos/${repository}/collaborators/${actor}/permission`,
  )
  if (!['admin', 'write'].includes(result.permission)) {
    throw new Error(
      'Snapshot update requires current WRITE, MAINTAIN, or ADMIN repository permission',
    )
  }
}

export async function assertPublishTarget(
  identity: SnapshotIdentity,
  defaultBranch: string,
): Promise<void> {
  const pr = await pullRequest(identity.repository, identity.prNumber)
  assertCurrentPullRequest(pr, identity, defaultBranch)
  await assertBaseAncestor(identity.repository, identity.baseSha, identity.headSha)
}
