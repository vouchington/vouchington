import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'

const execFileAsync = promisify(execFile)
const scriptPath = 'ci/diagnose-browser-port-collision.sh'
const wrapper = readFileSync(scriptPath, 'utf8')
const script = readFileSync(
  execFileSync(
    'bash',
    ['ci/vouchington-tooling-script.sh', 'scripts/gha/diagnose-port-collision.sh'],
    {
      encoding: 'utf8',
    },
  ),
  'utf8',
)

async function openEphemeralListener(): Promise<{
  server: ReturnType<typeof createServer>
  port: number
}> {
  const server = createServer()
  const port = await listenOnEphemeralPort(server, '127.0.0.1')
  return { server, port }
}

async function writeExecutable(directory: string, name: string, source: string): Promise<void> {
  const path = join(directory, name)
  await writeFile(path, source)
  await chmod(path, 0o755)
}

async function linkExecutable(directory: string, name: string): Promise<void> {
  const { stdout } = await execFileAsync('which', [name])
  await symlink(stdout.trim(), join(directory, name))
}

describe('browser port diagnostics', () => {
  it('reports a forced listener collision without failing the diagnostic command', async () => {
    const { server, port } = await openEphemeralListener()
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    try {
      const result = await execFileAsync('bash', [
        scriptPath,
        '--ports',
        String(port),
        '--output-dir',
        outputDir,
      ])
      const listeners = await readFile(join(outputDir, 'listeners.txt'), 'utf8')
      expect(result.stderr).toBe('')
      expect(listeners).toContain(`port=${port}`)
      expect(listeners).toContain('status=occupied')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('keeps collection non-masking when a probe input is malformed', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    try {
      const result = await execFileAsync('bash', [
        scriptPath,
        '--ports',
        'not-a-port',
        '--output-dir',
        outputDir,
      ])
      const summary = await readFile(join(outputDir, 'summary.txt'), 'utf8')
      expect(result.stderr).toBe('')
      expect(summary).toContain('invalid_ports=not-a-port')
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('reports a released selected port as free or unobserved', async () => {
    const { server, port } = await openEphemeralListener()
    await new Promise<void>(resolve => server.close(() => resolve()))
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    try {
      await execFileAsync('bash', [scriptPath, '--ports', String(port), '--output-dir', outputDir])
      const listeners = await readFile(join(outputDir, 'listeners.txt'), 'utf8')
      expect(listeners).toContain(`port=${port}`)
      expect(listeners).toContain('status=free-or-unobserved')
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('records unavailable host probes without failing', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    const executableDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-probes-'))
    for (const name of [
      'bash',
      'date',
      'dirname',
      'hostname',
      'id',
      'mkdir',
      'node',
      'python3',
      'tr',
      'uname',
    ]) {
      await linkExecutable(executableDir, name)
    }
    try {
      const result = await execFileAsync(
        'bash',
        [scriptPath, '--ports', '2200', '--output-dir', outputDir],
        { env: { ...process.env, PATH: executableDir } },
      )
      expect(result.stderr).toBe('')
      expect(await readFile(join(outputDir, 'listeners.txt'), 'utf8')).toContain(
        'probe=unavailable (neither lsof nor ss is installed)',
      )
      expect(await readFile(join(outputDir, 'docker.txt'), 'utf8')).toContain('docker=unavailable')
      expect(await readFile(join(outputDir, 'kernel.txt'), 'utf8')).toContain('sysctl=unavailable')
    } finally {
      await rm(outputDir, { recursive: true, force: true })
      await rm(executableDir, { recursive: true, force: true })
    }
  })

  it('reports only lsof sockets whose local endpoint uses the selected port', async () => {
    const { server, port } = await openEphemeralListener()
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    const executableDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-probes-'))
    const remoteMatch = `127.0.0.1:41000->127.0.0.1:${port}`
    const localMatch = `127.0.0.1:${port}->127.0.0.1:41001`
    await writeExecutable(
      executableDir,
      'lsof',
      `#!/usr/bin/env bash
echo 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME'
echo 'node 1 user 10u IPv4 0x1 0t0 TCP ${remoteMatch} (ESTABLISHED)'
echo 'node 2 user 11u IPv4 0x2 0t0 TCP ${localMatch} (ESTABLISHED)'
`,
    )
    try {
      await execFileAsync(
        'bash',
        [scriptPath, '--ports', String(port), '--output-dir', outputDir],
        {
          env: { ...process.env, PATH: `${executableDir}:${process.env.PATH}` },
        },
      )
      const listeners = await readFile(join(outputDir, 'listeners.txt'), 'utf8')
      expect(listeners).toContain(localMatch)
      expect(listeners).not.toContain(remoteMatch)
      expect(listeners).toContain('status=occupied')
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(outputDir, { recursive: true, force: true })
      await rm(executableDir, { recursive: true, force: true })
    }
  })

  it('returns non-masking partial evidence when the overall collector deadline elapses', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-diagnostics-'))
    const executableDir = await mkdtemp(join(tmpdir(), 'voucha-browser-port-probes-'))
    await writeExecutable(executableDir, 'lsof', '#!/usr/bin/env bash\nsleep 5\n')
    try {
      const result = await execFileAsync(
        'bash',
        [scriptPath, '--ports', '2200', '--output-dir', outputDir],
        {
          env: {
            ...process.env,
            BROWSER_PORT_DIAGNOSTICS_TIMEOUT_SECONDS: '0.5',
            PATH: `${executableDir}:${process.env.PATH}`,
          },
          timeout: 2000,
        },
      )
      expect(result.stderr).toContain('collector exceeded 0.5s')
      expect(await readFile(join(outputDir, 'summary.txt'), 'utf8')).toContain(
        'allocated_ports=2200',
      )
      expect(await readFile(join(outputDir, 'kernel.txt'), 'utf8')).toContain(
        '# Linux kernel port contract',
      )
    } finally {
      await rm(outputDir, { recursive: true, force: true })
      await rm(executableDir, { recursive: true, force: true })
    }
  })

  it('keeps the diagnose script wired to the vendored tooling loader', () => {
    // Unrelated to the composite-action wiring: this asserts on ci/diagnose-browser-port-collision.sh
    // and its vendored script directly, both of which remain in use as a direct dependency of
    // lambdas/dev-server.mts's bind-time collision capture (listenWithRetry).
    expect(wrapper).toContain('vouchington-tooling-script.sh')
    expect(wrapper).toContain('PORT_DIAGNOSTICS_')
    expect(wrapper).toContain('BROWSER_PORT_DIAGNOSTICS_')
    expect(script).toContain('lsof')
  })

  it('gives lambdas/dev-server.mts the exact directory the upload step globs', async () => {
    // The env var lambdas/dev-server.mts's listenWithRetry writes into and the workflow's
    // upload-artifact step must compute this path with the *same* GitHub Actions expression, not
    // equivalent-looking shell/expression logic that could silently diverge (e.g. github.job vs
    // $GITHUB_JOB under workflow_call). A byte-for-byte mismatch here means dev-server.mts writes
    // real collision evidence to a directory the upload step never globs — the artifact stays
    // empty and nothing fails, reproducing the exact silent-capture-loss bug this wiring exists
    // to fix.
    const directoryExpression =
      '${{ runner.temp }}/browser-port-diagnostics-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}'
    // All three callers of lambdas/dev-server.mts's listenWithRetry (both Playwright surfaces
    // via shared-config.mts's webServer, and the image-lambda smoke script directly) must set
    // this env var with the byte-identical expression the upload step in the same job globs, or
    // one silently loses bind-time evidence.
    const anchors = [
      ['.github/workflows/tests-playwright.yml', 'name: Run Playwright'],
      ['.github/workflows/tests-playwright-credentialed.yml', 'name: Run Playwright'],
      ['.github/workflows/checks-static.yml', 'name: Smoke test image lambda'],
    ] as const
    for (const [path, anchor] of anchors) {
      const workflow = await readFile(path, 'utf8')
      const runStep = workflow.indexOf(anchor)
      expect(runStep).toBeGreaterThan(-1)
      expect(
        workflow.indexOf(`BROWSER_PORT_DIAGNOSTICS_DIR: ${directoryExpression}`, runStep),
      ).toBeGreaterThan(runStep)
      expect(workflow.indexOf(`path: ${directoryExpression}`, runStep)).toBeGreaterThan(runStep)
    }
  })
})
