import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:child_process')>(import('node:child_process'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn<typeof actual.execFile>() as unknown as typeof actual.execFile,
  }
})

type CpMod = typeof import('node:child_process')
type DepsMod = typeof import('./verify-workflow-secrets.mts')

let cp: CpMod
let defaultDependencies: DepsMod['defaultDependencies']

type ExecCb = (err: Error | null, stdout?: string, stderr?: string) => void

describe('defaultDependencies.listEnvironmentNames', () => {
  beforeEach(async () => {
    vi.resetModules()
    cp = await import('node:child_process')
    ;({ defaultDependencies } = await import('./verify-workflow-secrets.mts'))
    vi.mocked(cp.execFile).mockReset()
  })

  it('asks gh to paginate rather than reading only the first page', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as unknown as ExecCb)(null, 'staging\n')
      return null as never
    })

    await defaultDependencies.listEnvironmentNames('acme/widgets')

    const args = vi.mocked(cp.execFile).mock.calls[0]?.[1] as string[]
    expect(args).toEqual([
      'api',
      'repos/acme/widgets/environments',
      '--paginate',
      '--jq',
      '.environments[].name',
    ])
  })

  it('collects every name gh emits across pages, not just the first 30', async () => {
    const names = Array.from({ length: 45 }, (_, index) => `pr-${index}-storybook`)
    vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as unknown as ExecCb)(null, `${names.join('\n')}\n`)
      return null as never
    })

    const result = await defaultDependencies.listEnvironmentNames('acme/widgets')

    expect(result).toEqual(names)
    expect(result.length).toBeGreaterThan(30)
  })

  it('drops blank lines from gh output without dropping real names', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as unknown as ExecCb)(null, '\nstaging\n\nproduction\n\n')
      return null as never
    })

    const result = await defaultDependencies.listEnvironmentNames('acme/widgets')

    expect(result).toEqual(['staging', 'production'])
  })

  it('lists repository-visible organization secret names without requesting values', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as unknown as ExecCb)(null, 'HARNESS_API_KEY\n')
      return null as never
    })

    const result = await defaultDependencies.listRepositoryOrganizationSecretNames('acme/widgets')

    expect(result).toEqual(['HARNESS_API_KEY'])
    const args = vi.mocked(cp.execFile).mock.calls[0]?.[1] as string[]
    expect(args).toEqual([
      'api',
      'repos/acme/widgets/actions/organization-secrets',
      '--paginate',
      '--jq',
      '.secrets[].name',
    ])
  })

  it('gets only the exact main branch deployment policy for an environment', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, args, _opts, cb) => {
      const endpoint = (args as string[])[1]
      ;(cb as unknown as ExecCb)(
        null,
        endpoint === 'repos/acme/widgets/environments/auto-harness'
          ? '{"protected_branches":false,"custom_branch_policies":true}'
          : '{"total_count":1,"branch_policies":[{"name":"main","type":"branch"}]}',
      )
      return null as never
    })

    const result = await defaultDependencies.getEnvironmentDeploymentBranchPolicy(
      'acme/widgets',
      'auto-harness',
    )

    expect(result).toEqual({
      protectedBranchesEnabled: false,
      customBranchPoliciesEnabled: true,
      deploymentBranchRules: [{ name: 'main', type: 'branch' }],
    })
    expect(vi.mocked(cp.execFile).mock.calls.map(([, args]) => args)).toEqual([
      ['api', 'repos/acme/widgets/environments/auto-harness', '--jq', '.deployment_branch_policy'],
      [
        'api',
        '-X',
        'GET',
        'repos/acme/widgets/environments/auto-harness/deployment-branch-policies',
        '-F',
        'per_page=2',
        '-F',
        'page=1',
        '--jq',
        '{total_count, branch_policies: [.branch_policies[] | {name, type}]}',
      ],
    ])
  })

  it('fails closed when the bounded branch-policy response count is inconsistent', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, args, _opts, cb) => {
      const endpoint = (args as string[])[1]
      ;(cb as unknown as ExecCb)(
        null,
        endpoint === 'repos/acme/widgets/environments/auto-harness'
          ? '{"protected_branches":false,"custom_branch_policies":true}'
          : '{"total_count":2,"branch_policies":[{"name":"main","type":"branch"}]}',
      )
      return null as never
    })

    await expect(
      defaultDependencies.getEnvironmentDeploymentBranchPolicy('acme/widgets', 'auto-harness'),
    ).rejects.toThrow('unexpected deployment branch policy')
  })

  it('asks GitHub for the repository owner kind before organization scope', async () => {
    vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as unknown as ExecCb)(null, 'User\n')
      return null as never
    })

    const result = await defaultDependencies.listRepositoryOwnerType('acme/widgets')

    expect(result).toBe('User')
    const args = vi.mocked(cp.execFile).mock.calls[0]?.[1] as string[]
    expect(args).toEqual(['api', 'repos/acme/widgets', '--jq', '.owner.type'])
  })
})
