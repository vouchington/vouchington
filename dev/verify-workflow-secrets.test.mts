import { describe, expect, it } from 'vitest'

import {
  collectLiveSecretNames,
  runVerifyWorkflowSecretsCli,
  type VerifyWorkflowSecretsDependencies,
} from './verify-workflow-secrets.mts'

import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

const FIXTURE_INVENTORY: Record<string, SecretInventoryEntry> = {
  ALREADY_PROVISIONED: { provisioned: true, notes: 'fixture' },
  NOT_YET_PROVISIONED: { provisioned: false, notes: 'fixture' },
  NEVER_PROVISION_FIXTURE: { provisioned: false, neverProvision: true, notes: 'fixture' },
}

function fixtureDependencies(
  overrides: Partial<VerifyWorkflowSecretsDependencies> = {},
): VerifyWorkflowSecretsDependencies {
  return {
    resolveRepo: () => Promise.resolve('acme/widgets'),
    listRepoSecretNames: () => Promise.resolve(['ALREADY_PROVISIONED']),
    listRepositoryOwnerType: () => Promise.resolve('User'),
    listRepositoryOrganizationSecretNames: () =>
      Promise.reject(new Error('User owner has no org scope')),
    listEnvironmentNames: () => Promise.resolve([]),
    listEnvironmentSecretNames: () => Promise.resolve([]),
    getEnvironmentDeploymentBranchPolicy: () =>
      Promise.resolve({
        protectedBranchesEnabled: false,
        customBranchPoliciesEnabled: true,
        deploymentBranchRules: [{ name: 'main', type: 'branch' }],
      }),
    ...overrides,
  }
}

describe('collectLiveSecretNames', () => {
  it('unions repository- and environment-scoped secret names', async () => {
    let listedRepository: string | undefined
    const { names, repositoryNames, environmentNames, warnings } = await collectLiveSecretNames(
      'acme/widgets',
      fixtureDependencies({
        listRepositoryOrganizationSecretNames: repo => {
          listedRepository = repo
          return Promise.resolve(['ORGANIZATION_ONLY_SECRET'])
        },
        listRepositoryOwnerType: () => Promise.resolve('Organization'),
        listEnvironmentNames: () => Promise.resolve(['staging']),
        listEnvironmentSecretNames: () => Promise.resolve(['STAGING_ONLY_SECRET']),
      }),
      new Set(),
    )
    expect(listedRepository).toBe('acme/widgets')
    expect([...names].sort()).toEqual([
      'ALREADY_PROVISIONED',
      'ORGANIZATION_ONLY_SECRET',
      'STAGING_ONLY_SECRET',
    ])
    expect([...(environmentNames.get('staging') ?? [])]).toEqual(['STAGING_ONLY_SECRET'])
    expect([...repositoryNames]).toEqual(['ALREADY_PROVISIONED'])
    expect(warnings).toEqual([])
  })

  it('warns and fails closed when organization secrets cannot be queried', async () => {
    const { names, organizationNames, warnings } = await collectLiveSecretNames(
      'acme/widgets',
      fixtureDependencies({
        listRepositoryOwnerType: () => Promise.resolve('Organization'),
        listRepositoryOrganizationSecretNames: () => Promise.reject(new Error('permission denied')),
      }),
      new Set(),
    )
    expect([...names]).toEqual(['ALREADY_PROVISIONED'])
    expect([...organizationNames]).toEqual([])
    expect(warnings).toEqual([
      'Could not list organization secrets for acme/widgets: permission denied',
    ])
  })

  it('warns without throwing when an environment cannot be queried', async () => {
    const { names, warnings } = await collectLiveSecretNames(
      'acme/widgets',
      fixtureDependencies({
        listEnvironmentNames: () => Promise.resolve(['global']),
        listEnvironmentSecretNames: () => Promise.reject(new Error('HTTP 404: Not Found')),
      }),
      new Set(),
    )
    expect([...names]).toEqual(['ALREADY_PROVISIONED'])
    expect(warnings).toEqual([
      'Could not list secrets for environment "global": HTTP 404: Not Found',
    ])
  })

  it('warns without throwing when the environment list itself fails', async () => {
    const { warnings } = await collectLiveSecretNames(
      'acme/widgets',
      fixtureDependencies({
        listEnvironmentNames: () => Promise.reject(new Error('permission denied')),
      }),
      new Set(),
    )
    expect(warnings).toEqual([
      'Could not list deployment environments for acme/widgets: permission denied',
    ])
  })
})

