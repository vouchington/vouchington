import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  expectResetSuccess,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('prints an agent-facing message with next steps', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    await writeFile(join(cwd, '.initialized'), 'web\n')
    const result = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(result)
    await expect(readFile(join(cwd, '.initialized'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(result.log).toContain('initialize monorepo')
    expect(result.stdout).toContain('Notes for the next agent')
    expect(result.stdout).toContain('pnpm exec tools are ready')
    expect(result.stdout).toContain('./dev/initialize web')
    expect(result.stdout).toContain('.env is preserved')
    expect(result.stdout).toMatch(/reset-[0-9a-f]{8}/)
  })
})
