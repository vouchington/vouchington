import { execFile as execFileCallback } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  assessSourceRunState,
  FAILED_CONCLUSIONS,
  type ExpectedSourceRun,
  type SourceRunState,
} from './source-run-assessment.mts'
import { ghApi, LOG_MAX_BUFFER_BYTES, type GhApiExecFile } from './transient-retry/gh-api.mts'

export type { ExpectedSourceRun, SourceRunState }

const execFile = promisify(execFileCallback) as GhApiExecFile

export function sourceStateExitCode(result: SourceRunState): number {
  return /^(?:api-error|invalid-input|malformed-response|repository-mismatch|run-id-mismatch)$/.test(
    result.reason,
  )
    ? 1
    : 0
}

interface FetchSourceRunStateDependencies {
  execFile?: GhApiExecFile
  now?: () => number
}

export async function fetchSourceRunState(
  expected: ExpectedSourceRun,
  { execFile: ghExecFile = execFile, now = Date.now }: FetchSourceRunStateDependencies = {},
): Promise<SourceRunState> {
  try {
    const { stdout } = await ghApi(
      [`repos/${expected.repository}/actions/runs/${expected.runId}`],
      { execFile: ghExecFile, maxBuffer: LOG_MAX_BUFFER_BYTES },
    )
    try {
      return assessSourceRunState(JSON.parse(stdout) as unknown, expected, now())
    } catch {
      return { current: false, reason: 'malformed-response' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`::warning::Could not revalidate the source workflow run: ${message}`)
    return { current: false, reason: 'api-error' }
  }
}

function positiveInteger(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

type AppendOutput = (path: string, data: string) => void

function writeOutputs(
  result: SourceRunState,
  output: string | undefined,
  appendOutput: AppendOutput,
): void {
  if (output) appendOutput(output, `current=${String(result.current)}\nreason=${result.reason}\n`)
}

interface SourceStateEnvironment {
  GITHUB_OUTPUT?: string
  GITHUB_REPOSITORY?: string
  SOURCE_RUN_ATTEMPT?: string
  SOURCE_RUN_CONCLUSION?: string
  SOURCE_RUN_ID?: string
}

interface RunSourceStateDependencies extends FetchSourceRunStateDependencies {
  appendOutput?: AppendOutput
}

export async function runSourceStateCheck(
  environment: SourceStateEnvironment,
  {
    appendOutput = appendFileSync,
    execFile: ghExecFile = execFile,
    now = Date.now,
  }: RunSourceStateDependencies = {},
): Promise<SourceRunState> {
  const runId = positiveInteger(environment.SOURCE_RUN_ID)
  const runAttempt = positiveInteger(environment.SOURCE_RUN_ATTEMPT)
  const repository = environment.GITHUB_REPOSITORY
  const conclusion = environment.SOURCE_RUN_CONCLUSION

  if (!runId || !runAttempt || !repository || !conclusion || !FAILED_CONCLUSIONS.has(conclusion)) {
    const result: SourceRunState = { current: false, reason: 'invalid-input' }
    writeOutputs(result, environment.GITHUB_OUTPUT, appendOutput)
    console.error('::warning::Source-run inputs are missing or invalid; stopping stale work.')
    return result
  }

  const result = await fetchSourceRunState(
    {
      conclusion,
      repository,
      runAttempt,
      runId,
    },
    { execFile: ghExecFile, now },
  )
  writeOutputs(result, environment.GITHUB_OUTPUT, appendOutput)
  const annotation = result.current ? 'notice' : 'warning'
  console.log(
    `::${annotation}::Source workflow run state: current=${String(result.current)} reason=${result.reason}`,
  )
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runSourceStateCheck({
    GITHUB_OUTPUT: process.env.GITHUB_OUTPUT,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    SOURCE_RUN_ATTEMPT: process.env.SOURCE_RUN_ATTEMPT,
    SOURCE_RUN_CONCLUSION: process.env.SOURCE_RUN_CONCLUSION,
    SOURCE_RUN_ID: process.env.SOURCE_RUN_ID,
  })
  process.exitCode = sourceStateExitCode(result)
}
