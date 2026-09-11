import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('worktree resource identity digest failures', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/worktree-resource-env.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each(['SHA256(stdin)=', 'SHA2-256(stdin)='])(
    'accepts the %s OpenSSL digest prefix',
    async prefix => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-resource-identity-prefix-'))
      testDirs.push(repoRoot)
      await writeFile(join(repoRoot, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

      const { stdout } = await execFileAsync(
        'bash',
        sourceBashArgs(
          helperPath,
          `
          digest_prefix=$2
          openssl() { cat >/dev/null; printf '%s %064d\n' "$digest_prefix" 0; }
          worktree_resource_dir_from_path "$1"
          `,
          [repoRoot, prefix],
        ),
      )

      expect(stdout.trim()).toBe('d000000000000')
    },
  )

  it('a draining fake openssl consumes stdin larger than the OS pipe buffer without racing', async () => {
    // Regression test for the SIGPIPE race this fixture pattern is prone to: a fake
    // `openssl` that exits without reading stdin only *sometimes* kills its writer with
    // SIGPIPE, because a short payload (like a real worktree path) usually fits a single
    // write() before the reader exits. Piping far more than any OS pipe buffer (commonly
    // 16-64 KiB) makes `head` block on a full buffer, so a non-draining reader that has
    // already exited deterministically kills it with SIGPIPE (exit 141), which `pipefail`
    // promotes to the pipeline's status -- this reliably fails without `cat >/dev/null` and
    // reliably passes with it, unlike the tiny-payload race it guards. This mirrors
    // worktree-resource-env.sh's own `if ! digest_output=$(... | openssl dgst ...)` shape, so
    // the same promotion this test exercises is what production relies on.
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        set -o pipefail
        openssl() { cat >/dev/null; printf 'deadbeefcafe%052d\\n' 0; }
        if ! digest_output=$(head -c 200000 /dev/zero | openssl dgst -sha256); then
          printf 'rejected'
          exit 1
        fi
        printf '%s' "$digest_output"
        `,
      ),
    )

    expect(stdout.trim()).toBe(`deadbeefcafe${'0'.repeat(52)}`)
  })

  it.each([
    ['worktree_resource_dir_from_path'],
    ['worktree_resource_identity_record'],
    ['worktree_resource_owned_db_name'],
    ['worktree_resource_owned_valkey_container'],
  ])('%s fails closed', async functionName => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-resource-identity-failure-'))
    testDirs.push(repoRoot)
    await writeFile(join(repoRoot, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

    for (const opensslBody of ['return 23', "printf 'SHA2-256(stdin)= not-a-digest\\n'"]) {
      const { stdout } = await execFileAsync(
        'bash',
        sourceBashArgs(
          helperPath,
          `
          openssl() { ${opensslBody}; }
          if output=$(${functionName} "$1" 2>/dev/null); then
            printf 'accepted:%s' "$output"
          else
            printf 'rejected'
          fi
          `,
          [repoRoot],
        ),
      )

      expect(stdout.trim()).toBe('rejected')
    }
  })
})
