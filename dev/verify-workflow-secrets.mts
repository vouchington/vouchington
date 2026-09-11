#!/usr/bin/env node
/** Trusted/local inventory check. It reads only secret names and presence, never values. */
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import pSettle from 'p-settle'

import {
  SECRET_INVENTORY,
  type SecretInventoryEntry,
} from '../.github/workflows/workflow-secrets-inventory.mts'
import {
  diffAgainstInventory,
  formatDrift,
  missingConfirmedSecrets,
  unconfirmedNewlyProvisioned,
} from './verify-workflow-secrets-drift.mts'
import { collectRequiredEnvironmentDeploymentBranchPolicies } from './verify-workflow-secrets-environments.mts'
import { defaultDependencies } from './verify-workflow-secrets-gh.mts'
import {
  requiredEnvironmentNames,
  requiredSecretScopeViolations,
  type EnvironmentDeploymentBranchPolicy,
} from './verify-workflow-secret-scopes.mts'

export interface VerifyWorkflowSecretsDependencies {
  resolveRepo: () => Promise<string>
  listRepoSecretNames: (repo: string) => Promise<string[]>
  listRepositoryOwnerType: (repo: string) => Promise<string>
  listRepositoryOrganizationSecretNames: (repo: string) => Promise<string[]>
  listEnvironmentNames: (repo: string) => Promise<string[]>
  listEnvironmentSecretNames: (repo: string, environment: string) => Promise<string[]>
  getEnvironmentDeploymentBranchPolicy: (
    repo: string,
    environment: string,
  ) => Promise<EnvironmentDeploymentBranchPolicy>
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const ENVIRONMENT_SECRET_QUERY_CONCURRENCY = 5

export interface LiveSecretNames {
  names: Set<string>
  repositoryNames: Set<string>
  organizationNames: Set<string>
  environmentNames: Map<string, Set<string>>
  environmentDeploymentBranchPolicies: Map<string, EnvironmentDeploymentBranchPolicy>
  warnings: string[]
}

export async function collectLiveSecretNames(
  repo: string,
  dependencies: VerifyWorkflowSecretsDependencies,
  requiredPolicyEnvironments: ReadonlySet<string>,
): Promise<LiveSecretNames> {
  const repositoryNames = new Set(await dependencies.listRepoSecretNames(repo))
  const names = new Set(repositoryNames)
  const organizationNames = new Set<string>()
  const environmentNames = new Map<string, Set<string>>()
  const warnings: string[] = []
  try {
    const ownerType = await dependencies.listRepositoryOwnerType(repo)
    if (ownerType !== 'Organization' && ownerType !== 'User') {
      throw new Error(`unexpected repository owner type: ${ownerType}`)
    }
    if (ownerType === 'Organization') {
      const scopedNames = new Set(await dependencies.listRepositoryOrganizationSecretNames(repo))
      for (const name of scopedNames) names.add(name)
      for (const name of scopedNames) organizationNames.add(name)
    }
  } catch (error) {
    warnings.push(`Could not list organization secrets for ${repo}: ${errorMessage(error)}`)
  }
  let environments: string[] = []
  try {
    environments = await dependencies.listEnvironmentNames(repo)
  } catch (error) {
    warnings.push(`Could not list deployment environments for ${repo}: ${errorMessage(error)}`)
  }
  const results = await pSettle(environments, {
    concurrency: ENVIRONMENT_SECRET_QUERY_CONCURRENCY,
    mapper: environment => dependencies.listEnvironmentSecretNames(repo, environment),
  })
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const scopedNames = new Set(result.value)
      environmentNames.set(environments[index]!, scopedNames)
      for (const name of scopedNames) names.add(name)
      return
    }
    warnings.push(
      `Could not list secrets for environment "${environments[index]}": ${errorMessage(result.reason)}`,
    )
  })
  const { policies: environmentDeploymentBranchPolicies, warnings: policyWarnings } =
    await collectRequiredEnvironmentDeploymentBranchPolicies(
      repo,
      requiredPolicyEnvironments,
      dependencies,
    )
  warnings.push(...policyWarnings)
  return {
    names,
    repositoryNames,
    organizationNames,
    environmentNames,
    environmentDeploymentBranchPolicies,
    warnings,
  }
}

export { defaultDependencies }
function parseConfirmNames(raw: string | undefined): string[] {
  if (raw === undefined) return []
  return raw
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0)
}

export async function runVerifyWorkflowSecretsCli(
  argv: string[],
  dependencies: VerifyWorkflowSecretsDependencies = defaultDependencies,
  output: Pick<Console, 'error' | 'log'> = console,
  inventory: Record<string, SecretInventoryEntry> = SECRET_INVENTORY,
): Promise<number> {
  let repoOverride: string | undefined
  let confirmNames: string[]
  try {
    const { values } = parseArgs({
      args: argv,
      options: { repo: { type: 'string' }, confirm: { type: 'string' } },
      strict: true,
    })
    repoOverride = values.repo
    confirmNames = parseConfirmNames(values.confirm)
  } catch (error) {
    output.error(
      'Usage: node dev/verify-workflow-secrets.mts [--repo <owner/repo>] ' +
        `[--confirm <name1,name2,...>]\n${errorMessage(error)}`,
    )
    return 2
  }

  try {
    const repo = repoOverride ?? (await dependencies.resolveRepo())
    const requiredPolicyEnvironments = requiredEnvironmentNames(inventory)
    const {
      names,
      repositoryNames,
      organizationNames,
      environmentNames,
      environmentDeploymentBranchPolicies,
      warnings,
    } = await collectLiveSecretNames(repo, dependencies, requiredPolicyEnvironments)
    const drift = diffAgainstInventory(inventory, names, warnings)
    output.log(formatDrift(drift))
    const scopeViolations = requiredSecretScopeViolations(
      inventory,
      repositoryNames,
      environmentNames,
      organizationNames,
      environmentDeploymentBranchPolicies,
    )
    if (scopeViolations.length > 0) {
      output.log(
        `Secret scope violations:\n${scopeViolations.map(value => `  - ${value}`).join('\n')}`,
      )
    }

    const missingConfirmed = missingConfirmedSecrets(confirmNames, names)
    if (confirmNames.length > 0)
      output.log(
        missingConfirmed.length > 0
          ? `--confirm expected these secret(s) to be live, but gh does not see them: ${missingConfirmed.join(', ')}`
          : `Confirmed all ${confirmNames.length} --confirm secret(s) are live.`,
      )

    return unconfirmedNewlyProvisioned(drift, confirmNames).length > 0 ||
      drift.notActuallyProvisioned.length > 0 ||
      drift.accidentallyProvisioned.length > 0 ||
      drift.warnings.length > 0 ||
      scopeViolations.length > 0 ||
      missingConfirmed.length > 0
      ? 1
      : 0
  } catch (error) {
    output.error(`verify-workflow-secrets failed: ${errorMessage(error)}`)
    return 1
  }
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
)
  process.exitCode = await runVerifyWorkflowSecretsCli(process.argv.slice(2))
