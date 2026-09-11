import { execFile as execFileCb } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs as nodeParseArgs, promisify } from 'node:util'

import { decide, type DecisionResult } from './decide.mts'
import { LOG_MAX_BUFFER_BYTES, type GhApiExecFile } from './gh-api.mts'
import {
  buildWorkflowRunContext,
  fetchWorkflowRunSummary,
  isFailedWorkflowConclusion,
} from './run-context.mts'
import { RULES } from './rules.mts'

const execFile = promisify(execFileCb) as GhApiExecFile

interface ParsedArgs {
  dryRun: boolean
  repository: string | undefined
  runId: string
}

interface MainDeps {
  decideRun?: typeof decide
  execFile?: GhApiExecFile
  log?: (message: string) => void
  sleep?: (ms: number) => Promise<void>
}

function usage(): string {
  return [
    'Usage: node ci/transient-retry/rerun-known-transient.mts <run-id> [--repo owner/name] [--dry-run]',
    '',
    'Evaluates ci/transient-retry rules for a failed workflow run and reruns only known transient matches.',
  ].join('\n')
}

export function parseArgs(args: string[], env: NodeJS.ProcessEnv): ParsedArgs {
  if (args.includes('--help') || args.includes('-h')) throw new Error(usage())

  let dryRun: boolean
  let repository: string | undefined
  let positionals: string[]
  try {
    const parsed = nodeParseArgs({
      args,
      options: {
        'dry-run': { type: 'boolean' },
        repo: { type: 'string' },
      },
      strict: true,
      allowPositionals: true,
    })
    dryRun = parsed.values['dry-run'] ?? false
    repository = parsed.values.repo ?? env.GITHUB_REPOSITORY
    positionals = parsed.positionals
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`, {
      cause: error,
    })
  }

  const [runId, unexpected] = positionals
  if (unexpected !== undefined) throw new Error(`Unexpected argument: ${unexpected}\n\n${usage()}`)
  if (!runId) throw new Error(`Missing run id.\n\n${usage()}`)

  return { dryRun, repository, runId }
}

async function resolveRepository(
  repository: string | undefined,
  execFile: GhApiExecFile,
): Promise<string> {
  if (repository) return repository

  try {
    const result = await execFile(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
      { maxBuffer: LOG_MAX_BUFFER_BYTES },
    )
    const inferredRepository = result.stdout.trim()
    if (inferredRepository) return inferredRepository
  } catch {
    // Fall through to the actionable error below.
  }

  throw new Error(
    'Missing repository. Pass --repo owner/name, set GITHUB_REPOSITORY, or run from a gh-authenticated checkout.',
  )
}

function logDecision(
  log: (message: string) => void,
  result: DecisionResult,
  context: {
    conclusion: string | null | undefined
    failedJobNames?: string[]
    ruleAttempt?: number
    runAttempt: number
    workflowName: string
  },
): void {
  log(`Workflow: ${context.workflowName}`)
  log(`Conclusion: ${context.conclusion ?? '(none)'}`)
  log(
    `Run attempt: ${context.runAttempt} (rule attempt: ${context.ruleAttempt ?? context.runAttempt})`,
  )
  if (context.failedJobNames) {
    log(`Failed jobs: ${context.failedJobNames.join(', ') || '(none)'}`)
  }
  log(`Decision: ${result.decision}`)
  if (result.matchedRule) log(`Matched rule: ${result.matchedRule}`)
}

export async function main(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  { decideRun = decide, execFile: ghExecFile = execFile, log = console.log, sleep }: MainDeps = {},
): Promise<number> {
  const { dryRun, repository: parsedRepository, runId } = parseArgs(args, env)
  const repository = await resolveRepository(parsedRepository, ghExecFile)
  const summary = await fetchWorkflowRunSummary({
    execFile: ghExecFile,
    repository,
    runId,
    sleep,
  })

  if (!isFailedWorkflowConclusion(summary.conclusion)) {
    logDecision(log, { decision: 'dispatch', matchedRule: '' }, summary)
    log('Run conclusion is not failure, timed_out, or cancelled; no rerun requested.')
    return 2
  }

  const ctx = await buildWorkflowRunContext({
    conclusion: summary.conclusion,
    execFile: ghExecFile,
    repository,
    runAttempt: summary.runAttempt,
    runId,
    rules: RULES,
    sleep,
    workflowName: summary.workflowName,
  })
  const result = await decideRun(ctx, RULES)
  logDecision(log, result, {
    ...summary,
    failedJobNames: ctx.failedJobNames,
    ruleAttempt: ctx.ruleAttempt,
  })

  if (result.decision !== 'rerun') {
    log(`No rerun requested: decision is '${result.decision}', not 'rerun'.`)
    return 2
  }

  if (dryRun) {
    const target = result.rerunJobId === undefined ? runId : `--job ${result.rerunJobId}`
    log(`Dry run: would run gh run rerun --repo ${repository} ${target}`)
    return 0
  }

  const rerunArgs =
    result.rerunJobId === undefined
      ? ['run', 'rerun', '--repo', repository, runId]
      : ['run', 'rerun', '--repo', repository, '--job', String(result.rerunJobId)]
  await ghExecFile('gh', rerunArgs, {
    maxBuffer: LOG_MAX_BUFFER_BYTES,
  })
  log(
    result.rerunJobId === undefined
      ? `Requested rerun for run ${runId}.`
      : `Requested rerun for job ${result.rerunJobId}.`,
  )
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then(exitCode => {
      process.exitCode = exitCode
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
