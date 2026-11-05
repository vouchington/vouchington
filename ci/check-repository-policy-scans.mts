import { checkWorkflowSafetyPolicy } from './check-workflow-safety-policy.mts'
import { checkTransientRetryPolicy } from './check-transient-retry-policy.mts'
import { checkAgentWorkflowDocs } from './check-agent-workflow-doc-policy.mts'
import { checkKnipDependencyPolicy } from './check-knip-dependency-policy.mts'
import { checkPostgresOrderingPolicy } from './check-postgres-ordering-policy.mts'
import { checkPrShepherdGuidance } from './check-pr-shepherd-guidance.mts'
import { checkThinRouteCoverage } from './check-thin-route-coverage.mts'
import { checkWorkerSecretExemptPaths } from './check-worker-secret-exempt-paths.mts'
import { checkWorkflowArtifactPolicy } from './check-workflow-artifact-policy.mts'
import { checkBuildWebTargetsContractPolicy } from './check-build-web-targets-contract-policy.mts'
import { checkScheduledPromptIndexPolicy } from './check-scheduled-prompt-index-policy.mts'

/** Run live repository policies once in the dedicated static CI job. */
export async function checkRepositoryPolicyScans(root: string): Promise<void> {
  checkKnipDependencyPolicy(root)
  checkWorkflowArtifactPolicy(root)
  await checkPostgresOrderingPolicy(root)

  const violations = [
    ...checkWorkflowSafetyPolicy(root),
    ...(await checkTransientRetryPolicy(root)),
    ...checkAgentWorkflowDocs(root),
    ...checkPrShepherdGuidance(root),
    ...checkThinRouteCoverage(root),
    ...checkWorkerSecretExemptPaths(root),
    ...checkBuildWebTargetsContractPolicy(root),
    ...checkScheduledPromptIndexPolicy(root),
  ]
  if (violations.length > 0) {
    throw new Error(violations.join('\n'))
  }
}

if (import.meta.main) await checkRepositoryPolicyScans(process.cwd())
