import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const allocatorPath = resolve('ci/allocate-browser-safe-ports.py')
function loadAllocatorPrelude() {
  return `import importlib.util; spec = importlib.util.spec_from_file_location('allocator', ${JSON.stringify(allocatorPath)}); allocator = importlib.util.module_from_spec(spec); spec.loader.exec_module(allocator);`
}

async function runPython(code: string) {
  return execFile('python3', ['-B', '-c', `${loadAllocatorPrelude()}${code}`])
}

function legacyPidPath(workspace: string) {
  const digest = createHash('sha256').update(realpathSync(workspace)).digest('hex')
  return join('/tmp', `voucha-port-hold-${digest}`, 'pid')
}

// pnpm 12 writes a leading document that locks pnpm itself under its own root importer.
const lockfileFixture = `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: 12.6.0
        version: 12.6.0

packages:

  pnpm@12.6.0:
    resolution: {integrity: sha512-pnpm-placeholder}

---
lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vouchington-tooling:
        specifier: ^9.9.9
        version: 9.9.9

packages:

  vouchington-tooling@9.9.9:
    resolution: {integrity: sha512-placeholder}
`

describe('vouchington-tooling consume wrappers', () => {
  it('uses the lockfile integrity download before any cached GitHub Actions script', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gha-trust-'))
    const ciDir = join(dir, 'ci')
    const runnerTemp = join(dir, 'runner-temp')
    const cacheDir = join(runnerTemp, 'vouchington-gha-scripts', '9.9.9', 'scripts/gha')
    const marker = join(dir, 'ran.txt')
    const calls = join(dir, 'pnpm-calls.txt')
    const downloadUrl = join(dir, 'download-url.txt')
    const bin = join(dir, 'bin')
    await mkdir(bin)
    await mkdir(ciDir)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { 'vouchington-tooling': '^9.9.9' } }),
    )
    await writeFile(join(dir, 'pnpm-lock.yaml'), lockfileFixture)
    await writeFile(
      join(ciDir, 'exec-vouchington-gha.sh'),
      readFileSync(resolve('ci/exec-vouchington-gha.sh')),
    )
    await writeFile(
      join(ciDir, 'curl-to.sh'),
      `ci_download_to() {
  printf '%s\\n' "$1" > "$DOWNLOAD_URL"
  return 1
}
`,
    )
    await writeFile(
      join(cacheDir, 'clean-workspace.sh'),
      `#!/usr/bin/env bash\nprintf ran > "${marker}"\n`,
    )
    await writeFile(join(bin, 'pnpm'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$PNPM_CALLS"\n')
    await chmod(join(bin, 'pnpm'), 0o755)
    await chmod(join(ciDir, 'exec-vouchington-gha.sh'), 0o755)
    await chmod(join(cacheDir, 'clean-workspace.sh'), 0o700)
    try {
      await expect(
        execFile(
          'bash',
          [
            join(ciDir, 'exec-vouchington-gha.sh'),
            'clean-workspace',
            'scripts/gha/clean-workspace.sh',
          ],
          {
            cwd: dir,
            env: {
              ...process.env,
              DOWNLOAD_URL: downloadUrl,
              GITHUB_ACTIONS: 'true',
              PATH: `${bin}:${process.env.PATH ?? ''}`,
              PNPM_CALLS: calls,
              RUNNER_TEMP: runnerTemp,
            },
          },
        ),
      ).rejects.toThrow(/failed to download vouchington-tooling@9\.9\.9/)
      expect(await readFile(downloadUrl, 'utf8')).toContain('vouchington-tooling-9.9.9.tgz')
      expect(existsSync(marker)).toBe(false)
      expect(existsSync(calls)).toBe(false)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('downloads the exact root-importer lockfile version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tooling-installer-lock-'))
    const ciDir = join(dir, 'ci')
    const downloadUrl = join(dir, 'download-url.txt')
    const packageJson = join(dir, 'package.json')
    await mkdir(ciDir)
    await writeFile(
      packageJson,
      JSON.stringify({ devDependencies: { 'vouchington-tooling': '^9.9.9' } }),
    )
    await writeFile(join(dir, 'pnpm-lock.yaml'), lockfileFixture)
    await writeFile(
      join(ciDir, 'install-vouchington-tooling.sh'),
      readFileSync(resolve('ci/install-vouchington-tooling.sh')),
    )
    await writeFile(
      join(ciDir, 'curl-to.sh'),
      `ci_download_to() {
  printf '%s\\n' "$1" > "$DOWNLOAD_URL"
  return 1
}
`,
    )
    await chmod(join(ciDir, 'install-vouchington-tooling.sh'), 0o755)
    try {
      await expect(
        execFile(
          'bash',
          [join(ciDir, 'install-vouchington-tooling.sh'), join(dir, 'install'), packageJson],
          { cwd: dir, env: { ...process.env, DOWNLOAD_URL: downloadUrl } },
        ),
      ).rejects.toThrow(/failed to download vouchington-tooling@9\.9\.9/)
      expect(await readFile(downloadUrl, 'utf8')).toContain('vouchington-tooling-9.9.9.tgz')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('resolves the hold workspace from flags then PORT_HOLD, VOUCHA, GITHUB, and cwd', async () => {
    const { stdout } = await runPython(`
print(allocator.workspace_from_argv(['--workspace', '/tmp/from-flag']))
print(allocator.workspace_from_argv(['--workspace']))
`)
    expect(stdout.trim().split('\n')[0]).toBe('/tmp/from-flag')

    const cwd = realpathSync(await mkdtemp(join(tmpdir(), 'voucha-consume-cwd-')))
    try {
      const envCases = [
        { PORT_HOLD_WORKSPACE: '/tmp/from-port' },
        { VOUCHA_PORT_HOLD_WORKSPACE: '/tmp/from-voucha' },
        { GITHUB_WORKSPACE: '/tmp/from-github' },
        {},
      ]
      for (const extra of envCases) {
        const { stdout: value } = await execFile(
          'python3',
          ['-B', '-c', `${loadAllocatorPrelude()}print(allocator.workspace_from_argv([]))`],
          {
            cwd,
            env: {
              PATH: process.env.PATH,
              ...extra,
            },
          },
        )
        const expected =
          extra.PORT_HOLD_WORKSPACE ??
          extra.VOUCHA_PORT_HOLD_WORKSPACE ??
          extra.GITHUB_WORKSPACE ??
          cwd
        expect(value.trim()).toBe(expected)
      }
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })

  it(
    'reaps leftover /tmp/voucha-port-hold identity dirs for the current workspace',
    { timeout: 15_000 },
    async () => {
      const workspace = realpathSync(await mkdtemp(join(tmpdir(), 'voucha-consume-legacy-')))
      const pidPath = legacyPidPath(workspace)
      await mkdir(join(pidPath, '..'), { recursive: true })
      try {
        await runPython(`allocator.reap_legacy_voucha_identity(${JSON.stringify(workspace)})`)

        await writeFile(pidPath, 'not-a-pid\n')
        await runPython(`allocator.reap_legacy_voucha_identity(${JSON.stringify(workspace)})`)
        await expect(rm(pidPath)).rejects.toMatchObject({ code: 'ENOENT' })

        const waitForExit = async (child: ReturnType<typeof spawn>) => {
          try {
            await once(child, 'exit', { signal: AbortSignal.timeout(6000) })
            return true
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return false
            throw error
          }
        }

        const sleeper = spawn('sleep', ['30'])
        if (sleeper.pid === undefined) throw new Error('sleep pid missing')
        const sleeperExited = waitForExit(sleeper)
        await mkdir(join(pidPath, '..'), { recursive: true })
        await writeFile(pidPath, `${sleeper.pid}\n`)
        await runPython(`allocator.reap_legacy_voucha_identity(${JSON.stringify(workspace)})`)
        await expect(sleeperExited).resolves.toBe(true)
        await expect(rm(pidPath)).rejects.toMatchObject({ code: 'ENOENT' })

        const immune = spawn('python3', [
          '-c',
          'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)',
        ])
        if (immune.pid === undefined) throw new Error('immune pid missing')
        const immuneExited = waitForExit(immune)
        await mkdir(join(pidPath, '..'), { recursive: true })
        await writeFile(pidPath, `${immune.pid}\n`)
        await runPython(`allocator.reap_legacy_voucha_identity(${JSON.stringify(workspace)})`)
        await expect(immuneExited).resolves.toBe(true)
        await expect(rm(pidPath)).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await rm(join(pidPath, '..'), { force: true, recursive: true })
        await rm(workspace, { force: true, recursive: true })
      }
    },
  )
})
