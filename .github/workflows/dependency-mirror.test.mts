import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const regctlDouble = resolve('ci/dependency-mirror/regctl-double.sh')
const directories: string[] = []
const first = `sha256:${'a'.repeat(64)}`
const second = `sha256:${'b'.repeat(64)}`
const images = [
  { package: 'dependency-one', source: 'docker.io/example/one', tag: 'v1', digest: first },
  { package: 'dependency-two', source: 'docker.io/example/two', tag: 'v2', digest: second },
]

async function runMirror(
  options: {
    images?: Array<{ package: string; source: string; tag: string; digest: string }>
    failStage?: number
    poisonedApproved?: boolean
    authLookupFailure?: boolean
    failRoundtrip?: boolean
    existingCandidate?: boolean
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'dependency-mirror-test-'))
  directories.push(directory)
  const config = join(directory, 'images.json')
  const regctl = join(directory, 'regctl')
  const calls = join(directory, 'calls.jsonl')
  const summary = join(directory, 'summary.md')
  await writeFile(config, JSON.stringify({ schemaVersion: 1, images: options.images ?? images }))
  if (options.existingCandidate) {
    await writeFile(
      join(directory, 'state.json'),
      JSON.stringify({ [`ghcr.io/vouchington/dependency-one:candidate-${first.slice(7)}`]: first }),
    )
  }
  await copyFile(regctlDouble, regctl)
  await chmod(regctl, 0o755)
  const result = await exec('bash', ['ci/dependency-mirror/sync.sh', config], {
    env: {
      ...process.env,
      REGCTL: regctl,
      GHCR_OWNER: 'vouchington',
      GHCR_TOKEN: 'synthetic-token',
      GITHUB_ACTOR: 'synthetic-actor',
      GITHUB_STEP_SUMMARY: summary,
      RUNNER_TEMP: directory,
      CALLS: calls,
      STATE: join(directory, 'state.json'),
      FAIL_STAGE: String(options.failStage ?? 0),
      POISONED_APPROVED: options.poisonedApproved ? '1' : '0',
      AUTH_LOOKUP_FAILURE: options.authLookupFailure ? '1' : '0',
      FAIL_ROUNDTRIP: options.failRoundtrip ? '1' : '0',
      EXPECTED_FIRST: first,
      EXPECTED_SECOND: second,
    },
  })
    .then(value => ({ code: 0, ...value }))
    .catch((err: unknown) => {
      if (
        !(err instanceof Error) ||
        !('code' in err) ||
        typeof err.code !== 'number' ||
        !('stdout' in err) ||
        typeof err.stdout !== 'string' ||
        !('stderr' in err) ||
        typeof err.stderr !== 'string'
      )
        throw err
      return { code: err.code, stdout: err.stdout, stderr: err.stderr }
    })
  const callLog = (await readFile(calls, 'utf8').catch(() => '')).trim()
  const recorded = callLog ? callLog.split('\n').map(line => JSON.parse(line) as string[]) : []
  return { ...result, calls: recorded }
}

