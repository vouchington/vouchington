import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

describe('lint-links', () => {
  const execFileAsync = promisify(execFile)
  const lintLinksPath = fileURLToPath(new URL('lint-links.sh', import.meta.url))
  const testDirs: string[] = []

  function cleanGitEnv() {
    const env = { ...process.env }

    delete env.GIT_DIR
    delete env.GIT_INDEX_FILE
    delete env.GIT_PREFIX
    delete env.GIT_WORK_TREE

    return env
  }

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-lint-links-'))
    testDirs.push(dir)

    await writeFile(join(dir, 'README.md'), '# README\n\nhttps://example.com\n')
    await writeFile(join(dir, 'lychee.toml'), 'exclude_path = []\n')
    return dir
  }

  /**
   * Creates a fake lychee binary that appends its args (one per line) to
   * $LYCHEE_CAPTURE, then writes a "===" separator. Both passes write to the
   * same file so the caller can split on "===\n" to inspect each pass.
   *
   * Set LYCHEE_FAIL_PASS to "offline" to fail the internal pass, "external" to
   * fail the external pass, or "all" to fail every invocation.
   */
  async function makeFakeLycheeBin() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-lychee-bin-'))
    testDirs.push(dir)
    const lycheePath = join(dir, 'lychee')

    await writeFile(
      lycheePath,
      `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$LYCHEE_CAPTURE"
printf '===\\n' >> "$LYCHEE_CAPTURE"
is_offline=false
for arg in "$@"; do
  [ "$arg" = "--offline" ] && is_offline=true
done
case "\${LYCHEE_FAIL_PASS:-}" in
  all) exit 1 ;;
  offline) if [ "$is_offline" = "true" ]; then exit 1; fi ;;
  external) if [ "$is_offline" = "false" ]; then exit 1; fi ;;
esac
exit 0
`,
    )
    await chmod(lycheePath, 0o755)

    const gitPath = join(dir, 'git')
    await writeFile(
      gitPath,
      '#!/usr/bin/env bash\nset -euo pipefail\nif [ "${1:-}" = "-C" ]; then shift 2; fi\nif [ "${1:-}" = "ls-files" ]; then\n  printf \'README.md\\0\'\n  exit 0\nfi\nprintf \'unexpected fake git invocation: %s\\n\' "$*" >&2\nexit 2\n',
    )
    await chmod(gitPath, 0o755)

    return dir
  }

  async function runLintLinks(
    args: string[],
    cwd: string,
    failPass?: 'offline' | 'external' | 'all',
  ): Promise<{ captured: string; stdout: string; exitCode: number }> {
    const fakeBin = await makeFakeLycheeBin()
    const capturePath = join(fakeBin, 'lychee-args.txt')

    let stdout = ''
    let exitCode = 0

    try {
      const result = await execFileAsync('/bin/bash', [lintLinksPath, ...args], {
        cwd,
        env: {
          ...cleanGitEnv(),
          LYCHEE_CAPTURE: capturePath,
          LYCHEE_FAIL_PASS: failPass ?? '',
          PATH: [fakeBin, process.env.PATH].filter(Boolean).join(':'),
        },
      })
      stdout = result.stdout
    } catch (error: unknown) {
      const execError = error as { stdout?: string; code?: number }
      stdout = execError.stdout ?? ''
      exitCode = execError.code ?? 1
    }

    const captured = await readFile(capturePath, 'utf8').catch(() => '')
    return { captured, stdout, exitCode }
  }

  it('does not cache transient server errors', async () => {
    await expect(readFile('lychee.toml', 'utf8')).resolves.toContain(
      'cache_exclude_status = "500.."',
    )
  })

  it(
    'runs two passes: internal (--offline + --include-fragments) then external (--scheme http/https)',
    { timeout: 15_000 },
    async () => {
      const dir = await makeRepo()
      const { captured, exitCode } = await runLintLinks([], dir)

      expect(exitCode).toBe(0)

      const [pass1, pass2] = captured.split('===\n')

      // Pass 1: offline + fragments, no scheme filter
      expect(pass1).toContain('--offline\n')
      expect(pass1).toContain('--include-fragments\n')
      expect(pass1).not.toContain('--scheme\n')
      expect(pass1).toContain('README.md\n')

      // Pass 2: scheme-filtered, no offline
      expect(pass2).toContain('--scheme\nhttp\n')
      expect(pass2).toContain('--scheme\nhttps\n')
      expect(pass2).not.toContain('--offline\n')
      expect(pass2).toContain('README.md\n')
    },
  )

  it(
    'hard-fails the script when the internal link check (offline pass) fails',
    { timeout: 15_000 },
    async () => {
      const dir = await makeRepo()
      const { exitCode } = await runLintLinks([], dir, 'offline')

      expect(exitCode).not.toBe(0)
    },
  )

  it(
    'exits zero and emits a ::warning:: when the external link check fails',
    { timeout: 15_000 },
    async () => {
      const dir = await makeRepo()
      const { exitCode, stdout } = await runLintLinks([], dir, 'external')

      expect(exitCode).toBe(0)
      expect(stdout).toContain('::warning')
    },
  )

  it(
    'skips the external pass when --offline is passed (offline mode)',
    { timeout: 15_000 },
    async () => {
      const dir = await makeRepo()
      const { captured, exitCode } = await runLintLinks(['--offline'], dir)

      expect(exitCode).toBe(0)

      // Exactly one "===" separator means only pass 1 ran
      const parts = captured.split('===\n')
      expect(parts.length).toBe(2)

      // Pass 1 runs with --offline and --include-fragments
      expect(parts[0]).toContain('--offline\n')
      expect(parts[0]).toContain('--include-fragments\n')
    },
  )

  it('forwards non-offline options to both passes', { timeout: 15_000 }, async () => {
    const dir = await makeRepo()
    const { captured } = await runLintLinks(['--verbose'], dir)

    const [pass1, pass2] = captured.split('===\n')
    expect(pass1).toContain('--verbose\n')
    expect(pass2).toContain('--verbose\n')
  })
})
