import { chmod, writeFile } from 'node:fs/promises'
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

  it('delegates an empty name to tmux-name', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo({ withEnv: false })
    const binDir = await makeFakeBin()

    await writeFile(
      join(cwd, 'dev', 'tmux-name'),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'tmux-name argc=%s arg0=<%s>\\n' "$#" "\${1-}" >> "$log"
`,
    )
    await chmod(join(cwd, 'dev', 'tmux-name'), 0o755)

    const result = await runResetWorktree({ binDir, cwd, env: { TMUX_PANE: undefined } })
    expectResetSuccess(result)

    const tmuxNameLines = result.log.split('\n').filter(line => line.startsWith('tmux-name '))
    expect(tmuxNameLines).toEqual(['tmux-name argc=1 arg0=<>'])
  })
})
