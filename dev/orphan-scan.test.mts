import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('orphan-scan worktree resource discovery', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/orphan-scan.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('lists a live Grok checkout so cleanup will not treat its database as orphaned', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-home-'))
    testDirs.push(home)
    const clone = join(home, '.grok', 'worktrees', 'filaments', '2026-08-16-deadbeef')
    await mkdir(join(clone, 'dev', 'lib'), { recursive: true })
    await mkdir(join(clone, '.git'))
    await writeFile(join(clone, 'dev', 'lib', 'refuse-on-main.sh'), '#!/usr/bin/env bash\n')
    await writeFile(
      join(clone, '.env'),
      'export DATABASE_URL=postgres://localhost/voucha-deadbeef\n',
    )

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(helperPath, 'worktree_resource_live_paths'),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe(clone)
  })

  it('appends a checkout path only once', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-dedupe-'))
    testDirs.push(home)
    const clone = join(home, '.grok', 'worktrees', 'filaments', '2026-08-16-deadbeef')
    await mkdir(join(clone, 'dev', 'lib'), { recursive: true })
    await mkdir(join(clone, '.git'))
    await writeFile(join(clone, 'dev', 'lib', 'refuse-on-main.sh'), '#!/usr/bin/env bash\n')
    await mkdir(join(home, '.voucha'), { recursive: true })
    await writeFile(join(home, '.voucha', 'disposable-checkouts'), `${clone}\n`)

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        'WORKTREE_PATHS=(); worktree_paths_append_unique "$1"; worktree_paths_append_unique "$1"; printf "%s" "${#WORKTREE_PATHS[@]}"',
        [clone],
      ),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe('1')
  })

  it('omits a registry path that is not a Voucha checkout', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-registry-'))
    testDirs.push(home)
    const foreign = join(home, 'other-repo')
    await mkdir(join(foreign, '.git'), { recursive: true })
    const registryDir = join(home, '.voucha')
    await mkdir(registryDir, { recursive: true })
    const registry = join(registryDir, 'disposable-checkouts')
    await writeFile(registry, `${foreign}\n`)

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(helperPath, 'worktree_resource_live_paths'),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe('')
  })

  it('protects resources referenced by a registered linked worktree in another clone', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-cross-clone-'))
    testDirs.push(home)
    const checkout = join(home, 'other-clone', '.codex', 'worktrees', 'feature')
    await mkdir(join(checkout, 'dev', 'lib'), { recursive: true })
    await writeFile(join(checkout, '.git'), 'gitdir: /other-clone/.git/worktrees/feature\n')
    await writeFile(join(checkout, 'dev', 'lib', 'refuse-on-main.sh'), '#!/usr/bin/env bash\n')
    await writeFile(
      join(checkout, '.env'),
      `export DATABASE_URL=postgres://localhost/voucha-d222222222222
export VALKEY_CONTAINER=voucha-valkey-d222222222222
`,
    )
    const registryDir = join(home, '.voucha')
    await mkdir(registryDir, { recursive: true })
    await writeFile(join(registryDir, 'worktree-resource-owners'), `${checkout}\n`)

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        WORKTREE_PATHS=()
        while IFS= read -r path; do worktree_paths_append_unique "$path"; done < <(worktree_resource_live_paths)
        psql() { printf ' voucha-d222222222222 | owner\n'; }
        docker() { printf 'voucha-valkey-d222222222222\n'; }
        scan_orphaned_dbs
        scan_orphaned_containers
        printf '%s|dbs=%s|containers=%s' "\${WORKTREE_PATHS[0]:-}" "\${ORPHANED_DBS[*]}" "\${ORPHANED_CONTAINERS[*]}"
        `,
      ),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe(`${checkout}|dbs=|containers=`)
  })

  it('retains unregistered legacy resource names', async () => {
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        WORKTREE_PATHS=()
        psql() { printf ' voucha-shared-legacy | owner\n'; }
        docker() { printf 'voucha-valkey-shared-legacy\n'; }
        scan_orphaned_dbs
        scan_orphaned_containers
        printf 'dbs=%s|containers=%s' "\${ORPHANED_DBS[*]}" "\${ORPHANED_CONTAINERS[*]}"
        `,
      ),
    )

    expect(stdout.trim()).toBe('dbs=|containers=')
  })

  it.each([
    [
      'database',
      `psql() { printf ' voucha-d0123456789ab | owner\\n'; }
      if scan_orphaned_dbs; then printf accepted; else printf rejected; fi`,
    ],
    [
      'Valkey container',
      `docker() { printf 'voucha-valkey-d0123456789ab\\n'; }
      if scan_orphaned_containers; then printf accepted; else printf rejected; fi`,
    ],
  ])('fails the %s scan when a live owner identity cannot be generated', async (_kind, scan) => {
    const checkout = await mkdtemp(join(tmpdir(), 'voucha-orphan-digest-failure-'))
    testDirs.push(checkout)
    await writeFile(join(checkout, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        openssl() { return 23; }
        WORKTREE_PATHS=("$1")
        ${scan}
        `,
        [checkout],
      ),
    )

    expect(stdout.trim()).toBe('rejected')
  })

  it('protects canonical resources while .env still names stale targets', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-custom-db-'))
    testDirs.push(home)
    const clone = join(home, '.grok', 'worktrees', 'filaments', '2026-08-16-deadbeef')
    await mkdir(join(clone, 'dev', 'lib'), { recursive: true })
    await mkdir(join(clone, '.git'))
    await writeFile(join(clone, 'dev', 'lib', 'refuse-on-main.sh'), '#!/usr/bin/env bash\n')
    await writeFile(
      join(clone, '.env'),
      `export DATABASE_URL=postgres://localhost/voucha-custom
export VALKEY_CONTAINER=voucha-valkey-custom
export WORKTREE_DIR=stale-identity
`,
    )

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        derived_db=$(worktree_resource_owned_db_name "$1")
        derived_container=$(worktree_resource_owned_valkey_container "$1")
        psql() { printf ' %s | owner\\n %s | owner\\n' "$derived_db" voucha-custom; }
        docker() { printf '%s\\n%s\\n' "$derived_container" voucha-valkey-custom; }
        WORKTREE_PATHS=("$1")
        scan_orphaned_dbs
        scan_orphaned_containers
        printf '%s %s dbs=%s containers=%s' "$derived_db" "$derived_container" "\${ORPHANED_DBS[*]}" "\${ORPHANED_CONTAINERS[*]}"
        `,
        [clone],
      ),
      { env: { ...process.env, HOME: home } },
    )

    const [derivedDb, derivedContainer, dbs, containers] = stdout.trim().split(' ')
    expect(derivedDb).toMatch(/^voucha-d[0-9a-f]{12}$/)
    expect(derivedContainer).toMatch(/^voucha-valkey-d[0-9a-f]{12}$/)
    expect(dbs).toBe('dbs=')
    expect(containers).toBe('containers=')
  })

  it('reclaims canonical resources when current .env intentionally names custom targets', async () => {
    const clone = await mkdtemp(join(tmpdir(), 'voucha-orphan-current-custom-'))
    testDirs.push(clone)
    await mkdir(join(clone, '.git'))

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        worktree_dir=$(worktree_resource_current_dir "$1")
        derived_db=$(worktree_resource_owned_db_name "$1")
        derived_container=$(worktree_resource_owned_valkey_container "$1")
        printf 'DATABASE_URL=postgres://localhost/voucha-custom\nVALKEY_CONTAINER=voucha-valkey-custom\nWORKTREE_DIR=%s\n' "$worktree_dir" >"$1/.env"
        psql() { printf ' %s | owner\n' "$derived_db"; }
        docker_calls=0
        docker() { docker_calls=$((docker_calls + 1)); [ "$docker_calls" -eq 1 ] && printf '%s\n' "$derived_container"; }
        WORKTREE_PATHS=("$1")
        scan_orphaned_dbs
        scan_orphaned_containers
        printf 'dbs=%s containers=%s' "\${ORPHANED_DBS[*]}" "\${ORPHANED_CONTAINERS[*]}"
        `,
        [clone],
      ),
    )

    expect(stdout.trim()).toMatch(
      /^dbs=voucha-d[0-9a-f]{12} containers=voucha-valkey-d[0-9a-f]{12}$/,
    )
  })

  it('propagates live-owner discovery failures', async () => {
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        WORKTREE_PATHS=()
        failing_discovery() { return 23; }
        if worktree_paths_append_command_output failing_discovery; then
          printf accepted
        else
          printf rejected
        fi
        `,
      ),
    )

    expect(stdout.trim()).toBe('rejected')
  })

  it('treats a derived Valkey name as owned before .env exists', async () => {
    const home = await mkdtemp(join(tmpdir(), 'voucha-orphan-valkey-'))
    testDirs.push(home)
    const clone = join(home, '.grok', 'worktrees', 'filaments', '2026-08-16-deadbeef')
    await mkdir(join(clone, 'dev', 'lib'), { recursive: true })
    await mkdir(join(clone, '.git'))
    await writeFile(join(clone, 'dev', 'lib', 'refuse-on-main.sh'), '#!/usr/bin/env bash\n')

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        expected=$(worktree_resource_owned_valkey_container "$1")
        docker() { printf '%s\\n' "$expected"; }
        WORKTREE_PATHS=("$1")
        scan_orphaned_containers
        printf '%s orphans=%s' "$expected" "\${ORPHANED_CONTAINERS[*]}"
        `,
        [clone],
      ),
      { env: { ...process.env, HOME: home } },
    )

    const [container, orphans] = stdout.trim().split(' ')
    expect(container).toMatch(/^voucha-valkey-d[0-9a-f]{12}$/)
    expect(orphans).toBe('orphans=')
  })
})
