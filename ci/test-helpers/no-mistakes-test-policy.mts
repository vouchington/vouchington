import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'

const workflowPath = '.github/workflows/static-code-analysis.yml'
const routeSelectorTestPath = 'static-code-analysis/i18n-extract/route-selector-map.test.mts'
const mockedAnalysisTestPath = 'static-code-analysis/i18n-extract/route-selector-map.mock.test.mts'
const noMistakesConfigPath = '.no-mistakes.yml'
const liveAnalysisGuardName = 'Vitest tests do not run live no-mistakes analysis'
const allowedAnalyzerTestPaths = [mockedAnalysisTestPath]

const expectedWorkflowCommands = [
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check',
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
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'node ci/check-storybook-browser-optimize-deps.mts',
  },
  {
    path: workflowPath,
    job: 'no-mistakes',
    command: 'node ci/check-classifier-golden-imports.mts',
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
  reviewedMockTestDigest: string
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
          return /^(?:pnpm (?:run|exec) no-mistakes\b|node ci\/(?:check-no-mistakes-test-policy|check-live-workflow-topology|check-storybook-browser-optimize-deps|check-classifier-golden-imports)\.mts(?:\s|$))/u.test(
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
  reviewedMockTestDigest,
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

  const config = parseYaml(readRepoFile(root, noMistakesConfigPath)) as {
    rules?: Array<{ exclude?: string[]; name?: string }>
  }
  const liveAnalysisRules = config.rules?.filter(rule => rule.name === liveAnalysisGuardName) ?? []
  if (
    liveAnalysisRules.length !== 1 ||
    JSON.stringify(liveAnalysisRules[0]?.exclude) !== JSON.stringify(allowedAnalyzerTestPaths)
  ) {
    errors.push(
      `${noMistakesConfigPath} must list only the reviewed mocked test exception for ${liveAnalysisGuardName}`,
    )
  }
  if (!testPaths.includes(mockedAnalysisTestPath)) {
    errors.push(`${mockedAnalysisTestPath} must remain a tracked Vitest test`)
  } else {
    const mockedAnalysisSource = readRepoFile(root, mockedAnalysisTestPath)
    if (
      createHash('sha256').update(mockedAnalysisSource, 'utf8').digest('hex') !==
      reviewedMockTestDigest
    ) {
      errors.push(`${mockedAnalysisTestPath} no longer proves that the analyzer call is mocked`)
    }
  }
  // Live analysis and loadRepoTopology() calls are `forbidden-calls` rules in .no-mistakes.yml.
  for (const path of testPaths.toSorted()) {
    if (spawnsNoMistakesCli(readRepoFile(root, path))) {
      errors.push(`${path}: no-mistakes CLI from Vitest`)
    }
  }
  return errors
}
