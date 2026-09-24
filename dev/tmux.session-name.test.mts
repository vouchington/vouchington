import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTmuxTestDirs, makeFakeBin, makeRepo, runTmux } from './test-helpers/tmux.mts'

describe('dev/tmux session name', () => {
  afterEach(cleanupTmuxTestDirs)

  it('names the session-hash failure on stderr instead of exiting silently', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    await writeFile(join(binDir, 'openssl'), '#!/bin/bash\nprintf "not a digest\\n"\n')
    await chmod(join(binDir, 'openssl'), 0o755)

    const result = await runTmux({ binDir, cwd, args: ['--no-attach'] })

    expect(result).toEqual(expect.objectContaining({ code: 1, timedOut: false }))
    expect(result.stderr).toMatch(
      /^Error: could not derive the tmux session name for \/.+ \(git_worktree_canonical_path_hash failed\)\.$/m,
    )
  })
})
