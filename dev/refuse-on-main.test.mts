import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { runSourcedBash, sourceBashArgs } from './test-helpers/initialize.mts'

describe('refuse-on-main', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/refuse-on-main.sh', import.meta.url))

  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeToplevel() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-refuse-on-main-'))
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
    forceMainReset = false,
    explicitRepoRoot = false,
    cwd = gitToplevel,
    prepareToplevel = true,
    processTmpdir,
    extraEnv = {},
  }: {
    gitToplevel: string
    isMainWorktree: boolean
    forceMainReset?: boolean
    explicitRepoRoot?: boolean
    cwd?: string
    prepareToplevel?: boolean
    processTmpdir?: string
    extraEnv?: Record<string, string | undefined>
  }): Promise<{ code: number | null; stderr: string; stdout: string }> {
    if (prepareToplevel) {
      if (isMainWorktree) {
        await mkdir(join(gitToplevel, '.git'), { recursive: true })
      } else {
        await writeFile(join(gitToplevel, '.git'), `gitdir: /fake/.git/worktrees/test\n`)
      }
    }

    const script = `
  git() {
    if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
      [ -d "$2" ] || return 1
      printf '%s' "$2"
      return 0
    fi
    case "$*" in
      'rev-parse --show-toplevel') pwd -P ;;
      *) command git "$@" ;;
    esac
  }

  refuse_on_main "test-script" "$1"
  printf 'cwd:%s' "$(pwd -P)"
  `

    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v
    }
    if (forceMainReset) {
      env.FORCE_MAIN_RESET = '1'
    } else {
      delete env.FORCE_MAIN_RESET
    }
    if (processTmpdir !== undefined) {
      env.TMPDIR = processTmpdir
    }
    for (const [key, value] of Object.entries(extraEnv)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }

    const result = await runSourcedBash(helperPath, script, [explicitRepoRoot ? gitToplevel : ''], {
      cwd,
      env,
    })
    return { code: result.code, stderr: result.stderr, stdout: result.stdout }
  }

  describe('refuse_on_main', () => {
    it('exits 1 when .git is a directory (main worktree)', async () => {
      const gitToplevel = await makeToplevel()
      const { code, stderr } = await run({
        gitToplevel,
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
      })
      expect(code).toBe(1)
      expect(stderr).toContain('refuses to run on the main worktree')
      expect(stderr).toContain('FORCE_MAIN_RESET=1')
    })

    it('exits 0 when .git is a directory under .grok/worktrees', async () => {
      const { code, stderr } = await run({
        gitToplevel: await makeGrokToplevel(),
        isMainWorktree: true,
        processTmpdir: await makeIsolatedTmp(),
      })
      expect(code).toBe(0)
      expect(stderr).not.toContain('WARNING')
      expect(stderr).not.toContain('refuses to run on the main worktree')
    })

    it('exits 0 when .git is a directory under TMPDIR', async () => {
      const gitToplevel = await makeToplevel()
      const { code, stderr } = await run({
        gitToplevel,
        isMainWorktree: true,
        processTmpdir: await realpath(tmpdir()),
      })
      expect(code).toBe(0)
      expect(stderr).not.toContain('WARNING')
      expect(stderr).not.toContain('refuses to run on the main worktree')
    })

    it('treats TMP as the process temp directory when TMPDIR is unset', async () => {
      const processTmp = await makeIsolatedTmp()
      const gitToplevel = join(processTmp, 'clone')
      await mkdir(gitToplevel, { recursive: true })
      const { code, stderr } = await run({
        gitToplevel,
        isMainWorktree: true,
        extraEnv: { TMPDIR: undefined, TMP: processTmp, TEMP: undefined },
      })
      expect(code).toBe(0)
      expect(stderr).not.toContain('WARNING')
    })

    it('treats a trailing-slash TMPDIR as a directory prefix, not a string prefix', async () => {
      const processTmpdir = `${await makeIsolatedTmp()}/`
      const child = join(processTmpdir, 'clone')
      await mkdir(child, { recursive: true })
      testDirs.push(child)

      const allowed = await run({
        gitToplevel: child,
        isMainWorktree: true,
        processTmpdir,
      })
      expect(allowed.code).toBe(0)
      expect(allowed.stderr).not.toContain('WARNING')

      const sibling = join(dirname(processTmpdir), `${basename(processTmpdir)}sibling`)
      await mkdir(sibling, { recursive: true })
      testDirs.push(sibling)

      const refused = await run({
        gitToplevel: sibling,
        isMainWorktree: true,
        processTmpdir,
      })
      expect(refused.code).toBe(1)
      expect(refused.stderr).toContain('refuses to run on the main worktree')
    })

    it('treats an empty toplevel and a missing TMPDIR as non-disposable', async () => {
      const missingTmp = join(await makeIsolatedTmp(), 'missing-tmp')
      const gitToplevel = await makeToplevel()
      const { code, stderr } = await run({
        gitToplevel,
        isMainWorktree: true,
        extraEnv: { TMPDIR: missingTmp, TMP: undefined, TEMP: undefined },
      })
      expect(code).toBe(1)
      expect(stderr).toContain('refuses to run on the main worktree')

      const empty = await execFileAsync(
        'bash',
        sourceBashArgs(helperPath, 'is_disposable_checkout_path "" && printf yes || printf no'),
      )
      expect(empty.stdout.trim()).toBe('no')
    })

    it('exits 0 when .git is a file (sub-worktree)', async () => {
      const gitToplevel = await makeToplevel()
      const { code } = await run({ gitToplevel, isMainWorktree: false })
      expect(code).toBe(0)
    })

    it('exits 0 with warning when FORCE_MAIN_RESET=1 on main worktree', async () => {
      const gitToplevel = await makeToplevel()
      const { code, stderr } = await run({
        gitToplevel,
        isMainWorktree: true,
        forceMainReset: true,
        processTmpdir: await makeIsolatedTmp(),
      })
      expect(code).toBe(0)
      expect(stderr).toContain('WARNING')
      expect(stderr).toContain('FORCE_MAIN_RESET=1')
    })

    it('uses an explicit repo root instead of the caller cwd', async () => {
      const mainToplevel = await makeToplevel()
      const callerToplevel = await makeToplevel()
      await writeFile(join(callerToplevel, '.git'), `gitdir: /fake/.git/worktrees/test\n`)

      const { code, stderr } = await run({
        gitToplevel: mainToplevel,
        isMainWorktree: true,
        explicitRepoRoot: true,
        cwd: callerToplevel,
        processTmpdir: await makeIsolatedTmp(),
      })

      expect(code).toBe(1)
      expect(stderr).toContain('refuses to run on the main worktree')
    })

    it('does not change cwd when using an explicit repo root', async () => {
      const mainToplevel = await makeToplevel()
      const callerToplevel = await makeToplevel()
      await writeFile(join(callerToplevel, '.git'), `gitdir: /fake/.git/worktrees/test\n`)

      const { code, stderr, stdout } = await run({
        gitToplevel: mainToplevel,
        isMainWorktree: true,
        explicitRepoRoot: true,
        forceMainReset: true,
        cwd: callerToplevel,
        processTmpdir: await makeIsolatedTmp(),
      })

      expect(code).toBe(0)
      expect(stderr).toContain('WARNING')
      expect(stdout).toBe(`cwd:${await realpath(callerToplevel)}`)
    })

    it('fails closed when an explicit repo root is unusable', async () => {
      const callerToplevel = await makeToplevel()
      await writeFile(join(callerToplevel, '.git'), `gitdir: /fake/.git/worktrees/test\n`)

      const { code, stderr } = await run({
        gitToplevel: join(callerToplevel, 'missing'),
        isMainWorktree: false,
        explicitRepoRoot: true,
        cwd: callerToplevel,
        prepareToplevel: false,
      })

      expect(code).toBe(1)
      expect(stderr).toContain('cannot inspect repo root')
      expect(stderr).toContain('Refusing to continue')
    })
  })
})
