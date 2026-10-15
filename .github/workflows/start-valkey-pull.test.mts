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
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'valkey-pull-control-'))
  directories.push(dir)
  const docker = join(dir, 'docker')
  const calls = join(dir, 'calls.jsonl')
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
  if (args[1].startsWith('mirror.gcr.io/')) {
    if (process.env.MIRROR_ERROR) console.error(process.env.MIRROR_ERROR);
    process.exit(Number(process.env.MIRROR_EXIT));
  }
  if (Number(process.env.CANONICAL_EXIT)) console.error(process.env.CANONICAL_ERROR);
  process.exit(Number(process.env.CANONICAL_EXIT));
}
if (args[0] === 'run') process.exit(Number(process.env.RUN_EXIT));
if (args[0] === 'port') console.log('127.0.0.1:32123');
`,
  )
  await chmod(docker, 0o755)
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
      MIRROR_ERROR: options.error ?? '',
      MIRROR_EXIT: String(options.mirrorExit ?? 0),
      CANONICAL_EXIT: String(options.canonicalExit ?? 0),
      CANONICAL_ERROR: options.canonicalError ?? 'canonical pull failure',
      RUN_EXIT: String(options.runExit ?? 0),
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
  return { ...result, calls: recorded, output: await readFile(output, 'utf8') }
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

  it('does not classify a pull deadline exit as missing content', async () => {
    const result = await start({ error: missingContent, mirrorExit: 124 })
    expect(result.code).toBe(124)
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
})
