import { describe, expect, it } from 'vitest'
import { makeRepo, registerTmuxFakeHooks, runTmux } from './test-helpers/tmux.mts'

describe('dev/tmux session name', () => {
  const { makeFakeBin } = registerTmuxFakeHooks()

  it('names the session-hash failure on stderr instead of exiting silently', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({
      overrides: { openssl: '#!/bin/bash\nprintf "not a digest\\n"\n' },
    })

    const result = await runTmux({ binDir, cwd, args: ['--no-attach'] })

    expect(result).toEqual(expect.objectContaining({ code: 1, timedOut: false }))
    expect(result.stderr).toMatch(
      /^Error: could not derive the tmux session name for \/.+ \(git_worktree_canonical_path_hash failed\)\.$/m,
    )
  })
})
