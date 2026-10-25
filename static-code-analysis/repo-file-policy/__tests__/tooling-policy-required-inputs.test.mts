import { describe, expect, it } from 'vitest'
import { setupRepoFilePolicyTest, rm, join } from '../../test-helpers/repo-file-policy-fixtures.mts'

describe('required tooling policy inputs', () => {
  const { makeRepo, run, untrackPath } = setupRepoFilePolicyTest()

  it('does not bypass workspace coverage when its configuration disappears', async () => {
    const root = await makeRepo()
    await rm(join(root, '.no-mistakes.yml'))
    untrackPath(root, '.no-mistakes.yml')
    await expect(run(root)).rejects.toThrow('Workspace coverage configuration must be tracked')
  })
})
