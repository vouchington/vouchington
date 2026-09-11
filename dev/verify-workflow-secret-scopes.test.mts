import { describe, expect, it } from 'vitest'

import { requiredSecretScopeViolations } from './verify-workflow-secret-scopes.mts'

import type { SecretInventoryEntry } from '../.github/workflows/workflow-secrets-inventory.mts'

const inventory: Record<string, SecretInventoryEntry> = {
  HARNESS_API_KEY: {
    provisioned: true,
    requiredEnvironment: 'auto-harness',
    notes: 'fixture',
  },
}

describe('requiredSecretScopeViolations', () => {
  it('accepts a secret present only in its required environment', () => {
    expect(
      requiredSecretScopeViolations(
        inventory,
        new Set(),
        new Map([['auto-harness', new Set(['HARNESS_API_KEY'])]]),
        new Set(),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'branch' }],
            },
          ],
        ]),
      ),
    ).toEqual([])
  })

  it('rejects a missing required environment secret', () => {
    expect(
      requiredSecretScopeViolations(inventory, new Set(), new Map(), new Set(), new Map()),
    ).toEqual([
      'HARNESS_API_KEY is missing from environment auto-harness',
      'environment auto-harness must permit deployments from only main',
    ])
  })

  it('rejects a repository-scoped duplicate', () => {
    expect(
      requiredSecretScopeViolations(
        inventory,
        new Set(['HARNESS_API_KEY']),
        new Map([['auto-harness', new Set(['HARNESS_API_KEY'])]]),
        new Set(),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'branch' }],
            },
          ],
        ]),
      ),
    ).toEqual(['HARNESS_API_KEY must not exist as a repository secret'])
  })

  it('rejects duplicates in every other environment', () => {
    expect(
      requiredSecretScopeViolations(
        inventory,
        new Set(),
        new Map([
          ['auto-harness', new Set(['HARNESS_API_KEY'])],
          ['staging', new Set(['HARNESS_API_KEY'])],
        ]),
        new Set(),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'branch' }],
            },
          ],
        ]),
      ),
    ).toEqual(['HARNESS_API_KEY must not exist in environment staging'])
  })

  it('rejects an organization-scoped duplicate', () => {
    expect(
      requiredSecretScopeViolations(
        inventory,
        new Set(),
        new Map([['auto-harness', new Set(['HARNESS_API_KEY'])]]),
        new Set(['HARNESS_API_KEY']),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'branch' }],
            },
          ],
        ]),
      ),
    ).toEqual(['HARNESS_API_KEY must not exist as an organization secret'])
  })

  it('rejects a tag named main instead of the main branch', () => {
    expect(
      requiredSecretScopeViolations(
        inventory,
        new Set(),
        new Map([['auto-harness', new Set(['HARNESS_API_KEY'])]]),
        new Set(),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'tag' }],
            },
          ],
        ]),
      ),
    ).toEqual(['environment auto-harness must permit deployments from only main'])
  })
})

const branchPolicyOnlyInventory: Record<string, SecretInventoryEntry> = {
  HARNESS_API_KEY: {
    provisioned: true,
    requiredBranchPolicy: 'auto-harness',
    notes: 'fixture',
  },
}

const mainOnlyPolicy = new Map([
  [
    'auto-harness',
    {
      protectedBranchesEnabled: false,
      customBranchPoliciesEnabled: true,
      deploymentBranchRules: [{ name: 'main', type: 'branch' }],
    },
  ],
])

describe('requiredSecretScopeViolations (requiredBranchPolicy, no requiredEnvironment)', () => {
  it('accepts a repository-scoped secret with no leftover Environment copy', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(['HARNESS_API_KEY']),
        new Map(),
        new Set(),
        mainOnlyPolicy,
      ),
    ).toEqual([])
  })

  it('still enforces the named Environment branch policy even though the secret does not live there', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(['HARNESS_API_KEY']),
        new Map(),
        new Set(),
        new Map([
          [
            'auto-harness',
            {
              protectedBranchesEnabled: false,
              customBranchPoliciesEnabled: true,
              deploymentBranchRules: [{ name: 'main', type: 'tag' }],
            },
          ],
        ]),
      ),
    ).toEqual(['environment auto-harness must permit deployments from only main'])
  })

  it('rejects a provisioned secret missing from repository secrets', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(),
        new Map(),
        new Set(),
        mainOnlyPolicy,
      ),
    ).toEqual(['HARNESS_API_KEY is missing from repository secrets'])
  })

  it('rejects a leftover copy still present in the named Environment', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(['HARNESS_API_KEY']),
        new Map([['auto-harness', new Set(['HARNESS_API_KEY'])]]),
        new Set(),
        mainOnlyPolicy,
      ),
    ).toEqual(['HARNESS_API_KEY must not exist in environment auto-harness'])
  })

  it('rejects a leftover copy present in an unrelated Environment', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(['HARNESS_API_KEY']),
        new Map([['staging', new Set(['HARNESS_API_KEY'])]]),
        new Set(),
        mainOnlyPolicy,
      ),
    ).toEqual(['HARNESS_API_KEY must not exist in environment staging'])
  })

  it('rejects an organization-scoped duplicate', () => {
    expect(
      requiredSecretScopeViolations(
        branchPolicyOnlyInventory,
        new Set(['HARNESS_API_KEY']),
        new Map(),
        new Set(['HARNESS_API_KEY']),
        mainOnlyPolicy,
      ),
    ).toEqual(['HARNESS_API_KEY must not exist as an organization secret'])
  })
})
