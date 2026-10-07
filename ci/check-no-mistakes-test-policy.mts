import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { symbols } from 'no-mistakes'
import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = '.github/workflows/static-code-analysis.yml'
const routeSelectorTestPath = 'static-code-analysis/i18n-extract/route-selector-map.test.mts'

const liveAnalysisImports = new Set([
  'analyzeProject',
  'check',
  'ciTopology',
  'ciTopologyImpact',
  'resolveCheck',
  'testsPlan',
  'validateMermaidMarkdown',
])

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

export async function liveAnalysisImportNames(
  root: string,
  files: string[],
): Promise<Map<string, string[]>> {
  if (files.length === 0) return new Map()
  const result = await symbols({
    root,
    files,
    include: 'imports',
    timeout: 30,
    lockTimeout: 10,
    jobs: 1,
  })
  return new Map(
    result.files.map(file => [
      file.path,
      (file.imports ?? []).flatMap(binding =>
        binding.source === 'no-mistakes' &&
        !binding.typeOnly &&
        liveAnalysisImports.has(binding.imported)
          ? [binding.imported]
          : [],
      ),
    ]),
  )
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

export async function checkNoMistakesTestPolicy({
  root,
  testPaths,
  workflowPaths,
}: NoMistakesTestPolicyInput): Promise<string[]> {
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

  const policySubjects = testPaths.toSorted()
  const sources = new Map(policySubjects.map(path => [path, readRepoFile(root, path)]))
  const imports = await liveAnalysisImportNames(
    root,
    policySubjects.filter(
      path => !/\.mock\.test\./u.test(path) && sources.get(path)?.includes('no-mistakes'),
    ),
  )
  for (const [path, source] of sources) {
    if (spawnsNoMistakesCli(source)) errors.push(`${path}: no-mistakes CLI from Vitest`)
    if (!/\.mock\.test\./u.test(path)) {
      for (const name of imports.get(path) ?? []) {
        errors.push(`${path}: live no-mistakes import ${name}`)
      }
    }
    if (/await loadRepoTopology\(\)/u.test(source)) {
      errors.push(`${path}: live loadRepoTopology() from Vitest`)
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
  const errors = await checkNoMistakesTestPolicy({
    root: repoRoot,
    testPaths: paths.filter(path => /\.(?:mock\.)?test\.[cm]?[jt]sx?$/u.test(path)),
    workflowPaths: paths.filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path)),
  })
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
  else console.log('No Vitest live no-mistakes or topology invocations found.')
}
/* v8 ignore stop */
