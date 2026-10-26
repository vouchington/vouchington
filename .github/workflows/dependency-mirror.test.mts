import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)
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
  await writeFile(
    regctl,
    `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n')
const statePath = process.env.STATE
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}
const save = () => fs.writeFileSync(statePath, JSON.stringify(state))
const expected = ref => ref.includes('example/one') ? '${first}' : '${second}'
if (args[0] === 'registry' && args[1] === 'login') process.exit(0)
if (args[0] === 'image' && args[1] === 'digest') {
  const ref = args[2]
  if (ref.includes('ghcr.io/') && process.env.AUTH_LOOKUP_FAILURE === '1') {
    console.error('unauthorized [http 401]')
    process.exit(1)
  }
  if (ref.startsWith('docker.io/') || ref.startsWith('gcr.io/')) {
    console.log(expected(ref))
    process.exit(0)
  }
  if (ref.includes(':sha-') && process.env.POISONED_APPROVED === '1') {
    console.log('sha256:' + 'f'.repeat(64))
    process.exit(0)
  }
  const value = state[ref] || (ref.includes('@sha256:') && Object.entries(state).some(([key, digest]) =>
    key.startsWith(ref.split('@')[0] + ':') && digest === ref.split('@')[1]) ? ref.split('@')[1] : '')
  if (!value) {
    console.error('failed to request manifest head ' + ref + ': request failed: not found [http 404]:')
    process.exit(1)
  }
  console.log(value)
  process.exit(0)
}
if (args[0] === 'image' && args[1] === 'copy') {
  const src = args.at(-2)
  const dst = args.at(-1)
  if (dst.startsWith('ocidir://') && dst.includes('entry-' + process.env.FAIL_STAGE)) process.exit(17)
  if (dst.startsWith('ocidir://') && dst.includes('/verify-') && process.env.FAIL_ROUNDTRIP === '1') process.exit(21)
  const digest = state[src] || (src.includes('@sha256:') ? src.split('@')[1] : '')
  if (!digest) process.exit(18)
  state[dst] = digest
  save()
  process.exit(0)
}
process.exit(19)
`,
    { mode: 0o755 },
  )
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
    },
  }).then(
    value => ({ code: 0, ...value }),
    (err: Error & { code: number; stdout: string; stderr: string }) => ({
      code: err.code,
      stdout: err.stdout,
      stderr: err.stderr,
    }),
  )
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

  it('publishes the reviewed distroless GCR source through the same verified path', async () => {
    const distroless = {
      package: 'dependency-distroless-nodejs',
      source: 'gcr.io/distroless/nodejs26-debian13',
      tag: 'nonroot',
      digest: second,
    }
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
  })

  it.each(['quay.io/distroless/nodejs26-debian13', 'gcr.io/unreviewed/nodejs26-debian13'])(
    'rejects an unreviewed source registry or repository: %s',
    async source => {
      const result = await runMirror({
        images: [
          { package: 'dependency-distroless-nodejs', source, tag: 'nonroot', digest: second },
        ],
      })
      expect(result.code).toBe(2)
      expect(result.stderr).toContain('Invalid or duplicate reviewed dependency image entry')
      expect(result.calls).toEqual([])
    },
  )

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

  it('exposes every reviewed source digest to Renovate for a reviewable PR', async () => {
    const config = await readFile('ci/dependency-mirror/images.json', 'utf8')
    const renovate = JSON.parse(await readFile('renovate.json', 'utf8')) as {
      customManagers: Array<{ managerFilePatterns?: string[]; matchStrings?: string[] }>
      packageRules: Array<{ matchFileNames?: string[]; schedule?: string[] }>
    }
    const manager = renovate.customManagers.find(item =>
      item.managerFilePatterns?.includes('ci/dependency-mirror/images.json'),
    )
    expect(manager?.matchStrings).toHaveLength(1)
    const matches = [...config.matchAll(new RegExp(manager!.matchStrings![0]!, 'gu'))]
    expect(matches).toHaveLength(JSON.parse(config).images.length)
    expect(matches.every(match => match.groups?.currentDigest?.startsWith('sha256:'))).toBe(true)
    expect(
      renovate.packageRules.some(
        rule =>
          rule.matchFileNames?.includes('ci/dependency-mirror/images.json') &&
          rule.schedule?.includes('at any time'),
      ),
    ).toBe(true)
  })

  it('runs only from reviewed main and keeps dependency packages out of runtime cleanup', async () => {
    const workflow = parse(await readFile('.github/workflows/dependency-mirror.yml', 'utf8')) as {
      on: Record<string, unknown>
      jobs: {
        mirror: {
          if: string
          permissions: Record<string, string>
          steps: Array<{ with?: { ref?: string } }>
        }
      }
    }
    expect(Object.keys(workflow.on).toSorted()).toEqual(['schedule', 'workflow_dispatch'])
    expect(workflow.jobs.mirror.if).toBe("github.ref == 'refs/heads/main'")
    expect(workflow.jobs.mirror.steps[0]?.with?.ref).toBe('main')
    expect(workflow.jobs.mirror.permissions.packages).toBe('write')
    const cleanup = await readFile('.github/workflows/ghcr-cleanup.yml', 'utf8')
    expect(cleanup).not.toContain('dependency-')
  })
})
