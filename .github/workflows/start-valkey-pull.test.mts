import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)
const directories: string[] = []
const action = parse(await readFile('.github/actions/start-valkey/action.yml', 'utf8')) as {
  runs: { steps: Array<{ env: Record<string, string>; run: string }> }
}
const step = action.runs.steps[0]!
const image = step.env.VALKEY_IMAGE!
const canonical = image.replace(/^mirror\.gcr\.io\//u, 'docker.io/')
const missingContent =
  'error pulling image configuration: download failed after attempts=1: unknown blob'

async function start(
  options: {
    error?: string
    mirrorExit?: number
    canonicalExit?: number
    canonicalError?: string
    runExit?: number
    teeFailure?: boolean
    scaledDeadline?: boolean
    mirrorDelay?: number
    cancelMirror?: boolean
    canonicalDelay?: number
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'valkey-pull-control-'))
  directories.push(dir)
  const docker = join(dir, 'docker')
  const calls = join(dir, 'calls.jsonl')
  const pids = join(dir, 'pull-pids')
  const output = join(dir, 'output')
  const envFile = join(dir, 'environment')
  await writeFile(output, '')
  await writeFile(envFile, '')
  await writeFile(
    docker,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'pull') {
  fs.appendFileSync(process.env.PULL_PIDS, process.pid + '\\n');
  if (args[1].startsWith('mirror.gcr.io/')) {
    if (process.env.CANCEL_MIRROR === '1') process.kill(-Number(process.env.ACQUISITION_GROUP), 'SIGTERM');
    if (process.env.MIRROR_ERROR) console.error(process.env.MIRROR_ERROR);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.MIRROR_DELAY));
    process.exit(Number(process.env.MIRROR_EXIT));
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.CANONICAL_DELAY));
  if (Number(process.env.CANONICAL_EXIT)) console.error(process.env.CANONICAL_ERROR);
  process.exit(Number(process.env.CANONICAL_EXIT));
}
if (args[0] === 'run') process.exit(Number(process.env.RUN_EXIT));
if (args[0] === 'port') console.log('127.0.0.1:32123');
`,
  )
  await chmod(docker, 0o755)
  if (options.scaledDeadline) {
    const timeout = join(dir, 'timeout')
    await writeFile(
      timeout,
      `#!/usr/bin/env bash
if [ "$1" = '--foreground' ]; then
  shift 4
  exec /usr/bin/timeout --foreground --signal=USR1 --kill-after=0.1s 1s "$@"
fi
if [ "$1" = '--kill-after=2s' ] && [ "$2" = '50s' ]; then
  shift 2
  exec /usr/bin/timeout --kill-after=0.1s 2s bash -c '
    read -r pid comm state parent ACQUISITION_GROUP rest < /proc/self/stat
    export ACQUISITION_GROUP
    exec "$@"
  ' _ "$@"
