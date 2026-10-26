import { checkTransientRetryPolicy } from './check-transient-retry-policy.mts'
import { checkAgentWorkflowDocs } from './check-agent-workflow-doc-policy.mts'
import { checkKnipDependencyPolicy } from './check-knip-dependency-policy.mts'
import { checkPostgresOrderingPolicy } from './check-postgres-ordering-policy.mts'
import { checkReactHookSuppressions } from './check-react-hook-suppressions.mts'

/** Run live repository policies once in the dedicated static CI job. */
export async function checkRepositoryPolicyScans(root: string): Promise<void> {
  checkKnipDependencyPolicy(root)
  checkPostgresOrderingPolicy(root)

  const violations = [
    ...(await checkTransientRetryPolicy(root)),
    ...checkAgentWorkflowDocs(root),
    ...checkReactHookSuppressions(root),
  ]
  if (violations.length > 0) {
    throw new Error(violations.join('\n'))
  }
}

if (import.meta.main) await checkRepositoryPolicyScans(process.cwd())
