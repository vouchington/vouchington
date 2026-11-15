import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  runInitializeHelper,
} from '../test-helpers/initialize.mts'

describe('initialize local PostgreSQL server version', () => {
  afterEach(cleanupWorktreeDirs)

  it('fails when the running server is older than the installed PostgreSQL', async () => {
    const cwd = await makeWorktreeDir('feature-db-server-version-stale')

    await expect(
      runInitializeHelper({ cwd, script: serverVersionScript('18.6 (Homebrew)') }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(
        /upgraded to 18\.7, but the running server is still 18\.6[\s\S]*brew services restart \S+/u,
      ),
    })
  })

  it('accepts a running server that matches the installed PostgreSQL', async () => {
    const cwd = await makeWorktreeDir('feature-db-server-version-current')
    const output = await runInitializeHelper({
      cwd,
      script: serverVersionScript('18.7 (Homebrew)'),
    })

    expect(output).toContain('Starting local PostgreSQL service')
  })
})

function serverVersionScript(runningVersion: string): string {
  return `
    unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE
    mkdir -p pg/bin
    printf '#!/bin/sh\\necho "postgres (PostgreSQL) 18.7 (Homebrew)"\\n' > pg/bin/postgres
    chmod +x pg/bin/postgres
    uname() { printf 'Darwin\\n'; }
    brew() { if [ "$1" = --prefix ]; then printf '%s/pg\\n' "$PWD"; fi; }
    psql() { printf '%s\\n' '${runningVersion}'; }
    prepare_worktree_database_host
    `
}
