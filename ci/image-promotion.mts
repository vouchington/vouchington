import {
  verifyImageProvenance,
  type ImageProvenanceVerifierOptions,
} from './image-provenance-verify.mts'
import {
  resolveGhcrManifest,
  type RegistryClientOptions,
  type RegistryManifestRequest,
  type RegistryTarget,
} from './image-registry.mts'
import { selectedImageTargets } from './image-targets.mts'

const SOURCE_SHA = /^[0-9a-f]{40}$/u

export type ImagePromotionRequest = {
  credentials: RegistryManifestRequest['credentials']
  group: 'backend' | 'web'
  mainReachableSourceSha: string
  phase: 'plan' | 'verify'
}

export type ImagePromotionResult = {
  missingTargets: RegistryTarget[]
  selectedTargets: RegistryTarget[]
  verifiedImages: Array<{ digest: string; target: RegistryTarget }>
}

export type ImagePromotionOptions = {
  provenance?: ImageProvenanceVerifierOptions
  registry?: RegistryClientOptions
  workspaceRoot?: string
}

function validateRequest(request: ImagePromotionRequest): void {
  if (
    !['backend', 'web'].includes(request.group) ||
    !['plan', 'verify'].includes(request.phase) ||
    !SOURCE_SHA.test(request.mainReachableSourceSha)
  )
    throw new Error('invalid image promotion request')
}

export async function resolveImagePromotion(
  request: ImagePromotionRequest,
  options: ImagePromotionOptions = {},
): Promise<ImagePromotionResult> {
  const immutableRequest: ImagePromotionRequest = {
    credentials: { ...request.credentials },
    group: request.group,
    mainReachableSourceSha: request.mainReachableSourceSha,
    phase: request.phase,
  }
  const immutableOptions = {
    provenance: { ...options.provenance },
    registry: { ...options.registry },
    workspaceRoot: options.workspaceRoot ?? process.cwd(),
  }
  validateRequest(immutableRequest)
  const targets = await selectedImageTargets(immutableRequest.group, immutableOptions.workspaceRoot)
  const resolutions = await Promise.all(
    targets.map(async target => ({
      manifest: await resolveGhcrManifest(
        {
          credentials: immutableRequest.credentials,
          reference: `sha-${immutableRequest.mainReachableSourceSha}`,
          target,
        },
        immutableOptions.registry,
      ),
      target,
    })),
  )
  for (const resolution of resolutions)
    if (resolution.manifest?.classification === 'protected')
      throw new Error(`existing image is not a direct runtime manifest: ${resolution.target}`)
  const missingTargets = resolutions
    .filter(resolution => resolution.manifest === null)
    .map(resolution => resolution.target)
  if (immutableRequest.phase === 'verify' && missingTargets.length > 0)
    throw new Error('final image promotion set is incomplete')
  await Promise.all(
    resolutions.flatMap(resolution =>
      resolution.manifest
        ? [
            verifyImageProvenance(
              {
                digest: resolution.manifest.digest,
                mode: 'main-reuse',
                sourceDigest: immutableRequest.mainReachableSourceSha,
                target: resolution.target,
              },
              immutableOptions.provenance,
            ),
          ]
        : [],
    ),
  )
  return {
    missingTargets,
    selectedTargets: targets,
    verifiedImages: resolutions.flatMap(resolution =>
      resolution.manifest
        ? [{ digest: resolution.manifest.digest, target: resolution.target }]
        : [],
    ),
  }
}
