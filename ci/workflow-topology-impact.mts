import type { CiTopologyImpactOptions, CiTopologyImpactReport } from 'no-mistakes'

import {
  CI_WORKFLOW_PATH,
  type CiTopologyImpactRoutingOptions,
} from './workflow-topology-impact-contract.mts'
import {
  isTopologyPath,
  topologyResultFailure,
  validateTopologyResult,
} from './workflow-topology-impact-validation.mts'

export { isTopologyPath } from './workflow-topology-impact-validation.mts'
export {
  CI_WORKFLOW_PATH,
  type CiTopologyImpactRoutingOptions,
} from './workflow-topology-impact-contract.mts'

// no-mistakes reports every ci.yml root, including prerequisite and aggregate jobs. Only the
// selectable subset has selector outputs; validate against the complete graph first.
export const CI_ROOT_JOB_NAMES = [
  'detect-changes',
  'static-code-analysis',
  'static-backend',
  'static-web',
  'static-lambdas',
  'static-cloudflare-worker',
  'initialize-smoke-test',
  'select-ci',
  'test-ts-shared',
  'test-tooling',
  'test-backend-modules',
  'test-backend-unit',
  'backend-smoke',
  'test-backend-credentialed',
  'test-postgres-schema',
  'test-web',
  'test-web-api',
  'storybook',
  'test-web-integration',
  'test-playwright',
  'test-playwright-credentialed',
  'test-cloudflare-worker',
  'test-lambdas',
  'test-explain-analyze',
  'test-portability',
  'build-backend',
  'build-web',
  'test-coverage',
  'upload-codecov',
  'tests-processing',
  'tests',
  'build',
] as const

export const CI_ROOT_JOB_IDS = new Set(CI_ROOT_JOB_NAMES.map(job => `${CI_WORKFLOW_PATH}#${job}`))

export const TOPOLOGY_ROOT_JOB_NAMES = [
  'static-code-analysis',
  'static-backend',
  'static-web',
  'static-lambdas',
  'static-cloudflare-worker',
  'initialize-smoke-test',
  'test-ts-shared',
  'test-tooling',
  'test-backend-modules',
  'test-backend-unit',
  'backend-smoke',
  'test-backend-credentialed',
  'test-postgres-schema',
  'test-web',
  'test-web-api',
  'storybook',
  'test-web-integration',
  'test-playwright',
  'test-playwright-credentialed',
  'test-cloudflare-worker',
  'test-lambdas',
  'test-explain-analyze',
  'test-portability',
  'build-backend',
  'build-web',
] as const
export const TOPOLOGY_ROOT_JOB_IDS = new Set(
  TOPOLOGY_ROOT_JOB_NAMES.map(job => `${CI_WORKFLOW_PATH}#${job}`),
)

export type CiTopologyImpactRouting = {
  affectedRootJobIds: Set<string>
  globalFallback: boolean
  topologyChanged: boolean
  reason?: string
}

function fallback(
  options: CiTopologyImpactRoutingOptions,
  reason: string,
): CiTopologyImpactRouting {
  return {
    affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
    globalFallback: true,
    reason,
    topologyChanged: options.changedPaths.some(isTopologyPath),
  }
}

export function routeCiTopologyImpact(
  impact: unknown,
  options: CiTopologyImpactRoutingOptions,
): CiTopologyImpactRouting {
  if (options.changedPaths.includes(CI_WORKFLOW_PATH)) {
    return fallback(options, 'root ci workflow changed')
  }
  const validation = validateTopologyResult(impact, options)
  if (!validation.ok) return fallback(options, validation.reason)
  if (validation.report.globalFallback)
    return fallback(options, 'topology impact requested global fallback')
  const affectedRootJobIds = new Set(validation.report.affectedRootJobIds)
  for (const diagnostic of validation.report.diagnostics) {
    if (diagnostic.scope !== 'localized') continue
    for (const rootJobId of diagnostic.rootJobIds ?? []) affectedRootJobIds.add(rootJobId)
  }
  return {
    affectedRootJobIds,
    globalFallback: false,
    topologyChanged: options.changedPaths.some(isTopologyPath),
  }
}

export async function loadCiTopologyImpactRouting(
  provider: (input: CiTopologyImpactOptions) => Promise<CiTopologyImpactReport>,
  options: CiTopologyImpactRoutingOptions,
): Promise<CiTopologyImpactRouting> {
  try {
    return routeCiTopologyImpact(await provider(options.input), options)
  } catch (error) {
    return fallback(options, topologyResultFailure(error))
  }
}

export function topologyOutputName(rootJobId: string): string {
  return `run-${rootJobId.slice(`${CI_WORKFLOW_PATH}#`.length)}`
}
