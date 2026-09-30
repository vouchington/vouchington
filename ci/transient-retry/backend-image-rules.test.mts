import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'

import { RULES, type WorkflowRunContext } from './rules.mts'

const publishJobName = 'publish-backend-images / build'
const ruleId = 'main-backend-image-registry-layer-blob-not-found'
const bakeActionSha = 'd3418bd7d0e9324001bca92fa8ba175ea7e6dc9b'
const imageDigest = 'ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1'
const missingBlob = 'a33f55a38b0ef0b49d06c83b190116234edee22d651586ccfa0f82dbf922c9bd'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

function publishLine(message: string): string {
  return `${publishJobName}\tUNKNOWN STEP\t2026-09-30T03:52:47.2213745Z ${message}`
}

function blobNotFoundAnnotation(target = 'worker-cpu'): string {
  return publishLine(
    `##[error]buildx bake failed with: ERROR: target ${target}: failed to solve: failed to compute cache key: failed to copy: httpReadSeeker: failed open: could not fetch content descriptor sha256:${missingBlob} (application/vnd.oci.image.layer.v1.tar+gzip) from remote: not found`,
  )
}

// Trimmed from Main CI (backend) run 36665766568, job publish-backend-images / build.
// Buildx resolved node:26-trixie-slim, then mirror.gcr.io returned not found for one layer blob.
const registryLayerBlobNotFoundLog = [
  publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
  publishLine(
    '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl api worker-cpu',
  ),
  publishLine(`#8 resolve mirror.gcr.io/library/node:26-trixie-slim@sha256:${imageDigest} done`),
  publishLine(
    `#9 ERROR: failed to copy: httpReadSeeker: failed open: could not fetch content descriptor sha256:${missingBlob} (application/vnd.oci.image.layer.v1.tar+gzip) from remote: not found`,
  ),
  blobNotFoundAnnotation(),
].join('\n')

function publishContext(log: string, overrides: Partial<WorkflowRunContext> = {}) {
  return makeCtx({
    workflowName: 'Main CI (backend)',
    failedJobNames: [publishJobName],
    failedJobLogs: () => Promise.resolve(new Map([[publishJobName, log]])),
    ...overrides,
  })
}

describe('Main CI backend image registry layer blob not found', () => {
  it('reruns the observed registry layer blob 404 once', async () => {
    const result = await decide(publishContext(registryLayerBlobNotFoundLog), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe(ruleId)
  })

  it('does not match the same log on a different workflow', async () => {
    const result = await decide(
      publishContext(registryLayerBlobNotFoundLog, { workflowName: 'Backend' }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another job failed', async () => {
    const result = await decide(
      publishContext(registryLayerBlobNotFoundLog, {
        failedJobNames: [publishJobName, 'test-backend-unit / backend-tests (1)'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a cancelled run', async () => {
    const result = await decide(
      publishContext(registryLayerBlobNotFoundLog, { conclusion: 'cancelled' }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a Dockerfile apt failure after bake started', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      publishLine(
        '##[error]buildx bake failed with: ERROR: target api: failed to solve: process "/bin/sh -c apt-get update" did not complete successfully: exit code: 100',
      ),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a local build-context cache key miss', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      publishLine(
        '##[error]buildx bake failed with: ERROR: target api: failed to solve: failed to compute cache key: "/app/missing": not found',
      ),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a missing base-image tag', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      publishLine(
        '##[error]buildx bake failed with: ERROR: target api: failed to solve: mirror.gcr.io/library/node:missing: not found',
      ),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a docker pull connection reset', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      publishLine(
        '##[error]buildx bake failed with: ERROR: target worker-cpu: failed to solve: failed to copy: httpReadSeeker: failed open: read tcp: connection reset by peer',
      ),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the blob 404 without the bake command', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      blobNotFoundAnnotation(),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the blob 404 without the bake-action step', async () => {
    const log = [
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      blobNotFoundAnnotation(),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a blob 404 mixed with another error', async () => {
    const log = [
      publishLine(`##[group]Run docker/bake-action@${bakeActionSha}`),
      publishLine(
        '[command]/usr/bin/docker buildx bake --allow fs=* --file ./backend/docker-bake.hcl',
      ),
      blobNotFoundAnnotation(),
      publishLine('##[error]Process completed with exit code 1.'),
    ].join('\n')
    const result = await decide(publishContext(log), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after this rule has already rerun once', async () => {
    const result = await decide(
      publishContext(registryLayerBlobNotFoundLog, {
        runAttempt: 2,
        ruleAttempts: new Map([[ruleId, 2]]),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
