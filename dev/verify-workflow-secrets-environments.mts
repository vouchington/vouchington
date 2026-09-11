import pSettle from 'p-settle'

import type { EnvironmentDeploymentBranchPolicy } from './verify-workflow-secret-scopes.mts'
import type { VerifyWorkflowSecretsDependencies } from './verify-workflow-secrets.mts'

const DEPLOYMENT_BRANCH_POLICY_QUERY_CONCURRENCY = 5

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function collectRequiredEnvironmentDeploymentBranchPolicies(
  repo: string,
  environments: ReadonlySet<string>,
  dependencies: VerifyWorkflowSecretsDependencies,
): Promise<{
  policies: Map<string, EnvironmentDeploymentBranchPolicy>
  warnings: string[]
}> {
  const names = [...environments]
  const results = await pSettle(names, {
    concurrency: DEPLOYMENT_BRANCH_POLICY_QUERY_CONCURRENCY,
    mapper: environment => dependencies.getEnvironmentDeploymentBranchPolicy(repo, environment),
  })
  const policies = new Map<string, EnvironmentDeploymentBranchPolicy>()
  const warnings: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      policies.set(names[index]!, result.value)
      return
    }
    warnings.push(
      `Could not list deployment branch policy for environment "${names[index]}": ${errorMessage(result.reason)}`,
    )
  })
  return { policies, warnings }
}