describe('runVerifyWorkflowSecretsCli', () => {
  it('exits 0 and prints the report when nothing drifted', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies(),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(0)
    expect(logs[0]).toContain('No drift.')
  })

  it('exits 1 when a secret is now provisioned but still marked false', async () => {
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        listRepoSecretNames: () => Promise.resolve(['ALREADY_PROVISIONED', 'NOT_YET_PROVISIONED']),
      }),
      { error: () => {}, log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
  })

  it('honors an explicit --repo override instead of resolving one', async () => {
    let resolveRepoCalled = false
    function resolveRepo(): Promise<string> {
      resolveRepoCalled = true
      return Promise.reject(new Error('resolveRepo should not be called'))
    }
    await runVerifyWorkflowSecretsCli(
      ['--repo', 'acme/widgets'],
      fixtureDependencies({ resolveRepo }),
      { error: () => {}, log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(resolveRepoCalled).toBe(false)
  })

  it('prints usage and exits 2 when --repo is given without a value', async () => {
    const errors: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--repo'],
      fixtureDependencies(),
      { error: message => errors.push(message), log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(2)
    expect(errors[0]).toContain('Usage:')
  })

  it('prints usage and exits 2 for an unrecognized flag', async () => {
    const errors: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--bogus-flag'],
      fixtureDependencies(),
      { error: message => errors.push(message), log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(2)
    expect(errors[0]).toContain('Usage:')
  })

  it('exits 1 when only a warning was collected, even with no other drift', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        listEnvironmentNames: () => Promise.resolve(['global']),
        listEnvironmentSecretNames: () => Promise.reject(new Error('permission denied')),
      }),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs[0]).toContain('Warning: Could not list secrets for environment "global"')
  })

  it('exits 1 when organization scope cannot be enumerated', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        listRepositoryOwnerType: () => Promise.resolve('Organization'),
        listRepositoryOrganizationSecretNames: () => Promise.reject(new Error('permission denied')),
      }),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs[0]).toContain('Warning: Could not list organization secrets for acme/widgets')
  })

  it('exits 1 when a neverProvision:true name is provisioned live', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        listRepoSecretNames: () =>
          Promise.resolve(['ALREADY_PROVISIONED', 'NEVER_PROVISION_FIXTURE']),
      }),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs[0]).toContain('NEVER_PROVISION_FIXTURE')
  })

  it('reports a clean error and exits 1 instead of crashing when gh fails', async () => {
    const errors: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      [],
      fixtureDependencies({
        listRepoSecretNames: () => Promise.reject(new Error('gh: not authenticated')),
      }),
      { error: message => errors.push(message), log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(errors[0]).toContain('gh: not authenticated')
  })

  it('exits 0 and confirms when every --confirm name is live', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--confirm', 'ALREADY_PROVISIONED'],
      fixtureDependencies(),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(0)
    expect(logs.at(-1)).toContain('Confirmed all 1 --confirm secret(s) are live.')
  })

  it('exits 1 and names a skipped or misspelled --confirm secret even with no other drift', async () => {
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--confirm', 'ALREADY_PROVISIONED,R2_DOCS_ACCESS_KEY_ID'],
      fixtureDependencies(),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
    expect(logs.at(-1)).toContain(
      '--confirm expected these secret(s) to be live, but gh does not see them: R2_DOCS_ACCESS_KEY_ID',
    )
  })

  it('exits 0 when the sole newly-provisioned name is the one just confirmed live', async () => {
    // A freshly-provisioned secret is, by design, still `provisioned: false` in the checked-in
    // inventory at this point — flipping that flag is a separate follow-up commit — so this must
    // not be treated as unexplained drift when it's exactly what --confirm just verified.
    const logs: string[] = []
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--confirm', 'NOT_YET_PROVISIONED'],
      fixtureDependencies({
        listRepoSecretNames: () => Promise.resolve(['ALREADY_PROVISIONED', 'NOT_YET_PROVISIONED']),
      }),
      { error: () => {}, log: message => logs.push(message) },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(0)
    expect(logs.at(-1)).toContain('Confirmed all 1 --confirm secret(s) are live.')
  })

  it('still exits 1 for an unrelated newly-provisioned name not covered by --confirm', async () => {
    // Proves the --confirm exemption is scoped only to confirmed names, not a blanket pass on all
    // newly-provisioned drift once any --confirm flag is present.
    const exitCode = await runVerifyWorkflowSecretsCli(
      ['--confirm', 'ALREADY_PROVISIONED'],
      fixtureDependencies({
        listRepoSecretNames: () => Promise.resolve(['ALREADY_PROVISIONED', 'NOT_YET_PROVISIONED']),
      }),
      { error: () => {}, log: () => {} },
      FIXTURE_INVENTORY,
    )
    expect(exitCode).toBe(1)
  })
})
