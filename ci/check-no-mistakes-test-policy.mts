import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = '.github/workflows/static-code-analysis.yml'
const routeSelectorTestPath = 'static-code-analysis/i18n-extract/route-selector-map.test.mts'

const expectedWorkflowCommands = [
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
  },
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'node ci/check-no-mistakes-test-policy.mts',
  },
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'node ci/check-live-workflow-topology.mts',
  },
]

type Workflow = {
  jobs?: Record<string, { steps?: Array<{ run?: unknown }> }>
}

type WorkflowCommand = (typeof expectedWorkflowCommands)[number]

export type NoMistakesTestPolicyInput = {
  root: string
  testPaths: string[]
  workflowPaths: string[]
}

class PolicyInputError extends Error {
  readonly code: 'READ_FAILED' | 'INVALID_YAML'
  readonly path: string

  constructor(code: 'READ_FAILED' | 'INVALID_YAML', path: string, cause: unknown) {
    super(`${code}: ${path}`, { cause })
    this.name = 'PolicyInputError'
    this.code = code
    this.path = path
  }
}

function readRepoFile(root: string, path: string): string {
  try {
    return readFileSync(`${root}/${path}`, 'utf8')
  } catch (err) {
    throw new PolicyInputError('READ_FAILED', path, err)
  }
}

export function relevantWorkflowCommands(root: string, paths: string[]): WorkflowCommand[] {
  return paths.toSorted().flatMap(path => {
    const source = readRepoFile(root, path)
    let workflow: Workflow
    try {
      workflow = parseYaml(source) as Workflow
    } catch (err) {
      throw new PolicyInputError('INVALID_YAML', path, err)
    }
    return Object.entries(workflow.jobs ?? {}).flatMap(([job, definition]) =>
      (definition.steps ?? []).flatMap(step =>
        (typeof step.run === 'string' ? step.run.split('\n') : []).flatMap(line => {
          const command = line.trim()
          return /^(?:pnpm (?:run|exec) no-mistakes\b|node ci\/(?:check-no-mistakes-test-policy|check-live-workflow-topology)\.mts(?:\s|$))/u.test(
            command,
          )
            ? [{ path, job, command }]
            : []
        }),
      ),
    )
  })
}

export function spawnsNoMistakesCli(source: string): boolean {
  return (
    /join\([^)]*['"]node_modules\/\.bin\/no-mistakes['"]/u.test(source) ||
    /\b(?:spawnSync|execFileSync|execFile)\(\s*(?:noMistakes(?:Binary)?|NO_MISTAKES_BIN|['"]no-mistakes['"])/u.test(
      source,
    ) ||
    /\b(?:spawnSync|execFileSync|execFile)\(\s*['"]pnpm(?:\.cmd)?['"][\s\S]{0,300}['"]no-mistakes['"]/u.test(
      source,
    )
  )
}

export function checkNoMistakesTestPolicy({
  root,
  testPaths,
  workflowPaths,
}: NoMistakesTestPolicyInput): string[] {
  const errors: string[] = []
  const commands = relevantWorkflowCommands(root, workflowPaths)
  if (JSON.stringify(commands) !== JSON.stringify(expectedWorkflowCommands)) {
    errors.push(
      `Live no-mistakes workflow commands differ from the sole ordered static-analysis job contract: ${JSON.stringify(commands)}`,
    )
  }

  if (/\bcomputeRouteAliasMap\b/u.test(readRepoFile(root, routeSelectorTestPath))) {
    errors.push(`${routeSelectorTestPath} must not call the live route-selector graph`)
  }

  // Live analysis and loadRepoTopology() calls are `forbidden-calls` rules in .no-mistakes.yml.
  for (const path of testPaths.toSorted()) {
    if (spawnsNoMistakesCli(readRepoFile(root, path))) {
      errors.push(`${path}: no-mistakes CLI from Vitest`)
    }
  }
  return errors
}

/* v8 ignore start -- the static-analysis job runs this real-repository CLI; fixture tests cover the policy core. */
function trackedPaths(root: string): string[] {
  return execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\0')
    .filter(path => path.length > 0 && existsSync(`${root}/${path}`))
    .toSorted()
}

if (import.meta.main) {
  const paths = trackedPaths(repoRoot)
  const errors = checkNoMistakesTestPolicy({
    root: repoRoot,
    testPaths: paths.filter(path => /\.(?:mock\.)?test\.[cm]?[jt]sx?$/u.test(path)),
    workflowPaths: paths.filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path)),
  })
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
  else console.log('No live no-mistakes workflow drift or Vitest CLI spawns found.')
}
/* v8 ignore stop */
