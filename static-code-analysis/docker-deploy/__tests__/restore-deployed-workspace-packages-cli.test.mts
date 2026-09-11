import { describe, expect, it } from 'vitest'

import { runRestoreDeployedWorkspacePackagesCli } from '../restore-deployed-workspace-packages.mts'

describe('runRestoreDeployedWorkspacePackagesCli', () => {
  it('does nothing when the module is imported', () => {
    const calls: string[] = []

    runRestoreDeployedWorkspacePackagesCli({
      args: [],
      env: {},
      isMain: false,
      restore: options => calls.push(String(options?.prodDir)),
    })

    expect(calls).toEqual([])
  })

  it.each([
    [['/argument'], { PROD_DIR: '/environment' }, '/argument'],
    [[], { PROD_DIR: '/environment' }, '/environment'],
    [[], {}, '/prod/backend'],
  ])('uses argument, environment, and default directory precedence', (args, env, expected) => {
    const calls: string[] = []

    runRestoreDeployedWorkspacePackagesCli({
      args,
      env,
      isMain: true,
      restore: options => calls.push(String(options?.prodDir)),
    })

    expect(calls).toEqual([expected])
  })
})
