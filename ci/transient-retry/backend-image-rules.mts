import type { TransientRetryRule } from './types.mts'

const publishBackendImagesJobName = 'publish-backend-images / build'
const mainBackendWorkflowName = 'Main CI (backend)'
const bakeActionGroupPattern = /##\[group\]Run docker\/bake-action@[0-9a-f]{40}\b/
const bakeCommandMarker = 'docker buildx bake'
const layerBlobNotFoundErrorPattern =
  /##\[error\]buildx bake failed with: ERROR: target [^:]+: failed to solve: failed to compute cache key: failed to copy: httpReadSeeker: failed open: could not fetch content descriptor sha256:[0-9a-f]{64} \([^)\n]+\) from remote: not found$/

function hasRegistryLayerBlobNotFound(log: string): boolean {
  if (!bakeActionGroupPattern.test(log)) return false
  if (!log.includes(bakeCommandMarker)) return false

  const errorLines = log.split('\n').filter(line => line.includes('##[error]'))
  if (errorLines.length !== 1) return false
  return layerBlobNotFoundErrorPattern.test((errorLines[0] ?? '').trim())
}

function isOnlyFailedPublishBackendImagesJob(ctx: {
  workflowName: string
  conclusion: string
  failedJobNames: string[]
}): boolean {
  return (
    ctx.workflowName === mainBackendWorkflowName &&
    ctx.conclusion === 'failure' &&
    ctx.failedJobNames.length === 1 &&
    ctx.failedJobNames[0] === publishBackendImagesJobName
  )
}

export const mainBackendImageRegistryLayerBlobNotFoundRule: TransientRetryRule = {
  id: 'main-backend-image-registry-layer-blob-not-found',
  consumerKey: 'build-backend-images-bake',
  rootCauseKey: 'registry-layer-blob-not-found',
  description:
    'Main CI backend image publication fails while docker buildx bake is copying a base-image layer because the registry reports that content descriptor as not found.',
  rationale:
    'Buildx already resolved the image manifest and started the bake. A single layer-blob 404 from the remote is a registry mirror miss, not a Dockerfile, apt, or local build-context failure. The same publish job succeeds on a later main run without an image change. One rerun is enough; a repeat is investigated.',
  exampleRunIds: ['36665766568'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedPublishBackendImagesJob(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasRegistryLayerBlobNotFound(logs.get(publishBackendImagesJobName) ?? '')
  },
}
