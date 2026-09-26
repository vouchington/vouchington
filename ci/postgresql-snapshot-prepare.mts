import { readFile, writeFile } from 'node:fs/promises'
import {
  assertCurrentPullRequest,
  parseSnapshotRequest,
  type SnapshotIdentity,
} from './postgresql-snapshot-update-core.mts'
import {
  assertAuthorizedActor,
  assertBaseAncestor,
  candidateImage,
  pullRequest,
} from './postgresql-snapshot-github.mts'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function numeric(name: string): number {
  const value = Number(required(name))
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`)
  return value
}

export async function prepareSnapshotRequest(): Promise<void> {
  const repository = required('GITHUB_REPOSITORY')
  const eventName = required('GITHUB_EVENT_NAME')
  const event = JSON.parse(await readFile(required('GITHUB_EVENT_PATH'), 'utf8')) as {
    issue?: { number: number; pull_request?: unknown }
    comment?: { body: string; user: { login: string } }
    inputs?: { pr_number?: string | number }
    repository?: { default_branch: string; full_name: string }
    sender?: { login: string }
  }
  if (event.repository?.full_name !== repository)
    throw new Error('Event repository differs from job repository')
  if (required('GITHUB_REF') !== `refs/heads/${event.repository.default_branch}`) {
    throw new Error('Snapshot update workflow must run from the default branch')
  }
  if (eventName === 'issue_comment' && !event.issue?.pull_request) return
  const number = parseSnapshotRequest(
    eventName,
    event.comment?.body,
    eventName === 'issue_comment'
      ? String(event.issue?.number ?? '')
      : String(event.inputs?.pr_number ?? ''),
  )
  if (number === null) return
  const actor = eventName === 'issue_comment' ? event.comment?.user.login : event.sender?.login
  if (!actor) throw new Error('Snapshot request actor is missing')
  await assertAuthorizedActor(repository, actor)

  const pr = await pullRequest(repository, number)
  const identity: SnapshotIdentity = {
    repository,
    prNumber: number,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
    postgresImage: await candidateImage(repository, pr.head.sha),
    runId: numeric('GITHUB_RUN_ID'),
    runAttempt: numeric('GITHUB_RUN_ATTEMPT'),
  }
  assertCurrentPullRequest(pr, identity, event.repository.default_branch)
  await assertBaseAncestor(repository, identity.baseSha, identity.headSha)
  const output = required('GITHUB_OUTPUT')
  await writeFile(
    output,
    `${[
      'accepted=true',
      `pr_number=${identity.prNumber}`,
      `head_ref=${identity.headRef}`,
      `head_sha=${identity.headSha}`,
      `base_ref=${identity.baseRef}`,
      `base_sha=${identity.baseSha}`,
      `postgres_image=${identity.postgresImage}`,
      `default_branch=${event.repository.default_branch}`,
    ].join('\n')}\n`,
    { flag: 'a' },
  )
  console.log(`Accepted snapshot request for PR #${number} at ${identity.headSha}`)
}
