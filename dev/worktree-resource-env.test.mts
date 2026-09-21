import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('worktree-resource-env', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/worktree-resource-env.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () =>
    Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true }))),
  )

  async function makeToplevel() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-resource-env-'))
    testDirs.push(dir)
    return dir
  }

  async function makeIsolatedTmp() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-isolated-tmp-'))
    testDirs.push(dir)
    return dir
  }

  async function makeGrokToplevel() {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-grok-parent-'))
    testDirs.push(parent)
    const dir = join(parent, '.grok', 'worktrees', 'clone')
    await mkdir(dir, { recursive: true })
    return dir
  }

  async function run({
    gitToplevel,
    isMainWorktree,
    processTmpdir,
    script,
  }: {
    gitToplevel: string
    isMainWorktree: boolean
    processTmpdir?: string
    script: string
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (isMainWorktree) {
      await mkdir(join(gitToplevel, '.git'), { recursive: true })
    } else {
      await writeFile(join(gitToplevel, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
    }

    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v
    }
    if (processTmpdir !== undefined) {
      env.TMPDIR = processTmpdir
    }

    try {
      const { stdout, stderr } = await execFileAsync('bash', sourceBashArgs(helperPath, script), {
        cwd: gitToplevel,
        env,
      })
      return { exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() }
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string }
      return {
        exitCode: typeof e.code === 'number' ? e.code : 1,
        stdout: (e.stdout ?? '').trim(),
        stderr: (e.stderr ?? '').trim(),
      }
    }
  }

  describe('worktree_resource_is_main', () => {
    it('is true for a protected .git directory', async () => {
      const { exitCode, stdout } = await run({
        gitToplevel: await makeToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          if worktree_resource_is_main "$(pwd -P)"; then
            printf 'main'
          else
            printf 'not-main'
          fi
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('main')
    })

    it('is false for a linked worktree .git file', async () => {
      const { exitCode, stdout } = await run({
        gitToplevel: await makeToplevel(),
        isMainWorktree: false,
        script: `
          if worktree_resource_is_main "$(pwd -P)"; then
            printf 'main'
          else
            printf 'not-main'
          fi
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('not-main')
    })

    it('is false for a .git directory under .grok/worktrees', async () => {
      const { exitCode, stdout } = await run({
        gitToplevel: await makeGrokToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          if worktree_resource_is_main "$(pwd -P)"; then
            printf 'main'
          else
            printf 'not-main'
          fi
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('not-main')
    })

    it('gives sibling tmp clones distinct resource identities', async () => {
      const processTmpdir = await makeIsolatedTmp()
      const first = join(processTmpdir, 'job-a', 'vouchington')
      const second = join(processTmpdir, 'job-b', 'vouchington')
      await mkdir(first, { recursive: true })
      await mkdir(second, { recursive: true })
      await mkdir(join(second, '.git'), { recursive: true })

      const { exitCode, stdout } = await run({
        gitToplevel: first,
        isMainWorktree: true,
        processTmpdir,
        script: `
          printf '%s %s' "$(worktree_resource_dir_from_path ${JSON.stringify(first)})" "$(worktree_resource_dir_from_path ${JSON.stringify(second)})"
        `,
      })
      expect(exitCode).toBe(0)
      const [firstId, secondId] = stdout.split(' ')
      expect(firstId).toMatch(/^d[0-9a-f]{12}$/)
      expect(secondId).toMatch(/^d[0-9a-f]{12}$/)
      expect(firstId).not.toBe(secondId)
    })

    it('names disposable database and Valkey resources from the path before .env exists', async () => {
      const gitToplevel = await makeGrokToplevel()
      const { exitCode, stdout } = await run({
        gitToplevel,
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          printf '%s %s' "$(worktree_resource_owned_db_name "$(pwd -P)")" "$(worktree_resource_owned_valkey_container "$(pwd -P)")"
        `,
      })
      expect(exitCode).toBe(0)
      const [dbName, container] = stdout.split(' ')
      expect(dbName).toMatch(/^voucha-d[0-9a-f]{12}$/)
      expect(container).toBe(`voucha-valkey-${dbName.slice('voucha-'.length)}`)
    })

    it('is false for a .git directory under TMPDIR', async () => {
      const { exitCode, stdout } = await run({
        gitToplevel: await makeToplevel(),
        isMainWorktree: true,
        processTmpdir: await realpath(tmpdir()),
        script: `
          if worktree_resource_is_main "$(pwd -P)"; then
            printf 'main'
          else
            printf 'not-main'
          fi
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('not-main')
    })
  })

  describe('worktree_resource_validate_backend_init', () => {
    it('rejects shared voucha resources on a disposable full clone', async () => {
      const gitToplevel = await makeGrokToplevel()
      await writeFile(
        join(gitToplevel, '.env'),
        `export DATABASE_URL=postgres://localhost/voucha
export VALKEY_CONTAINER=voucha-valkey
export WORKTREE_DIR=$(worktree_resource_current_dir "$(pwd -P)")
`,
      )
      await writeFile(join(gitToplevel, '.valkey-port'), '6379\n')

      const { exitCode, stdout } = await run({
        gitToplevel,
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          worktree_resource_validate_backend_init "$(pwd -P)"
          printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('1:main-resource')
    })

    it('still treats a protected main checkout as owning shared resources', async () => {
      const gitToplevel = await makeToplevel()
      await writeFile(
        join(gitToplevel, '.env'),
        `export DATABASE_URL=postgres://localhost/voucha
export VALKEY_CONTAINER=voucha-valkey
export WORKTREE_DIR=${basename(gitToplevel)}
`,
      )
      await writeFile(join(gitToplevel, '.valkey-port'), '6379\n')

      const { exitCode, stdout } = await run({
        gitToplevel,
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          worktree_resource_validate_backend_init "$(pwd -P)"
          printf '%s:%s' "$?" "$WORKTREE_RESOURCE_STATUS"
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('0:ok')
    })
  })

  // worktree_resource_validate_web_init coverage lives in
  // worktree-resource-env-web-init.test.mts to stay under the test-file line cap.

  describe('refuse_shared_resources_on_disposable', () => {
    it('exits 1 when a disposable clone still targets voucha', async () => {
      const { exitCode, stderr } = await run({
        gitToplevel: await makeGrokToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          export WORKTREE_DIR=$(worktree_resource_current_dir "$(pwd -P)")
          refuse_shared_resources_on_disposable "./dev/reset" "$(pwd -P)" "voucha" "voucha-valkey"
          printf 'allowed'
        `,
      })
      expect(exitCode).toBe(1)
      expect(stderr).toContain('refuses to operate on shared main resources')
    })

    it('requires WORKTREE_DIR on a disposable clone', async () => {
      const { exitCode, stderr } = await run({
        gitToplevel: await makeGrokToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `refuse_shared_resources_on_disposable "./dev/reset" "$(pwd -P)" "voucha-clone" "voucha-valkey-clone"`,
      })
      expect(exitCode).toBe(1)
      expect(stderr).toContain('another checkout')
    })
    it('allows a disposable clone with worktree-owned names', async () => {
      const { exitCode, stdout } = await run({
        gitToplevel: await makeGrokToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
        script: `
          export WORKTREE_DIR=$(worktree_resource_current_dir "$(pwd -P)")
          refuse_shared_resources_on_disposable "./dev/reset" "$(pwd -P)" "voucha-clone" "voucha-valkey-clone"
          printf 'allowed'
        `,
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe('allowed')
    })
  })
})
