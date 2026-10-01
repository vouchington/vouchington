import type { WorkflowTopologyPolicy } from './workflow-topology-policy-types.mts'
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
    edge(mainBackendJob('detect-image-publication'), mainBackendJob('backend-deploy-intent')),
    edge(mainBackendJob('detect-image-publication'), mainBackendJob('publish-backend-images')),
    edge(mainWebJob('detect-image-publication'), mainWebJob('web-deploy-intent')),
    edge(mainWebJob('detect-image-publication'), mainWebJob('publish-web-images')),
  ],
  forbiddenDirectEdges: [],
  requiredTransitiveEdges: [],
  forbiddenTransitiveEdges: [],
  exactFanIns: {
    ...reviewFanIns,
  },
  exactCallerJobs,
  stepOrders: [],
} satisfies Omit<WorkflowTopologyPolicy, 'jobInventory' | 'unlockedWorkflowReasons'>
