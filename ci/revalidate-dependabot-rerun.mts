import { execFile as execFileCallback } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { assessSourceRunState, FAILED_CONCLUSIONS } from './source-run-assessment.mts'
import {
  exactSourceIdentity,
  pullRequestState,
  type DependabotRerunInputs as Inputs,
} from './revalidate-dependabot-rerun-identity.mts'
import { ghApi, LOG_MAX_BUFFER_BYTES, type GhApiExecFile } from './transient-retry/gh-api.mts'

const execFile = promisify(execFileCallback) as GhApiExecFile

function positiveInteger(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function readInputs(environment: NodeJS.ProcessEnv): Inputs | null {
  const prNumber = positiveInteger(environment.PR_NUMBER)
  const sourceRunAttempt = positiveInteger(environment.SOURCE_RUN_ATTEMPT)
  const sourceRunId = positiveInteger(environment.SOURCE_RUN_ID)
  const {
    EVENT_HEAD_SHA: eventHeadSha,
    GITHUB_REPOSITORY: repository,
    HEAD_BRANCH: headBranch,
  } = environment
  const sourceRunConclusion = environment.SOURCE_RUN_CONCLUSION

  if (
    !prNumber ||
    !sourceRunAttempt ||
    !sourceRunId ||
    !repository ||
    !headBranch ||
    !eventHeadSha ||
    !/^[a-f0-9]{40}$/i.test(eventHeadSha) ||
    !sourceRunConclusion ||
    !FAILED_CONCLUSIONS.has(sourceRunConclusion)
  ) {
    return null
  }

  return {
    eventHeadSha,
    headBranch,
    prNumber,
    repository,
    sourceRunAttempt,
    sourceRunConclusion,
    sourceRunId,
  }
}

function notice(message: string): void {
  console.log(`::notice::${message}`)
}

function failure(message: string): number {
  console.error(`::error::${message}`)
  return 1
}

export async function runDependabotRerun(
  environment: NodeJS.ProcessEnv,
  {
    execFile: ghExecFile = execFile,
    now = Date.now,
  }: { execFile?: GhApiExecFile; now?: () => number } = {},
): Promise<number> {
  const inputs = readInputs(environment)
  if (!inputs) return failure('Dependabot rerun inputs are missing or invalid; refusing to mutate.')

  let source: unknown
  try {
    const { stdout } = await ghApi(
      [`repos/${inputs.repository}/actions/runs/${inputs.sourceRunId}`],
      { execFile: ghExecFile, maxBuffer: LOG_MAX_BUFFER_BYTES },
    )
    source = JSON.parse(stdout) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failure(`Could not revalidate source workflow run: ${message}`)
  }

  const sourceState = assessSourceRunState(
    source,
    {
      conclusion: inputs.sourceRunConclusion,
      repository: inputs.repository,
      runAttempt: inputs.sourceRunAttempt,
      runId: inputs.sourceRunId,
    },
    now(),
  )
  if (!sourceState.current) {
    if (
      sourceState.reason === 'run-attempt-changed' ||
      sourceState.reason === 'status-changed' ||
      sourceState.reason === 'conclusion-changed' ||
      sourceState.reason === 'stale-source-run'
    ) {
      notice(`Source workflow run was superseded (${sourceState.reason}); skipping rerun.`)
      return 0
    }
    return failure(`Source workflow run failed validation: ${sourceState.reason}`)
  }
  if (!exactSourceIdentity(source, inputs)) {
    return failure('Source workflow run identity or pull-request association did not match.')
  }

  let pullRequest: unknown
  try {
    const { stdout } = await ghApi([`repos/${inputs.repository}/pulls/${inputs.prNumber}`], {
      execFile: ghExecFile,
      maxBuffer: LOG_MAX_BUFFER_BYTES,
    })
    pullRequest = JSON.parse(stdout) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failure(`Could not revalidate Dependabot pull request: ${message}`)
  }

  const prState = pullRequestState(pullRequest, inputs)
  if (prState === 'closed') {
    notice(`Dependabot pull request #${inputs.prNumber} is closed; skipping rerun.`)
    return 0
  }
  if (prState === 'advanced') {
    notice(
      `Dependabot pull request #${inputs.prNumber} advanced since the source event; skipping rerun.`,
    )
    return 0
  }
  if (prState !== 'current') {
    return failure('Dependabot pull request identity or head no longer matches the source event.')
  }

  try {
    await ghExecFile(
      'gh',
      ['run', 'rerun', '--repo', inputs.repository, String(inputs.sourceRunId)],
      {
        maxBuffer: LOG_MAX_BUFFER_BYTES,
      },
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failure(`Dependabot rerun request failed: ${message}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDependabotRerun({
    EVENT_HEAD_SHA: process.env.EVENT_HEAD_SHA,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    HEAD_BRANCH: process.env.HEAD_BRANCH,
    PR_NUMBER: process.env.PR_NUMBER,
    SOURCE_RUN_ATTEMPT: process.env.SOURCE_RUN_ATTEMPT,
    SOURCE_RUN_CONCLUSION: process.env.SOURCE_RUN_CONCLUSION,
    SOURCE_RUN_ID: process.env.SOURCE_RUN_ID,
  })
}