fi
exec /usr/bin/timeout "$@"
`,
    )
    await chmod(timeout, 0o755)
  }
  if (options.teeFailure) {
    const tee = join(dir, 'tee')
    await writeFile(tee, '#!/usr/bin/env bash\n/usr/bin/tee "$@"\nexit 1\n')
    await chmod(tee, 0o755)
  }
  const result = await exec('bash', ['-c', step.run], {
    timeout: 5000,
    env: {
      ...process.env,
      ...step.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      GITHUB_WORKSPACE: process.cwd(),
      GITHUB_ENV: envFile,
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: dir,
      CALLS: calls,
      PULL_PIDS: pids,
      CANCEL_MIRROR: options.cancelMirror ? '1' : '0',
      MIRROR_ERROR: options.error ?? '',
      MIRROR_EXIT: String(options.mirrorExit ?? 0),
      CANONICAL_EXIT: String(options.canonicalExit ?? 0),
      CANONICAL_ERROR: options.canonicalError ?? 'canonical pull failure',
      RUN_EXIT: String(options.runExit ?? 0),
      MIRROR_DELAY: String(options.mirrorDelay ?? 0),
      CANONICAL_DELAY: String(options.canonicalDelay ?? 0),
    },
  }).then(
    value => ({ code: 0, ...value }),
    (err: Error & { code: number; stdout: string; stderr: string }) => ({
      code: err.code,
      stdout: err.stdout,
      stderr: err.stderr,
    }),
  )
  const recorded = (await readFile(calls, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as string[])
  return {
    ...result,
    calls: recorded,
    pullPids: (await readFile(pids, 'utf8')).trim().split('\n').map(Number),
    output: await readFile(output, 'utf8'),
    environment: await readFile(envFile, 'utf8'),
  }
}

describe('Valkey image acquisition and single container start', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the mirror without a fallback when acquisition succeeds', async () => {
    const result = await start()
    expect(result.code).toBe(0)
    expect(result.calls.filter(call => call[0] === 'pull')).toEqual([['pull', image]])
    const runs = result.calls.filter(call => call[0] === 'run')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toContain('--pull=never')
    expect(runs[0]?.at(-1)).toBe(image)
    expect(result.output).toBe('url=redis://127.0.0.1:32123\n')
    expect(result.environment).toBe('VALKEY_URL=redis://127.0.0.1:32123\n')
    expect(result.calls.filter(call => call[0] === 'logs')).toEqual([])
  })

  it('falls back once for missing content, retaining the first error and exact digest', async () => {
    const result = await start({ error: missingContent, mirrorExit: 1 })
    expect(result.code).toBe(0)
    expect(result.stderr).toContain(missingContent)
    expect(result.calls.filter(call => call[0] === 'pull')).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    const runs = result.calls.filter(call => call[0] === 'run')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toContain('--pull=never')
    expect(runs[0]?.at(-1)).toBe(canonical)
  })

  it('preserves both failures and never starts a container if canonical acquisition fails', async () => {
    const result = await start({ error: missingContent, mirrorExit: 1, canonicalExit: 17 })
    expect(result.code).toBe(17)
    expect(result.stderr).toContain(missingContent)
    expect(result.stderr).toContain('canonical pull failure')
    expect(result.calls).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(result.output).toBe('')
  })

  it.each([
    'unauthorized: authentication required',
    'net/http: TLS handshake timeout',
    'Cannot connect to the Docker daemon',
    'manifest unknown',
    `${missingContent}\nunauthorized: authentication required`,
  ])('does not fall back or start for an unrecognized final failure: %s', async error => {
    const result = await start({ error, mirrorExit: 1 })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(error)
    expect(result.calls).toEqual([['pull', image]])
    expect(result.output).toBe('')
  })

  it.each([124, 137])('does not classify Docker exit %s as our deadline', async mirrorExit => {
    const result = await start({ error: missingContent, mirrorExit })
    expect(result.code).toBe(mirrorExit)
    expect(result.calls).toEqual([['pull', image]])
  })

  it('recovers the exact bare missing-blob wording once and rejects a second missing blob', async () => {
    const recovered = await start({ error: 'docker: unknown blob', mirrorExit: 1 })
    expect(recovered.code).toBe(0)
    expect(recovered.calls.filter(call => call[0] === 'pull')).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(recovered.calls.filter(call => call[0] === 'run')).toHaveLength(1)
    const failed = await start({
      error: 'docker: unknown blob',
      mirrorExit: 1,
      canonicalExit: 1,
      canonicalError: 'unknown blob',
    })
    expect(failed.code).toBe(1)
    expect(
      failed.stderr
        .split('\n')
        .filter(line => line === 'docker: unknown blob' || line === 'unknown blob'),
    ).toEqual(['docker: unknown blob', 'unknown blob'])
    expect(failed.calls).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(failed.output).toBe('')
  })

  it('does not retry container creation after a successful pull', async () => {
    const result = await start({ runExit: 125 })
    expect(result.code).toBe(125)
    expect(result.calls.filter(call => call[0] === 'pull')).toEqual([['pull', image]])
    expect(result.calls.filter(call => call[0] === 'run')).toHaveLength(1)
    expect(result.output).toBe('')
  })
  it('cancels the acquisition group without fallback or an orphaned pull', async () => {
    const result = await start({ scaledDeadline: true, cancelMirror: true, mirrorDelay: 2300 })
    for (const pid of result.pullPids)
      await expect(exec('bash', ['-c', 'kill -0 "$1"', 'kill-check', String(pid)])).rejects.toThrow(
        'No such process',
      )
    expect(result.code).not.toBe(0)
    expect(result.calls).toEqual([['pull', image]])
    expect(result.output).toBe('')
  })
  it('recovers a stalled mirror once before the shared acquisition deadline', async () => {
    const result = await start({ scaledDeadline: true, mirrorDelay: 2300 })
    for (const pid of result.pullPids)
      await expect(exec('bash', ['-c', 'kill -0 "$1"', 'kill-check', String(pid)])).rejects.toThrow(
        'No such process',
      )
    expect(result.code).toBe(0)
    expect(result.calls.filter(call => call[0] === 'pull')).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(result.calls.filter(call => call[0] === 'run')).toHaveLength(1)
  })
  it('allows a fallback only within the remaining shared acquisition budget', async () => {
    const result = await start({
      error: missingContent,
      mirrorExit: 1,
      scaledDeadline: true,
      mirrorDelay: 500,
      canonicalDelay: 1800,
    })
    expect(result.code).toBe(124)
    expect(result.stderr).toContain(missingContent)
    expect(result.calls).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(result.output).toBe('')
    expect(result.environment).toBe('')
  })
  it('never starts a container when both registry attempts exhaust the acquisition budget', async () => {
    const result = await start({
      error: missingContent,
      mirrorExit: 1,
      scaledDeadline: true,
      mirrorDelay: 2300,
      canonicalDelay: 2300,
    })
    expect(result.code).toBe(124)
    expect(result.stderr).toContain(missingContent)
    expect(result.calls).toEqual([
      ['pull', image],
      ['pull', canonical],
    ])
    expect(result.output).toBe('')
    expect(result.environment).toBe('')
  })

  it('fails closed when diagnostics fail instead of mistaking tee status for pull status', async () => {
    const result = await start({ error: missingContent, teeFailure: true })
    expect(result.code).toBe(125)
    expect(result.stderr).toContain(missingContent)
    expect(result.stderr).toContain('diagnostics failed (docker=0, tee=1)')
    expect(result.calls).toEqual([['pull', image]])
    expect(result.output).toBe('')
  })
})
