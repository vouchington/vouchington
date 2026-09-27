import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { verifyImageProvenance } from './image-provenance-verify.mts'
import { buildImageAttestationVerifyArgs } from './image-provenance.mts'

const sourceDigest = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
const request = { target: 'api' as const, mode: 'main-reuse' as const, sourceDigest, digest }
async function fakeGh(body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'image-provenance-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const executable = join(directory, 'gh')
  await writeFile(executable, `#!${process.execPath}\n${body}\n`)
  await chmod(executable, 0o700)
  return executable
}

describe('image provenance CLI boundary', () => {
  it('passes exact argv to an actual subprocess and parses its signed envelope', async () => {
    const certificate = {
      sourceRepositoryURI: 'https://github.com/vouchington/vouchington',
      sourceRepositoryOwnerURI: 'https://github.com/vouchington',
      sourceRepositoryDigest: sourceDigest,
      buildSignerDigest: sourceDigest,
      sourceRepositoryRef: 'refs/heads/main',
      issuer: 'https://token.actions.githubusercontent.com',
      runnerEnvironment: 'github-hosted',
      subjectAlternativeName:
        'https://github.com/vouchington/vouchington/.github/workflows/publish-backend-images.yml@refs/heads/main',
    }
    const envelope = [
      {
        verificationResult: {
          signature: { certificate },
          statement: {
            predicateType: 'https://slsa.dev/provenance/v1',
            subject: [{ name: 'ghcr.io/vouchington/api', digest: { sha256: digest.slice(7) } }],
          },
        },
      },
    ]
    const executable = await fakeGh(`
      if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(buildImageAttestationVerifyArgs(request)))}) process.exit(7)
      process.stdout.write(${JSON.stringify(JSON.stringify(envelope))})
    `)
    expect(await verifyImageProvenance(request, { ghExecutable: executable })).toEqual([
      { sourceRef: 'refs/heads/main', sourceDigest, digest },
    ])
  })
  it('fails closed on nonzero exit and never exposes child output', async () => {
    const executable = await fakeGh(
      'process.stderr.write("credential-secret"); process.stdout.write("credential-secret"); process.exit(9)',
    )
    const failure: unknown = await verifyImageProvenance(request, {
      ghExecutable: executable,
    }).catch((error: unknown) => error)
    expect(failure).toEqual(new Error('image provenance verification process failed'))
    expect(failure).not.toHaveProperty('cause')
  })
  it('kills a child that ignores SIGTERM at the deadline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'image-provenance-pid-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    const pidFile = join(directory, 'pid')
    const executable = await fakeGh(
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`,
    )
    await expect(
      verifyImageProvenance(request, { ghExecutable: executable, timeoutMs: 5000 }),
    ).rejects.toThrow('image provenance verification process failed')
    const pid = Number(await readFile(pidFile, 'utf8'))
    expect(() => execFileSync('/bin/kill', ['-0', String(pid)], { stdio: 'ignore' })).toThrow(Error)
  })
  it('awaits an ignored-SIGTERM child exit when the caller cancels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'image-provenance-cancel-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    const pidFile = join(directory, 'pid')
    const executable = await fakeGh(
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`,
    )
    const controller = new AbortController()
    const verification = verifyImageProvenance(request, {
      ghExecutable: executable,
      signal: controller.signal,
    })
    const observed = verification.catch((error: unknown) => error)
    while (!(await readFile(pidFile, 'utf8').catch(() => ''))) await new Promise(setImmediate)
    controller.abort()

    expect(await observed).toEqual(new Error('image provenance verification process failed'))
    const pid = Number(await readFile(pidFile, 'utf8'))
    expect(() => execFileSync('/bin/kill', ['-0', String(pid)], { stdio: 'ignore' })).toThrow(Error)
  })
  it('fails closed on signal termination and executable errors', async () => {
    const executable = await fakeGh('process.kill(process.pid, "SIGKILL")')
    await expect(verifyImageProvenance(request, { ghExecutable: executable })).rejects.toThrow(
      'image provenance verification process failed',
    )
    await expect(
      verifyImageProvenance(request, { ghExecutable: `${executable}-absent` }),
    ).rejects.toThrow('image provenance verification process failed')
  })
  it('bounds stdout and stderr without exposing their contents', async () => {
    for (const stream of ['stdout', 'stderr']) {
      const executable = await fakeGh(`process.${stream}.write('credential-secret'.repeat(10000))`)
      await expect(
        verifyImageProvenance(request, { ghExecutable: executable, maxOutputBytes: 1024 }),
      ).rejects.toThrow('image provenance verification process failed')
    }
  })
  it('distinguishes malformed JSON from policy rejection', async () => {
    const malformed = await fakeGh('process.stdout.write("credential-secret")')
    await expect(verifyImageProvenance(request, { ghExecutable: malformed })).rejects.toThrow(
      'image provenance verifier returned malformed JSON',
    )
    const empty = await fakeGh('process.stdout.write("[]")')
    await expect(verifyImageProvenance(request, { ghExecutable: empty })).rejects.toThrow(
      'verification results are empty',
    )
  })
  it('rejects invalid bounds and requests before starting a child', async () => {
    for (const timeoutMs of [0, -1, 60_001, Number.NaN, 0.5])
      await expect(verifyImageProvenance(request, { timeoutMs })).rejects.toThrow(
        'invalid image provenance verifier bounds',
      )
    for (const maxOutputBytes of [0, -1, 4 * 1024 * 1024 + 1, Number.NaN, 0.5])
      await expect(verifyImageProvenance(request, { maxOutputBytes })).rejects.toThrow(
        'invalid image provenance verifier bounds',
      )
    await expect(verifyImageProvenance({ ...request, sourceDigest: 'invalid' })).rejects.toThrow(
      'invalid immutable image provenance request',
    )
  })
})
