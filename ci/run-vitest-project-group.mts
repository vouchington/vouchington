import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dbBackedToolingProjectNames,
  localCoverageToolingProjectNames,
  toolingTestProjectNames,
} from '../test-helpers/vitest-config/tooling-project-registry.mts'

const dockerFreeBackendProjects = [
  'backend/data-stores/analytics',
  'backend/services/analytics',
  'backend-modules',
  'backend-no-data-mocks',
  'backend-test-helpers',
  'backend-email-templates',
] as const

const dockerBackedBackendProjects = [
  'backend/analytics-integration',
  'backend-data-stores',
  'backend-mocks',
  'backend-real-glide-mq',
] as const

const backendCoreProjects = [
  'ts-shared',
  ...dockerFreeBackendProjects,
  ...dockerBackedBackendProjects,
] as const

const SERIAL_VITEST_PROJECT = 'backend-activitypub-capacity'

export const VITEST_PROJECT_GROUPS = {
  backend: [
    ...backendCoreProjects,
    'backend-aws',
    'backend-bedrock',
    'backend-openai',
    'backend-stripe',
  ],
  'backend-default': backendCoreProjects,
  'backend-analytics': [
    'backend/data-stores/analytics',
    'backend/services/analytics',
    'backend/analytics-integration',
  ],
  'backend-core': backendCoreProjects,
  'backend-modules': dockerFreeBackendProjects,
  'backend-docker': dockerBackedBackendProjects,
  'backend-aws': ['backend-aws'],
  'backend-bedrock': ['backend-bedrock'],
  'backend-openai': ['backend-openai'],
  'backend-stripe': ['backend-stripe'],
  'backend-postgres-schema': ['backend-postgres-schema', 'backend-activitypub-capacity'],
  'email-templates': ['backend-email-templates'],
  'ts-shared': ['ts-shared'],
  tooling: toolingTestProjectNames,
  'web-api': ['web-api'],
  'web-integration': ['web-integration'],
  web: ['web'],
  'web-storybook': ['web-storybook', 'web-storybook-component-coverage'],
  lambdas: ['lambdas', 'lambdas-mocks', 'lambdas-portability'],
  'cloudflare-worker': [
    'cloudflare-worker',
    'cloudflare-worker-mocks',
    'cloudflare-worker-portability',
  ],
  portability: ['lambdas-portability', 'cloudflare-worker-portability'],
  'default-non-backend': [
    'web',
    'web-api',
    'web-integration',
    'lambdas',
    'lambdas-mocks',
    'lambdas-portability',
    'cloudflare-worker',
    'cloudflare-worker-mocks',
    'cloudflare-worker-portability',
  ],
  'local-coverage-web-storybook': ['web-storybook', 'web-storybook-component-coverage'],
  'local-coverage-backend-modules': dockerFreeBackendProjects,
  'local-coverage-tooling': localCoverageToolingProjectNames,
  'local-coverage-backend-data-stores': [
    'backend/analytics-integration',
    'backend-data-stores',
    'backend-postgres-schema',
    'backend-activitypub-capacity',
    'backend-mocks',
  ],
  'local-coverage-web-integration': ['web-integration', 'web-api'],
  'local-coverage-playwright-helpers': dbBackedToolingProjectNames,
} as const satisfies Record<string, readonly string[]>

export type VitestProjectGroup = keyof typeof VITEST_PROJECT_GROUPS

export function projectsForVitestGroup(group: VitestProjectGroup): readonly string[] {
  return VITEST_PROJECT_GROUPS[group]
}

export function normalizeForwardedVitestArgs(args: readonly string[]): string[] {
  return args[0] === '--' ? args.slice(1) : [...args]
}

function assertVitestProjectGroup(group: string): asserts group is VitestProjectGroup {
  if (!Object.hasOwn(VITEST_PROJECT_GROUPS, group)) {
    throw new Error(`Unknown Vitest project group: ${group}`)
  }
}

export function vitestProjectGroupCommand(
  group: string,
  forwardedArgs: readonly string[],
): { command: string; args: string[] } {
  assertVitestProjectGroup(group)
  return {
    command: './ci/with-node-test-options',
    args: [
      'vitest',
      'run',
      ...projectsForVitestGroup(group).flatMap(project => ['--project', project]),
      ...normalizeForwardedVitestArgs(forwardedArgs),
      ...(vitestProjectGroupRequiresSerialExecution(group) ? ['--no-file-parallelism'] : []),
    ],
  }
}

interface RunDependencies {
  env?: NodeJS.ProcessEnv
  spawn?: typeof spawn
}

export async function runVitestProjectGroup(
  group: string,
  forwardedArgs: readonly string[],
  dependencies: RunDependencies = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  assertVitestProjectGroup(group)
  const { command, args } = vitestProjectGroupCommand(group, forwardedArgs)
  const inheritedEnv = dependencies.env ?? process.env
  const env = vitestProjectGroupRequiresSerialExecution(group)
    ? { ...inheritedEnv, VITEST_MAX_WORKERS: '1' }
    : inheritedEnv
  const child = (dependencies.spawn ?? spawn)(command, args, {
    env,
    stdio: 'inherit',
  })

  return new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolveResult({ code, signal }))
  })
}

function vitestProjectGroupRequiresSerialExecution(group: VitestProjectGroup): boolean {
  return projectsForVitestGroup(group).some(project => project === SERIAL_VITEST_PROJECT)
}

interface ChildCompletionDependencies {
  kill?: (pid: number, signal: NodeJS.Signals) => boolean
  pid?: number
  setExitCode?: (code: number) => void
}

export function propagateVitestChildCompletion(
  result: { code: number | null; signal: NodeJS.Signals | null },
  dependencies: ChildCompletionDependencies = {},
): void {
  if (result.signal !== null) {
    // eslint-disable-next-line no-restricted-properties -- preserve the child signal at this process boundary
    ;(dependencies.kill ?? process.kill)(dependencies.pid ?? process.pid, result.signal)
    return
  }
  ;(dependencies.setExitCode ?? (code => (process.exitCode = code)))(result.code ?? 1)
}

async function main(): Promise<void> {
  const [group, ...forwardedArgs] = process.argv.slice(2)
  if (group === undefined) {
    throw new Error('Usage: node ci/run-vitest-project-group.mts <group> [--] [vitest args...]')
  }
  const result = await runVitestProjectGroup(group, forwardedArgs)
  propagateVitestChildCompletion(result)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
