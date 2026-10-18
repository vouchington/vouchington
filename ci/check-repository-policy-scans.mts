import { checkAgentWorkflowDocs } from './check-agent-workflow-doc-policy.mts'
import { checkKnipDependencyPolicy } from './check-knip-dependency-policy.mts'
import { checkPostgresOrderingPolicy } from './check-postgres-ordering-policy.mts'
import { checkReactHookSuppressions } from './check-react-hook-suppressions.mts'

/** Run the four live tracked-source policies once in the dedicated static CI job. */
export function checkRepositoryPolicyScans(root: string): void {
  checkKnipDependencyPolicy(root)
  checkPostgresOrderingPolicy(root)

  const violations = [...checkAgentWorkflowDocs(root), ...checkReactHookSuppressions(root)]
  if (violations.length > 0) {
    throw new Error(violations.join('\n'))
  }
}

if (import.meta.main) checkRepositoryPolicyScans(process.cwd())
