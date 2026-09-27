import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import { resolveImagePromotion, type ImagePromotionRequest } from './image-promotion.mts'
import {
  fakePromotionGh,
  runtimeDigest,
  setupPromotionBoundaries,
  startPromotionRegistry,
} from './image-promotion-test-fixtures.mts'

const sourceSha = 'a'.repeat(40)
const credentials = { password: 'registry-secret', username: 'registry-user' }
const request = (overrides: Partial<ImagePromotionRequest> = {}): ImagePromotionRequest => ({
  credentials: { ...credentials },
  group: 'backend',
  mainReachableSourceSha: sourceSha,
  phase: 'plan',
  ...overrides,
})

describe('image promotion resolution', () => {
  it('resolves every selected target before verifying existing images or returning missing ones', async () => {
    const { eventLog, options } = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'missing' },
      'false',
    )

    await expect(resolveImagePromotion(request(), options)).resolves.toEqual({
      missingTargets: ['worker-cpu'],
      selectedTargets: ['api', 'worker-cpu'],
      verifiedImages: [{ digest: runtimeDigest, target: 'api' }],
    })
    const events = (await readFile(eventLog, 'utf8')).trim().split('\n')
    expect(events.slice(0, 2).sort()).toEqual(['registry:api', 'registry:worker-cpu'])
    expect(events.slice(2)).toEqual(['provenance:api'])
  })

  it('includes worker-io only when the authoritative backend flag enables it', async () => {
    const { options } = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'runtime', 'worker-io': 'missing' },
      'true',
    )
    await expect(resolveImagePromotion(request(), options)).resolves.toEqual({
      missingTargets: ['worker-io'],
      selectedTargets: ['api', 'worker-cpu', 'worker-io'],
      verifiedImages: [
        { digest: runtimeDigest, target: 'api' },
        { digest: runtimeDigest, target: 'worker-cpu' },
      ],
    })
  })

  it('keeps web independent from the unrelated worker-io flag', async () => {
    const { options } = await setupPromotionBoundaries({ web: 'missing' })
    await expect(resolveImagePromotion(request({ group: 'web' }), options)).resolves.toEqual({
      missingTargets: ['web'],
      selectedTargets: ['web'],
      verifiedImages: [],
    })
  })

  it('fails closed for protected and cryptographically untrusted existing images', async () => {
    const protectedSetup = await setupPromotionBoundaries(
      { api: 'protected', 'worker-cpu': 'missing' },
      'false',
    )
    await expect(resolveImagePromotion(request(), protectedSetup.options)).rejects.toThrow(
      'existing image is not a direct runtime manifest',
    )
    expect(await readFile(protectedSetup.eventLog, 'utf8')).not.toContain('provenance:')

    const untrustedSetup = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'missing' },
      'false',
      'untrusted',
    )
    await expect(resolveImagePromotion(request(), untrustedSetup.options)).rejects.toThrow(
      'verified attestation violates image provenance policy',
    )
  })

  it('rejects an incomplete final set before accepting any existing provenance', async () => {
    const { eventLog, options } = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'missing' },
      'false',
    )
    await expect(resolveImagePromotion(request({ phase: 'verify' }), options)).rejects.toThrow(
      'final image promotion set is incomplete',
    )
    expect(await readFile(eventLog, 'utf8')).not.toContain('provenance:')
  })

  it('requires every final target to exist with trusted provenance', async () => {
    const { options } = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'runtime' },
      'false',
    )
    await expect(resolveImagePromotion(request({ phase: 'verify' }), options)).resolves.toEqual({
      missingTargets: [],
      selectedTargets: ['api', 'worker-cpu'],
      verifiedImages: [
        { digest: runtimeDigest, target: 'api' },
        { digest: runtimeDigest, target: 'worker-cpu' },
      ],
    })
  })

  it('snapshots the request and external-boundary options before awaiting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'image-promotion-snapshot-'))
    onTestFinished(() => rm(directory, { force: true, recursive: true }))
    const eventLog = join(directory, 'events')
    let releaseToken!: () => void
    const tokenGate = new Promise<void>(resolve => {
      releaseToken = resolve
    })
    const boundary = await startPromotionRegistry({ web: 'runtime' }, eventLog, tokenGate)
    const ghExecutable = await fakePromotionGh(eventLog)
    const mutableRequest = request({ group: 'web' })
    const mutableOptions = {
      provenance: { ghExecutable },
      registry: { fetch: boundary.fetch },
      workspaceRoot: directory,
    }
    const pending = resolveImagePromotion(mutableRequest, mutableOptions)

    mutableRequest.group = 'backend'
    mutableRequest.mainReachableSourceSha = 'b'.repeat(40)
    mutableRequest.credentials.username = 'changed-user'
    mutableRequest.credentials.password = 'changed-secret'
    mutableOptions.provenance.ghExecutable = '/missing'
    mutableOptions.registry.fetch = async () => {
      throw new Error('mutated transport')
    }
    releaseToken()

    await expect(pending).resolves.toEqual({
      missingTargets: [],
      selectedTargets: ['web'],
      verifiedImages: [{ digest: runtimeDigest, target: 'web' }],
    })
    expect(boundary.authorizations[0]).toBe(
      `Basic ${Buffer.from('registry-user:registry-secret').toString('base64')}`,
    )
  })

  it('rejects malformed backend flags, source SHAs, and registry failures', async () => {
    const malformed = await setupPromotionBoundaries({ api: 'runtime' }, 'yes')
    await expect(resolveImagePromotion(request(), malformed.options)).rejects.toThrow(
      'worker-io automation flag is invalid',
    )
    await expect(
      resolveImagePromotion(request({ mainReachableSourceSha: 'invalid' }), malformed.options),
    ).rejects.toThrow('invalid image promotion request')
    const absent = await setupPromotionBoundaries({ api: 'runtime' })
    await expect(resolveImagePromotion(request(), absent.options)).rejects.toThrow(
      'worker-io automation flag is invalid',
    )

    const failed = await setupPromotionBoundaries(
      { api: 'failure', 'worker-cpu': 'missing' },
      'false',
    )
    await expect(resolveImagePromotion(request(), failed.options)).rejects.toThrow(
      'GHCR manifest resolution failed',
    )
    const verifierFailed = await setupPromotionBoundaries(
      { api: 'runtime', 'worker-cpu': 'missing' },
      'false',
    )
    verifierFailed.options.provenance.ghExecutable = '/missing'
    await expect(resolveImagePromotion(request(), verifierFailed.options)).rejects.toThrow(
      'image provenance verification process failed',
    )
  })
})
