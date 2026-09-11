import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { evaluateDbBackedTestSetup } from '../check-db-backed-test-setup.mts'
import { collectDbBackedTestSetupInput } from './probes.mts'
import { initializeBashArgs, sourceBashArgs } from '../test-helpers/initialize.mts'

describe('worktree resource identity adapter', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('../lib/worktree-resource-env.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRoot(...parts: string[]) {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-worktree-identity-'))
    const root = join(parent, ...parts)
    testDirs.push(parent)
    await mkdir(root, { recursive: true })
    return root
  }

  async function shellIdentity(root: string) {
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        if worktree_resource_is_main "$1"; then
          kind=main
        else
          kind=non-main
        fi
        printf '%s\\n%s' "$kind" "$(worktree_resource_current_dir "$1")"
        `,
        [root],
      ),
    )
    const [kind, id] = stdout.trim().split('\n')
    return { id, isMainWorktree: kind === 'main' }
  }

  async function expectAcceptedInitializedEnvironment(
    repoRoot: string,
    mode: 'backend' | 'web' = 'web',
  ) {
    const { stdout } = await execFileAsync(
      'bash',
      initializeBashArgs(`
        WORKTREE_DIR=$(worktree_resource_current_dir "$PWD")
        if worktree_resource_is_main "$PWD"; then
          DB_NAME=voucha
        else
          DB_NAME=$(worktree_resource_owned_db_name "$PWD")
        fi
        VALKEY_CONTAINER=$(worktree_resource_owned_valkey_container "$PWD")
        VALKEY_PORT=56379
        BACKEND_PORT=53001
        NEXT_PORT=53002
        WORKER_PORT=53003
        IMAGE_LAMBDA_PORT=53004
        STORYBOOK_PORT=53005
        INSPECTOR_PORT=53006
        CF_WORKER_SECRET=secret
        API_KEY_CHECKSUM_SECRET=checksum
        VOUCHA_OTP_TOKEN_HASH_SECRET=otp
        VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
        FINAL_WEB_PUSH_PUBLIC_KEY=public
        FINAL_WEB_PUSH_PRIVATE_KEY=private
        FINAL_WEB_PUSH_SUBJECT=mailto:tests@voucha.ai
        unset DATABASE_URL
        write_worktree_env >/dev/null
        set -a
        source .env
        set +a
        printf '%s\n%s\n%s\n%s' \
          "$WORKTREE_DIR" \
          "$DATABASE_URL" \
          "$VALKEY_URL" \
          "$VALKEY_CONTAINER"
      `),
      {
        cwd: repoRoot,
        env: { ...process.env, HOME: repoRoot },
      },
    )
    const [worktreeDir, databaseUrl, valkeyUrl, valkeyContainer] = stdout.trim().split('\n')
    const env = {
      DATABASE_URL: databaseUrl,
      VALKEY_CONTAINER: valkeyContainer,
      VALKEY_URL: valkeyUrl,
      WORKTREE_DIR: worktreeDir,
    }
    await writeFile(join(repoRoot, '.initialized'), `${mode}\n`)

    const input = collectDbBackedTestSetupInput(repoRoot, env, { probeServices: false })
    expect(evaluateDbBackedTestSetup(input)).toEqual({ errors: [], ok: true })
  }

  it('hashes distinct linked roots even when their display suffix matches', async () => {
    const first = await makeRoot('first', 'worktrees', 'shared-suffix')
    const second = await makeRoot('second', 'worktrees', 'shared-suffix')
    await writeFile(join(first, '.git'), 'gitdir: /fake/.git/worktrees/first\n')
    await writeFile(join(second, '.git'), 'gitdir: /fake/.git/worktrees/second\n')

    const [firstIdentity, secondIdentity] = await Promise.all([
      shellIdentity(first),
      shellIdentity(second),
    ])

    expect(firstIdentity).toEqual({
      id: expect.stringMatching(/^d[0-9a-f]{12}$/),
      isMainWorktree: false,
    })
    expect(secondIdentity).toEqual({
      id: expect.stringMatching(/^d[0-9a-f]{12}$/),
      isMainWorktree: false,
    })
    expect(firstIdentity.id).not.toBe(secondIdentity.id)
  })

  it('uses the same identity through a symlink alias', async () => {
    const physical = await makeRoot('physical')
    const aliasParent = await makeRoot('aliases')
    const alias = join(aliasParent, 'worktree')
    await writeFile(join(physical, '.git'), 'gitdir: /fake/.git/worktrees/physical\n')
    await symlink(physical, alias)

    const expectedId = `d${createHash('sha256')
      .update(await realpath(physical))
      .digest('hex')
      .slice(0, 12)}`

    expect(await shellIdentity(alias)).toEqual(await shellIdentity(physical))
    expect((await shellIdentity(physical)).id).toBe(expectedId)
  })

  it('uses one shell identity for non-main classification and WORKTREE_DIR', async () => {
    const repoRoot = await makeRoot('linked')
    await writeFile(join(repoRoot, '.git'), 'gitdir: /fake/.git/worktrees/test\\n')
    const input = collectDbBackedTestSetupInput(repoRoot, {}, { probeServices: false })

    expect(input.isMainWorktree).toBe(false)
    expect(input.worktreeDir).toMatch(/^d[0-9a-f]{12}$/)
  })

  it('reports identity generation failure as a structured diagnostic', async () => {
    const repoRoot = await makeRoot('identity-failure')
    const binDir = await makeRoot('identity-failure-bin')
    const probeMarker = join(repoRoot, 'probe-marker')
    const opensslPath = join(binDir, 'openssl')
    await writeFile(opensslPath, '#!/usr/bin/env bash\nexit 23\n')
    await chmod(opensslPath, 0o755)
    for (const command of ['docker', 'psql']) {
      const commandPath = join(binDir, command)
      await writeFile(commandPath, '#!/usr/bin/env bash\nprintf called >> "$PROBE_MARKER"\n')
      await chmod(commandPath, 0o755)
    }
    await writeFile(join(repoRoot, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
    await writeFile(join(repoRoot, '.env'), 'export WORKTREE_DIR=stale\n')
    await writeFile(join(repoRoot, '.initialized'), 'web\n')
    vi.stubEnv('PATH', `${binDir}:${process.env.PATH}`)
    vi.stubEnv('PROBE_MARKER', probeMarker)

    const input = collectDbBackedTestSetupInput(repoRoot, {
      DATABASE_URL: 'postgres://localhost/voucha-test',
      VALKEY_CONTAINER: 'voucha-valkey-test',
    })
    const result = evaluateDbBackedTestSetup(input)

    expect(input.identityProbe).toMatchObject({ checked: true, ok: false })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      expect.stringContaining('Worktree resource identity is unavailable'),
    ])
    await expect(readFile(probeMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('classifies a disposable full clone as non-main', async () => {
    const repoRoot = await makeRoot('clone')
    await mkdir(join(repoRoot, '.git'))

    const input = collectDbBackedTestSetupInput(repoRoot, {}, { probeServices: false })

    expect(input.isMainWorktree).toBe(false)
    expect(input.worktreeDir).toMatch(/^d[0-9a-f]{12}$/)
  })

  it('keeps the protected main checkout identity human-readable', async () => {
    const repoRoot = await makeRoot('protected-main')
    const isolatedTmp = await makeRoot('isolated-tmp')
    await mkdir(join(repoRoot, '.git'))
    vi.stubEnv('TMPDIR', isolatedTmp)

    const input = collectDbBackedTestSetupInput(repoRoot, {}, { probeServices: false })

    expect(input.isMainWorktree).toBe(true)
    expect(input.worktreeDir).toBe('protected-main')
  })

  it('accepts initialized environments for every supported checkout shape', async () => {
    const linked = await makeRoot('linked-environment')
    const disposableClone = await makeRoot('disposable-environment')
    await writeFile(join(linked, '.git'), 'gitdir: /fake/.git/worktrees/linked\n')
    await mkdir(join(disposableClone, '.git'))
    await expectAcceptedInitializedEnvironment(linked)
    await expectAcceptedInitializedEnvironment(disposableClone)

    const protectedMain = await makeRoot('main-environment')
    const isolatedTmp = await makeRoot('main-isolated-tmp')
    await mkdir(join(protectedMain, '.git'))
    vi.stubEnv('TMPDIR', isolatedTmp)
    await expectAcceptedInitializedEnvironment(protectedMain)
  })

  it('accepts a backend-capability .initialized marker for DB/Valkey-backed tests', async () => {
    const repoRoot = await makeRoot('backend-environment')
    await mkdir(join(repoRoot, '.git'))

    await expectAcceptedInitializedEnvironment(repoRoot, 'backend')
  })

  it('rejects a monorepo-only .initialized marker for DB/Valkey-backed tests', async () => {
    const repoRoot = await makeRoot('monorepo-environment')
    await mkdir(join(repoRoot, '.git'))
    await writeFile(join(repoRoot, '.initialized'), 'monorepo\n')
    await writeFile(
      join(repoRoot, '.env'),
      'export DATABASE_URL=postgres://localhost/voucha-test\n',
    )
    const { worktreeDir } = collectDbBackedTestSetupInput(repoRoot, {}, { probeServices: false })

    const input = collectDbBackedTestSetupInput(
      repoRoot,
      {
        DATABASE_URL: 'postgres://localhost/voucha-test',
        VALKEY_CONTAINER: 'voucha-valkey-test',
        WORKTREE_DIR: worktreeDir,
      },
      { probeServices: false },
    )
    const result = evaluateDbBackedTestSetup(input)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      expect.stringContaining(
        'DB/Valkey-backed tests require backend or web initialization; current .initialized mode is "monorepo"',
      ),
    ])
  })
})