describe('reviewed CI dependency mirror', () => {
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('stages every complete index before using the GHCR write credential', async () => {
    const result = await runMirror({ failStage: 2 })
    expect(result.code).toBe(17)
    expect(result.calls.filter(call => call[0] === 'registry')).toEqual([])
    expect(result.calls.filter(call => call[0] === 'image' && call[1] === 'copy')).toHaveLength(2)
    expect(result.calls.some(call => call.join(' ').includes('ghcr.io/'))).toBe(false)
  })

  it('accepts every entry in the committed inventory', async () => {
    const inventory = JSON.parse(await readFile('ci/dependency-mirror/images.json', 'utf8')) as {
      images: Array<{ package: string; source: string; tag: string; digest: string }>
    }
    const result = await runMirror({ images: inventory.images })
    expect(result.stderr).not.toContain('Invalid or duplicate reviewed dependency image entry')
    expect(result.calls.length).toBeGreaterThan(0)
  })

  it.each([['dependency-distroless-cc', 'gcr.io/distroless/cc-debian13']])(
    'publishes the reviewed distroless GCR source %s through the same verified path',
    async (pkg, source) => {
      const distroless = { package: pkg, source, tag: 'nonroot', digest: second }
      const result = await runMirror({ images: [distroless] })
      expect(result.code).toBe(0)
      const copies = result.calls.filter(call => call[0] === 'image' && call[1] === 'copy')
      expect(copies.some(call => call.at(-2) === `${distroless.source}@${distroless.digest}`)).toBe(
        true,
      )
      expect(
        copies.some(
          call => call.at(-2) === `ghcr.io/vouchington/${distroless.package}@${distroless.digest}`,
        ),
      ).toBe(true)
    },
  )

  it.each([
    'quay.io/distroless/cc-debian13',
    'gcr.io/unreviewed/cc-debian13',
    'gcr.io/distroless/nodejs26-debian13',
  ])('rejects an unreviewed source registry or repository: %s', async source => {
    const result = await runMirror({
      images: [{ package: 'dependency-distroless-cc', source, tag: 'nonroot', digest: second }],
    })
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Invalid or duplicate reviewed dependency image entry')
    expect(result.calls).toEqual([])
  })

  it('verifies candidates before immutable approved tags and retains every digest', async () => {
    const result = await runMirror()
    expect(result.code).toBe(0)
    const calls = result.calls.map(call => call.join(' '))
    const login = calls.findIndex(call => call.startsWith('registry login'))
    expect(login).toBeGreaterThan(
      calls.findLastIndex(
        call => call.startsWith('image copy') && /ocidir:\/\/.*:entry-\d+$/u.test(call),
      ),
    )
    for (const image of images) {
      const candidate = `ghcr.io/vouchington/${image.package}:candidate-${image.digest.slice(7)}`
      const approved = `ghcr.io/vouchington/${image.package}:sha-${image.digest.slice(7)}`
      const candidateCopy = calls.findIndex(
        call => call.startsWith('image copy') && call.endsWith(candidate),
      )
      const candidateVerify = calls.findIndex(
        (call, index) => index > candidateCopy && call === `image digest ${candidate}`,
      )
      const approvedCopy = calls.findIndex(
        call => call.startsWith('image copy') && call.endsWith(approved),
      )
      const tracked = `ghcr.io/vouchington/${image.package}:${image.tag}`
      const trackedCopy = calls.findIndex(
        call => call.startsWith('image copy') && call.endsWith(tracked),
      )
      const roundtripCopy = calls.findIndex(
        call =>
          call.startsWith('image copy') &&
          call.includes(`ghcr.io/vouchington/${image.package}@${image.digest}`),
      )
      expect(candidateCopy).toBeGreaterThan(login)
      expect(candidateVerify).toBeGreaterThan(candidateCopy)
      expect(approvedCopy).toBeGreaterThan(candidateVerify)
      expect(roundtripCopy).toBeGreaterThan(approvedCopy)
      expect(trackedCopy).toBeGreaterThan(roundtripCopy)
    }
    expect(calls.some(call => /\bdelete\b|\btag rm\b/u.test(call))).toBe(false)
  })

  it('fails closed on an occupied immutable tag with different bytes', async () => {
    const result = await runMirror({ poisonedApproved: true })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Immutable approved tag has a different digest')
    expect(result.calls.some(call => call.join(' ').includes('candidate-'))).toBe(false)
  })

  it('repairs an existing candidate recursively before approving its digest', async () => {
    const result = await runMirror({ existingCandidate: true })
    expect(result.code).toBe(0)
    const candidate = `ghcr.io/vouchington/dependency-one:candidate-${first.slice(7)}`
    expect(
      result.calls.some(
        call =>
          call[0] === 'image' &&
          call[1] === 'copy' &&
          call.includes('--force-recursive') &&
          call.at(-2)?.startsWith('ocidir://') &&
          call.at(-1) === candidate,
      ),
    ).toBe(true)
  })

  it('does not publish after an authentication or registry lookup error', async () => {
    const result = await runMirror({ authLookupFailure: true })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('unauthorized [http 401]')
    expect(
      result.calls.some(
        call => call[0] === 'image' && call[1] === 'copy' && call.at(-1)?.startsWith('ghcr.io/'),
      ),
    ).toBe(false)
  })

  it('does not advance a tracked tag when GHCR cannot return all copied layers', async () => {
    const result = await runMirror({ failRoundtrip: true })
    expect(result.code).toBe(21)
    expect(
      result.calls.some(
        call =>
          call[0] === 'image' &&
          call[1] === 'copy' &&
          call.at(-1) === `ghcr.io/vouchington/${images[0]!.package}:${images[0]!.tag}`,
      ),
    ).toBe(false)
  })
})
