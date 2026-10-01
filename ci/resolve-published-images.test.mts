import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const SCRIPT = resolve('ci/resolve-published-images.sh')
const SHA = 'a'.repeat(40)

// Each fake logs its target, then fails as the scenario asks.
const FAKE_DOCKER = `#!/usr/bin/env bash
target=\${3#ghcr.io/*/}; target=\${target%%:*}
echo "docker $target $3" >> "$CALLS_PATH"
case " $FAKE_MISSING " in *" $target "*) echo 'manifest unknown' >&2; exit 1 ;; esac
if [ -n "$FAKE_INSPECT_ERROR" ]; then echo "$FAKE_INSPECT_ERROR" >&2; exit 1; fi
`
const FAKE_GH = `#!/usr/bin/env bash
target=\${3#oci://ghcr.io/*/}; target=\${target%%:*}
echo "gh $target" >> "$CALLS_PATH"
printf '%s\\n' "$@" > "$ARGS_DIR/$target"
case " $FAKE_UNTRUSTED " in *" $target "*) echo 'verification failed' >&2; exit 1 ;; esac
`

type Scenario = {
  group?: string
  inspectError?: string
  missing?: string[]
  untrusted?: string[]
  workerIo?: string
}

describe('resolve-published-images', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function run(scenario: Scenario = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-resolve-images-'))
    dirs.push(dir)
    const bin = join(dir, 'bin')
    const argsDir = join(dir, 'args')
    await mkdir(join(dir, '.github'))
    await Promise.all([mkdir(bin), mkdir(argsDir)])
    await writeFile(
      join(dir, '.github/worker-io-automation.env'),
      `WORKER_IO_AUTOMATION_ENABLED=${scenario.workerIo ?? 'false'}\n`,
    )
    await writeFile(join(bin, 'docker'), FAKE_DOCKER)
    await writeFile(join(bin, 'gh'), FAKE_GH)
    await Promise.all([chmod(join(bin, 'docker'), 0o755), chmod(join(bin, 'gh'), 0o755)])
    const paths = { calls: join(dir, 'calls'), output: join(dir, 'output') }

    const result = await execFileAsync(SCRIPT, [scenario.group ?? 'backend'], {
      cwd: dir,
      env: {
        ARGS_DIR: argsDir,
        CALLS_PATH: paths.calls,
        FAKE_INSPECT_ERROR: scenario.inspectError ?? '',
        FAKE_MISSING: (scenario.missing ?? []).join(' '),
        FAKE_UNTRUSTED: (scenario.untrusted ?? []).join(' '),
        GITHUB_OUTPUT: paths.output,
        GITHUB_REPOSITORY: 'vouchington/vouchington',
        GITHUB_REPOSITORY_OWNER: 'vouchington',
        GITHUB_SHA: SHA,
        GITHUB_STEP_SUMMARY: join(dir, 'summary'),
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      },
    }).then(
      value => ({ ok: true as const, ...value }),
      (err: { stderr: string }) => ({ ok: false as const, stderr: err.stderr }),
    )
    const read = (path: string) => readFile(path, 'utf8').catch(() => '')
    const calls = (await read(paths.calls)).trim().split('\n').filter(Boolean)
    const ghArgs = async (target: string) => (await read(join(argsDir, target))).split('\n')
    return { calls, ghArgs, output: await read(paths.output), result }
  }

  it('reuses every present image only after it verifies against this commit', async () => {
    const { calls, ghArgs, output, result } = await run()

    expect(result.ok).toBe(true)
    expect(output).toBe('missing_targets=[]\n')
    expect(calls).toEqual([
      `docker api ghcr.io/vouchington/api:sha-${SHA}`,
      'gh api',
      `docker worker-cpu ghcr.io/vouchington/worker-cpu:sha-${SHA}`,
      'gh worker-cpu',
    ])
    const args = await ghArgs('api')
    expect(args.slice(0, 3)).toEqual([
      'attestation',
      'verify',
      `oci://ghcr.io/vouchington/api:sha-${SHA}`,
    ])
    for (const flag of ['--source-digest', '--signer-digest'])
      expect(args[args.indexOf(flag) + 1]).toBe(SHA)
    expect(args).toContain('--deny-self-hosted-runners')
    expect(args).toContain('--bundle-from-oci')
    expect(args[args.indexOf('--repo') + 1]).toBe('vouchington/vouchington')
  })

  it('accepts only the group publisher signing from main or the merge queue', async () => {
    const { ghArgs } = await run()
    const args = await ghArgs('api')
    const identity = new RegExp(args[args.indexOf('--cert-identity-regex') + 1] ?? '$^', 'u')
    const signer = 'https://github.com/vouchington/vouchington/.github/workflows'

    expect(identity.test(`${signer}/publish-backend-images.yml@refs/heads/main`)).toBe(true)
    expect(
      identity.test(
        `${signer}/publish-backend-images.yml@refs/heads/gh-readonly-queue/main/pr-1-b`,
      ),
    ).toBe(true)
    for (const rejected of [
      `${signer}/publish-backend-images.yml@refs/heads/feature`,
      `${signer}/publish-backend-images.yml@refs/pull/1/merge`,
      `${signer}/publish-web-images.yml@refs/heads/main`,
      `https://github.com/fork/vouchington/.github/workflows/publish-backend-images.yml@refs/heads/main`,
    ])
      expect(identity.test(rejected)).toBe(false)
  })

  it('reports an absent image for the fallback without verifying it', async () => {
    const { calls, output, result } = await run({ missing: ['worker-cpu'] })

    expect(result.ok).toBe(true)
    expect(output).toBe('missing_targets=["worker-cpu"]\n')
    expect(calls).not.toContain('gh worker-cpu')
    expect(result.ok && result.stdout).toContain('::warning::')
  })

  it('fails closed when a present image lacks trusted provenance', async () => {
    const { output, result } = await run({ untrusted: ['api'] })

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('without trusted provenance')
    expect(output).toBe('')
  })

  it('fails closed on any registry error other than an absent manifest', async () => {
    const { calls, output, result } = await run({
      inspectError: 'unauthorized: authentication required',
    })

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('unauthorized')
    expect(calls.filter(call => call.startsWith('gh'))).toEqual([])
    expect(output).toBe('')
  })

  it.each([
    ['backend', 'true', ['api', 'worker-cpu', 'worker-io']],
    ['web', 'true', ['web']],
  ])('checks the active %s targets', async (group, workerIo, targets) => {
    const { calls, result } = await run({ group, workerIo })

    expect(result.ok).toBe(true)
    expect(calls.filter(call => call.startsWith('gh')).map(call => call.slice(3))).toEqual(targets)
  })

  it.each([
    [{ workerIo: 'maybe' }, 'must be true or false'],
    [{ group: 'lambda' }, 'usage'],
  ])('rejects invalid configuration %j', async (scenario, message) => {
    const { calls, result } = await run(scenario)

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain(message)
    expect(calls).toEqual([])
  })
})
