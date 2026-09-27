export const REGISTRY_DIGEST = /^sha256:[0-9a-f]{64}$/u

const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json'
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json'
const DOCKER_INDEX = 'application/vnd.docker.distribution.manifest.list.v2+json'
const OCI_ARTIFACT = 'application/vnd.oci.artifact.manifest.v1+json'
export const REGISTRY_ACCEPT = [
  OCI_MANIFEST,
  DOCKER_MANIFEST,
  OCI_INDEX,
  DOCKER_INDEX,
  OCI_ARTIFACT,
].join(', ')

const OCI_CONFIG = new Set(['application/vnd.oci.image.config.v1+json'])
const DOCKER_CONFIG = new Set(['application/vnd.docker.container.image.v1+json'])
const OCI_LAYERS = new Set([
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.oci.image.layer.nondistributable.v1.tar',
  'application/vnd.oci.image.layer.nondistributable.v1.tar+gzip',
  'application/vnd.oci.image.layer.nondistributable.v1.tar+zstd',
])
const DOCKER_LAYERS = new Set([
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
  'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',
])

type Json = Record<string, unknown>
const record = (value: unknown): Json | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined

function validDescriptor(value: unknown, mediaTypes: Set<string>): boolean {
  const descriptor = record(value)
  return Boolean(
    descriptor &&
    typeof descriptor['mediaType'] === 'string' &&
    mediaTypes.has(descriptor['mediaType']) &&
    typeof descriptor['digest'] === 'string' &&
    REGISTRY_DIGEST.test(descriptor['digest']) &&
    Number.isSafeInteger(descriptor['size']) &&
    Number(descriptor['size']) >= 0,
  )
}

export function classifyRegistryManifest(
  manifest: Json,
  mediaType: string,
): 'protected' | 'runtime' {
  if (
    Object.hasOwn(manifest, 'artifactType') ||
    Object.hasOwn(manifest, 'subject') ||
    (mediaType !== OCI_MANIFEST && mediaType !== DOCKER_MANIFEST)
  )
    return 'protected'
  const configTypes = mediaType === OCI_MANIFEST ? OCI_CONFIG : DOCKER_CONFIG
  const layerTypes = mediaType === OCI_MANIFEST ? OCI_LAYERS : DOCKER_LAYERS
  const layers = manifest['layers']
  if (
    !validDescriptor(manifest['config'], configTypes) ||
    !Array.isArray(layers) ||
    layers.length === 0 ||
    !layers.every(layer => validDescriptor(layer, layerTypes))
  )
    return 'protected'
  return 'runtime'
}
