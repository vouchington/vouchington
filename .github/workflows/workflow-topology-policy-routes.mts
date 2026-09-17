import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
import { splitIds } from './workflow-topology-policy-builders.mts'
import { exactCallerJobs } from './workflow-topology-policy-callers.mts'
import { requiredArtifactEdges } from './workflow-topology-policy-artifacts.mts'
import { reviewFanIns } from './workflow-topology-policy-review.mts'
const edge = (from: string, to: string): readonly [string, string] => [from, to]
const ciJob = (job: string): string => `.github/workflows/ci.yml#${job}`
const mainBackendJob = (job: string): string => `.github/workflows/main-backend.yml#${job}`
const mainWebJob = (job: string): string => `.github/workflows/main-web.yml#${job}`
const unrelatedPrTests = ['test-tooling', 'test-portability', 'storybook'] as const
const applicationPrTests = [
  'test-ts-shared',
  'test-backend-modules',
  'test-backend-unit',
  'backend-smoke',
  'test-backend-credentialed',
  'test-postgres-schema',
  'test-web',
  'test-web-api',
  'test-web-integration',
  'test-lambdas',
  'test-cloudflare-worker',
  'test-playwright',
  'test-playwright-credentialed',
] as const
export const routePolicy = {
  requiredArtifactEdges,
  requiredJobs: [
    '.github/workflows/ci.yml#test-coverage',
    '.github/workflows/ci.yml#tests',
    '.github/workflows/ci.yml#build',
  ],
  forbiddenJobs: [],
  requiredDirectEdges: [
    edge('.github/workflows/ci.yml#tests', '.github/workflows/ci.yml#build'),
    ...['static-backend', 'static-web', 'static-lambdas', 'static-cloudflare-worker'].map(job =>
      edge(ciJob('static-code-analysis'), ciJob(job)),
    ),
    ...['test-backend-modules', 'test-backend-unit', 'test-backend-credentialed'].map(job =>
      edge(ciJob('test-ts-shared'), ciJob(job)),
    ),
    ...[
      'test-backend-modules',
      'test-backend-unit',
      'backend-smoke',
      'test-backend-credentialed',
      'test-postgres-schema',
      'test-explain-analyze',
    ].map(job => edge(ciJob('static-backend'), ciJob(job))),
    ...[
      'test-web',
      'test-web-api',
      'test-web-integration',
      'test-playwright',
      'test-playwright-credentialed',
    ].map(job => edge(ciJob('static-web'), ciJob(job))),
    ...['test-lambdas', 'test-playwright', 'test-playwright-credentialed'].map(job =>
      edge(ciJob('static-lambdas'), ciJob(job)),
    ),
    ...['test-cloudflare-worker', 'test-playwright', 'test-playwright-credentialed'].map(job =>
      edge(ciJob('static-cloudflare-worker'), ciJob(job)),
    ),
    edge(ciJob('test-web'), ciJob('test-web-api')),
    edge(ciJob('test-web'), ciJob('test-web-integration')),
    ...[
      'test-ts-shared',
      'test-backend-modules',
      'test-backend-unit',
      'test-postgres-schema',
      'test-web',
      'test-web-api',
      'test-web-integration',
      'test-lambdas',
      'test-cloudflare-worker',
    ].flatMap(job => [
      edge(ciJob(job), ciJob('test-playwright')),
      edge(ciJob(job), ciJob('test-playwright-credentialed')),
    ]),
    edge(ciJob('test-backend-credentialed'), ciJob('test-playwright-credentialed')),
    ...[
      'test-backend-modules',
      'test-backend-unit',
      'backend-smoke',
      'test-backend-credentialed',
      'postgres-schema-tests',
    ].map(job => edge(mainBackendJob('static-checks'), mainBackendJob(job))),
    edge(mainWebJob('static-checks'), mainWebJob('test-web')),
    edge(mainWebJob('static-checks'), mainWebJob('test-web-api')),
    edge(mainWebJob('static-checks'), mainWebJob('test-web-integration')),
    edge(mainWebJob('static-checks'), mainWebJob('playwright-tests')),
    edge(mainWebJob('static-checks'), mainWebJob('playwright-credentialed-tests')),
    edge(mainWebJob('test-web'), mainWebJob('cleanup-artifacts')),
    edge(mainWebJob('test-web-api'), mainWebJob('cleanup-artifacts')),
    edge(mainWebJob('test-web-integration'), mainWebJob('cleanup-artifacts')),
    edge(
      '.github/workflows/main-lambdas.yml#static-checks',
      '.github/workflows/main-lambdas.yml#lambdas-tests',
    ),
    edge(
      '.github/workflows/main-cloudflare-worker.yml#static-checks',
      '.github/workflows/main-cloudflare-worker.yml#cloudflare-worker-tests',
    ),
  ],
  forbiddenDirectEdges: [
    edge('.github/workflows/ci.yml#detect-changes', '.github/workflows/ci.yml#build'),
    ...unrelatedPrTests.flatMap(job => [
      edge(ciJob(job), ciJob('test-playwright')),
      edge(ciJob(job), ciJob('test-playwright-credentialed')),
    ]),
    edge(ciJob('test-playwright'), ciJob('test-playwright-credentialed')),
    edge(ciJob('test-playwright-credentialed'), ciJob('test-playwright')),
    edge(ciJob('test-web-api'), ciJob('test-web-integration')),
    edge(ciJob('test-web-integration'), ciJob('test-web-api')),
  ],
  requiredTransitiveEdges: [],
  forbiddenTransitiveEdges: unrelatedPrTests.flatMap(unrelated =>
    applicationPrTests.map(application => edge(ciJob(unrelated), ciJob(application))),
  ),
  exactFanIns: {
    ...reviewFanIns,
    '.github/workflows/ci.yml#detect-changes': [],
    '.github/workflows/ci.yml#test-coverage': splitIds(
      '.github/workflows/ci.yml#detect-changes .github/workflows/ci.yml#select-ci .github/workflows/ci.yml#storybook .github/workflows/ci.yml#test-backend-credentialed .github/workflows/ci.yml#test-backend-modules .github/workflows/ci.yml#test-backend-unit .github/workflows/ci.yml#test-cloudflare-worker .github/workflows/ci.yml#test-lambdas .github/workflows/ci.yml#test-portability .github/workflows/ci.yml#test-tooling .github/workflows/ci.yml#test-ts-shared .github/workflows/ci.yml#test-web .github/workflows/ci.yml#test-web-api .github/workflows/ci.yml#test-web-integration',
    ),
    '.github/workflows/ci.yml#tests': splitIds('.github/workflows/ci.yml#tests-processing'),
    '.github/workflows/ci.yml#tests-processing': splitIds(
      '.github/workflows/ci.yml#backend-smoke .github/workflows/ci.yml#detect-changes .github/workflows/ci.yml#initialize-smoke-test .github/workflows/ci.yml#static-backend .github/workflows/ci.yml#static-cloudflare-worker .github/workflows/ci.yml#static-code-analysis .github/workflows/ci.yml#static-lambdas .github/workflows/ci.yml#static-web .github/workflows/ci.yml#storybook .github/workflows/ci.yml#test-coverage .github/workflows/ci.yml#test-explain-analyze .github/workflows/ci.yml#test-playwright .github/workflows/ci.yml#test-playwright-credentialed .github/workflows/ci.yml#test-portability .github/workflows/ci.yml#test-postgres-schema .github/workflows/ci.yml#test-web-api .github/workflows/ci.yml#test-web-integration',
    ),
    '.github/workflows/ci.yml#build': splitIds(
      '.github/workflows/ci.yml#build-backend .github/workflows/ci.yml#build-web .github/workflows/ci.yml#tests',
    ),
  },
  exactCallerJobs,
  stepOrders: [],
  targetedReruns: {
    'backend-unit-vitest-worker-exit-after-pass': {
      innerTargetJob: '.github/workflows/tests-backend-unit.yml#backend-tests',
      rerunTargetJobNameFamily: 'test-backend-unit / backend-tests (',
      innerDownstreamJobs: [],
      outerCallers: {
        '.github/workflows/ci.yml#test-backend-unit': splitIds(
          '.github/workflows/ci.yml#build .github/workflows/ci.yml#build-backend .github/workflows/ci.yml#build-web .github/workflows/ci.yml#test-coverage .github/workflows/ci.yml#test-playwright .github/workflows/ci.yml#test-playwright-credentialed .github/workflows/ci.yml#tests .github/workflows/ci.yml#tests-processing',
        ),
        '.github/workflows/main-backend.yml#test-backend-unit': [],
      },
    },
  },
} satisfies Omit<WorkflowTopologyPolicy, 'jobInventory' | 'unlockedWorkflowReasons'>
