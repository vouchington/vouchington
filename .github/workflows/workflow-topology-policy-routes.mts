import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
import { splitIds } from './workflow-topology-policy-builders.mts'
import { exactCallerJobs } from './workflow-topology-policy-callers.mts'
import { requiredArtifactEdges } from './workflow-topology-policy-artifacts.mts'
import { reviewFanIns } from './workflow-topology-policy-review.mts'
const edge = (from: string, to: string): readonly [string, string] => [from, to]
const mainBackendJob = (job: string): string => `.github/workflows/main-backend.yml#${job}`
const mainWebJob = (job: string): string => `.github/workflows/main-web.yml#${job}`
export const routePolicy = {
  requiredArtifactEdges,
  requiredJobs: [
    'static',
    'backend',
    'web',
    'cloudflare-worker',
    'lambdas',
    'tooling',
    'gitleaks',
  ].map(area => `.github/workflows/${area}.yml#${area}`),
  forbiddenJobs: [],
  requiredDirectEdges: [
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
    edge(
      '.github/workflows/main-storybook.yml#storybook-build',
      '.github/workflows/main-storybook.yml#publish-storybook',
    ),
  ],
  forbiddenDirectEdges: [],
  requiredTransitiveEdges: [],
  forbiddenTransitiveEdges: [],
  exactFanIns: {
    ...reviewFanIns,
    '.github/workflows/main-storybook.yml#publish-storybook': splitIds(
      '.github/workflows/main-storybook.yml#storybook-build',
    ),
  },
  exactCallerJobs,
  stepOrders: [],
} satisfies Omit<WorkflowTopologyPolicy, 'jobInventory' | 'unlockedWorkflowReasons'>
