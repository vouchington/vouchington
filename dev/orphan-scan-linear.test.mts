import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

// Each scan derives every live worktree identity once, so cleanup stays linear
// in worktrees + resources instead of multiplying them.
describe('orphan-scan linear identity derivation', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/orphan-scan.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function linkedCheckout(prefix: string, env?: string): Promise<string> {
    const checkout = await mkdtemp(join(tmpdir(), prefix))
    testDirs.push(checkout)
    await writeFile(join(checkout, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
    if (env !== undefined) await writeFile(join(checkout, '.env'), env)
    return checkout
  }

  it('classifies many resources while deriving each worktree identity once per scan', async () => {
    const envProtected = await linkedCheckout(
      'voucha-orphan-linear-env-',
      `export DATABASE_URL=postgres://localhost/voucha-daaaaaaaaaaaa
export VALKEY_CONTAINER=voucha-valkey-daaaaaaaaaaaa
`,
    )
    const derivedProtected = await linkedCheckout('voucha-orphan-linear-derived-')
    const reclaimable = await linkedCheckout('voucha-orphan-linear-custom-')

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        set -u
        protected_db=$(worktree_resource_owned_db_name "$2")
        protected_container=$(worktree_resource_owned_valkey_container "$2")
        reclaim_db=$(worktree_resource_owned_db_name "$3")
        reclaim_container=$(worktree_resource_owned_valkey_container "$3")
        printf 'DATABASE_URL=postgres://localhost/voucha-custom\\nWORKTREE_DIR=%s\\n' \\
          "$(worktree_resource_current_dir "$3")" >"$3/.env"
        calls_file=$(mktemp)
        eval "original_$(declare -f worktree_resource_current_dir)"
        worktree_resource_current_dir() {
          printf 'x\\n' >>"$calls_file"
          original_worktree_resource_current_dir "$@"
        }
        psql() {
          printf ' %s | owner\\n' voucha-daaaaaaaaaaaa "$protected_db" "$reclaim_db" \\
            voucha-dbbbbbbbbbbbb voucha-dcccccccccccc
        }
        docker_calls=0
        docker() {
          docker_calls=$((docker_calls + 1))
          [ "$docker_calls" -eq 1 ] || return 0
          printf '%s\\n' voucha-valkey-daaaaaaaaaaaa "$protected_container" "$reclaim_container" \\
            voucha-valkey-dbbbbbbbbbbbb
        }
        WORKTREE_PATHS=("$1" "$2" "$3")
        scan_orphaned_dbs
        db_calls=$(wc -l <"$calls_file" | tr -d ' ')
        : >"$calls_file"
        scan_orphaned_containers
        container_calls=$(wc -l <"$calls_file" | tr -d ' ')
        [ "\${ORPHANED_DBS[*]}" = "$reclaim_db voucha-dbbbbbbbbbbbb voucha-dcccccccccccc" ] || printf 'bad-dbs '
        [ "\${ORPHANED_CONTAINERS[*]}" = "$reclaim_container voucha-valkey-dbbbbbbbbbbbb" ] || printf 'bad-containers '
        printf 'db_calls=%s container_calls=%s' "$db_calls" "$container_calls"
        `,
        [envProtected, derivedProtected, reclaimable],
      ),
    )

    // Two derivations per worktree: the owned name and the current directory.
    expect(stdout.trim()).toBe('db_calls=6 container_calls=6')
  })

  it('skips identity derivation when no managed resources exist', async () => {
    const checkout = await linkedCheckout('voucha-orphan-linear-empty-')

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        openssl() { return 23; }
        psql() { printf ' voucha | owner\\n voucha-shared-legacy | owner\\n'; }
        docker() { printf 'voucha-valkey\\n'; }
        WORKTREE_PATHS=("$1")
        scan_orphaned_dbs && scan_orphaned_containers && printf 'accepted'
        `,
        [checkout],
      ),
    )

    expect(stdout.trim()).toBe('accepted')
  })

  it('matches names as whole lines only', async () => {
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        list=$'voucha-d000000000001\\nvoucha-d000000000002'
        orphan_scan_contains_line "$list" voucha-d000000000002 && printf 'hit '
        orphan_scan_contains_line "$list" voucha-d00000000000 || printf 'miss'
        `,
      ),
    )

    expect(stdout.trim()).toBe('hit miss')
  })
})
