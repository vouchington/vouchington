import { execFile } from 'node:child_process'

import type {
  DeploymentBranchRule,
  EnvironmentDeploymentBranchPolicy,
} from './verify-workflow-secret-scopes.mts'
import type { VerifyWorkflowSecretsDependencies } from './verify-workflow-secrets.mts'

function execFileAsync(command: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return rejectPromise(error)
      resolvePromise({ stdout })
    })
  })
}

async function secretNames(args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync('gh', args)
  return (JSON.parse(stdout) as Array<{ name: string }>).map(entry => entry.name)
}

function outputNames(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function parseDeploymentBranchPolicy(
  stdout: string,
): Omit<EnvironmentDeploymentBranchPolicy, 'deploymentBranchRules'> {
  const parsed: unknown = JSON.parse(stdout)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('unexpected deployment branch policy metadata')
  }
  const { protected_branches, custom_branch_policies } = parsed as Record<string, unknown>
  if (typeof protected_branches !== 'boolean' || typeof custom_branch_policies !== 'boolean') {
    throw new Error('unexpected deployment branch policy metadata')
  }
  return {
    protectedBranchesEnabled: protected_branches,
    customBranchPoliciesEnabled: custom_branch_policies,
  }
}

function parseDeploymentBranchRules(stdout: string): DeploymentBranchRule[] {
  const parsed: unknown = JSON.parse(stdout)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('unexpected deployment branch policy')
  }
  const { total_count, branch_policies } = parsed as Record<string, unknown>
  if (
    !Number.isSafeInteger(total_count) ||
    (total_count as number) < 0 ||
    !Array.isArray(branch_policies) ||
    branch_policies.length > 2 ||
    branch_policies.length !== total_count
  ) {
    throw new Error('unexpected deployment branch policy')
  }
  return branch_policies.map(rule => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      throw new Error('unexpected deployment branch policy')
    }
    const { name, type } = rule as Record<string, unknown>
    if (typeof name !== 'string' || typeof type !== 'string') {
      throw new Error('unexpected deployment branch policy')
    }
    return { name, type }
  })
}

export const defaultDependencies: VerifyWorkflowSecretsDependencies = {
  resolveRepo: async () =>
    (
      await execFileAsync('gh', [
        'repo',
        'view',
        '--json',
        'nameWithOwner',
        '--jq',
        '.nameWithOwner',
      ])
    ).stdout.trim(),
  listRepoSecretNames: repo => secretNames(['secret', 'list', '-R', repo, '--json', 'name']),
  listRepositoryOwnerType: async repo =>
    (await execFileAsync('gh', ['api', `repos/${repo}`, '--jq', '.owner.type'])).stdout.trim(),
  listRepositoryOrganizationSecretNames: async repo =>
    outputNames(
      (
        await execFileAsync('gh', [
          'api',
          `repos/${repo}/actions/organization-secrets`,
          '--paginate',
          '--jq',
          '.secrets[].name',
        ])
      ).stdout,
    ),
  listEnvironmentNames: async repo => {
    const { stdout } = await execFileAsync('gh', [
      'api',
      `repos/${repo}/environments`,
      '--paginate',
      '--jq',
      '.environments[].name',
    ])
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  },
  listEnvironmentSecretNames: (repo, environment) =>
    secretNames(['secret', 'list', '-R', repo, '--env', environment, '--json', 'name']),
  getEnvironmentDeploymentBranchPolicy: async (repo, environment) => {
    const environmentEndpoint = `repos/${repo}/environments/${encodeURIComponent(environment)}`
    const { stdout } = await execFileAsync('gh', [
      'api',
      environmentEndpoint,
      '--jq',
      '.deployment_branch_policy',
    ])
    const policy = parseDeploymentBranchPolicy(stdout)
    if (!policy.customBranchPoliciesEnabled || policy.protectedBranchesEnabled)
      return { ...policy, deploymentBranchRules: [] }
    const { stdout: branchRules } = await execFileAsync('gh', [
      'api',
      '-X',
      'GET',
      `${environmentEndpoint}/deployment-branch-policies`,
      '-F',
      'per_page=2',
      '-F',
      'page=1',
      '--jq',
      '{total_count, branch_policies: [.branch_policies[] | {name, type}]}',
    ])
    return { ...policy, deploymentBranchRules: parseDeploymentBranchRules(branchRules) }
  },
}
