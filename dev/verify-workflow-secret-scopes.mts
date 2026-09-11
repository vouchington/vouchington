import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

export interface DeploymentBranchRule {
  name: string
  type: string
}

export interface EnvironmentDeploymentBranchPolicy {
  protectedBranchesEnabled: boolean
  customBranchPoliciesEnabled: boolean
  deploymentBranchRules: DeploymentBranchRule[]
}

export function requiredEnvironmentNames(
  inventory: Record<string, SecretInventoryEntry>,
): Set<string> {
  return new Set(
    Object.values(inventory).flatMap(entry => {
      const names: string[] = []
      if (entry.requiredEnvironment !== undefined) names.push(entry.requiredEnvironment)
      if (entry.requiredBranchPolicy !== undefined) names.push(entry.requiredBranchPolicy)
      return names
    }),
  )
}

/** Names whose checked-in scope contract disagrees with the live secret metadata. Values never
 * leave GitHub: callers supply only names returned by `gh secret list`. */
export function requiredSecretScopeViolations(
  inventory: Record<string, SecretInventoryEntry>,
  repositoryNames: ReadonlySet<string>,
  environmentNames: ReadonlyMap<string, ReadonlySet<string>>,
  organizationNames: ReadonlySet<string>,
  environmentDeploymentBranchPolicies: ReadonlyMap<string, EnvironmentDeploymentBranchPolicy>,
): string[] {
  const violations: string[] = []
  for (const [name, entry] of Object.entries(inventory)) {
    if (entry.requiredEnvironment) {
      if (!environmentNames.get(entry.requiredEnvironment)?.has(name)) {
        violations.push(`${name} is missing from environment ${entry.requiredEnvironment}`)
      }
      if (repositoryNames.has(name)) {
        violations.push(`${name} must not exist as a repository secret`)
      }
      for (const [environment, names] of environmentNames) {
        if (environment !== entry.requiredEnvironment && names.has(name)) {
          violations.push(`${name} must not exist in environment ${environment}`)
        }
      }
      if (organizationNames.has(name)) {
        violations.push(`${name} must not exist as an organization secret`)
      }
      continue
    }
    if (entry.requiredBranchPolicy) {
      // Repo-scoped secret with a same-named Environment kept only for its branch-policy gate:
      // assert the secret itself lives solely as a repository secret, with no leftover copy in
      // any Environment or at organization scope (e.g. from before the secret was migrated out
      // of Environment scope, or a since-removed org-wide duplicate).
      if (entry.provisioned && !repositoryNames.has(name)) {
        violations.push(`${name} is missing from repository secrets`)
      }
      for (const [environment, names] of environmentNames) {
        if (names.has(name)) {
          violations.push(`${name} must not exist in environment ${environment}`)
        }
      }
      if (organizationNames.has(name)) {
        violations.push(`${name} must not exist as an organization secret`)
      }
    }
  }
  for (const environment of requiredEnvironmentNames(inventory)) {
    const policy = environmentDeploymentBranchPolicies.get(environment)
    if (
      policy?.protectedBranchesEnabled !== false ||
      policy.customBranchPoliciesEnabled !== true ||
      policy.deploymentBranchRules.length !== 1 ||
      policy.deploymentBranchRules[0]?.name !== 'main' ||
      policy.deploymentBranchRules[0]?.type !== 'branch'
    ) {
      violations.push(`environment ${environment} must permit deployments from only main`)
    }
  }
  return violations
}
