import { describe, expect, it } from 'vitest'

import {
  collectLiveSecretNames,
  runVerifyWorkflowSecretsCli,
  type VerifyWorkflowSecretsDependencies,
} from './verify-workflow-secrets.mts'

import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

const REQUIRED_ENVIRONMENT_INVENTORY: Record<string, SecretInventoryEntry> = {
  REQUIRED_ENVIRONMENT_SECRET: {
    provisioned: true,
    requiredEnvironment: 'auto-harness',
    notes: 'fixture',
  },
}

function fixtureDependencies(
  overrides: Partial<VerifyWorkflowSecretsDependencies> = {},
): VerifyWorkflowSecretsDependencies {
  return {
    resolveRepo: () => Promise.resolve('acme/widgets'),
    listRepoSecretNames: () => Promise.resolve([]),
    listRepositoryOwnerType: () => Promise.resolve('User'),
    listRepositoryOrganizationSecretNames: () => Promise.resolve([]),
    listEnvironmentNames: () => Promise.resolve(['auto-harness']),
    listEnvironmentSecretNames: () => Promise.resolve(['REQUIRED_ENVIRONMENT_SECRET']),
    getEnvironmentDeploymentBranchPolicy: () =>
      Promise.resolve({
        protectedBranchesEnabled: false,
        customBranchPoliciesEnabled: true,
        deploymentBranchRules: [{ name: 'main', type: 'branch' }],
      }),
    ...overrides,
  }
}

describe('required environment deployment branch policies', () => {
  it('queries only required environments and fails closed when their policy cannot be queried', async () => {
    const queriedEnvironments: string[] = []
    const { warnings } = await collectLiveSecretNames(
      'acme/widgets',
      fixtureDependencies({
        listEnvironmentNames: () => Promise.resolve(['unrelated']),
        getEnvironmentDeploymentBranchPolicy: (_repo, environment) => {
          queriedEnvironments.push(environment)
          return Promise.reject(new Error('permission denied'))
        },
      }),
      new Set(['auto-harness']),
    )
    expect(queriedEnvironments).toEqual(['auto-harness'])
    expect(warnings).toEqual([
      'Could not list deployment branch policy for environment "auto-harness": permission denied',
    ])
  })

  it('exits 1 when a required environment allows deployments beyond main', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        getEnvironmentDeploymentBranchPolicy: () =>
          Promise.resolve({
            protectedBranchesEnabled: false,
            customBranchPoliciesEnabled: true,
            deploymentBranchRules: [
              { name: 'main', type: 'branch' },
              { name: 'release/*', type: 'branch' },
            ],
          }),
      }),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_ENVIRONMENT_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs.at(-1)).toContain('environment auto-harness must permit deployments from only main')
  })

  it('does not print or affect the exit code when --confirm is omitted', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies(),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_ENVIRONMENT_INVENTORY,
    )
    expect(exitCode).toBe(0)
    expect(logs.some(line => line.includes('--confirm'))).toBe(false)
  })
})

// A repo-scoped secret's Environment can be kept around purely to enforce a branch-policy gate,
// via requiredBranchPolicy instead of requiredEnvironment (e.g. HARNESS_API_KEY, which
// workflow_call cannot resolve from Environment scope). This must still be live-verified end to
// end through the same CLI path — not just checked against fixtures in
// verify-workflow-secret-scopes.test.mts, which never exercises the CLI's environment discovery.
const REQUIRED_BRANCH_POLICY_INVENTORY: Record<string, SecretInventoryEntry> = {
  REPO_SCOPED_SECRET: {
    provisioned: true,
    requiredBranchPolicy: 'auto-harness',
    notes: 'fixture',
  },
}

function branchPolicyOnlyDependencies(
  overrides: Partial<VerifyWorkflowSecretsDependencies> = {},
): VerifyWorkflowSecretsDependencies {
  return fixtureDependencies({
    listRepoSecretNames: () => Promise.resolve(['REPO_SCOPED_SECRET']),
    listEnvironmentSecretNames: () => Promise.resolve([]),
    ...overrides,
  })
}

describe('required branch policy without required environment (repo-scoped secret)', () => {
  it('queries the named environment even though the secret is not required to live there', async () => {
    const queriedEnvironments: string[] = []
    const { warnings } = await collectLiveSecretNames(
      'acme/widgets',
      branchPolicyOnlyDependencies({
        getEnvironmentDeploymentBranchPolicy: (_repo, environment) => {
          queriedEnvironments.push(environment)
          return Promise.reject(new Error('permission denied'))
        },
      }),
      new Set(['auto-harness']),
    )
    expect(queriedEnvironments).toEqual(['auto-harness'])
    expect(warnings).toEqual([
      'Could not list deployment branch policy for environment "auto-harness": permission denied',
    ])
  })

  it('passes when the repo secret exists, has no Environment copy, and the policy is main-only', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      branchPolicyOnlyDependencies(),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_BRANCH_POLICY_INVENTORY,
    )
    expect(exitCode).toBe(0)
  })

  it('exits 1 when the branch-policy-only environment allows deployments beyond main', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      branchPolicyOnlyDependencies({
        getEnvironmentDeploymentBranchPolicy: () =>
          Promise.resolve({
            protectedBranchesEnabled: false,
            customBranchPoliciesEnabled: true,
            deploymentBranchRules: [
              { name: 'main', type: 'branch' },
              { name: 'release/*', type: 'branch' },
            ],
          }),
      }),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_BRANCH_POLICY_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs.at(-1)).toContain('environment auto-harness must permit deployments from only main')
  })

  it('exits 1 when a leftover copy of the secret still lives in the named environment', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      branchPolicyOnlyDependencies({
        listEnvironmentSecretNames: () => Promise.resolve(['REPO_SCOPED_SECRET']),
      }),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_BRANCH_POLICY_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs.at(-1)).toContain('REPO_SCOPED_SECRET must not exist in environment auto-harness')
  })

  it('exits 1 when a leftover copy of the secret lives at organization scope', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      branchPolicyOnlyDependencies({
        listRepositoryOwnerType: () => Promise.resolve('Organization'),
        listRepositoryOrganizationSecretNames: () => Promise.resolve(['REPO_SCOPED_SECRET']),
      }),
      { error: () => {}, log: message => logs.push(message) },
      REQUIRED_BRANCH_POLICY_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs.at(-1)).toContain('REPO_SCOPED_SECRET must not exist as an organization secret')
  })
})
