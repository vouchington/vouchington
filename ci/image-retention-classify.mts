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
import type { PackageVersion } from './image-retention-github.mts'

const CANONICAL_TAG = /^sha-([0-9a-f]{40})$/u
const RETAIN_MAIN = 30
const QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type RetentionDeletion = PackageVersion & {
  sourceSha: string
  target: RegistryTarget
}
export type RetentionClassification = {
  deletions: RetentionDeletion[]
  retainedCount: number
}
export type RetentionClassificationOptions = {
  provenance?: ImageProvenanceVerifierOptions
  registry?: RegistryClientOptions
}

export async function classifyPackageVersions(
  target: RegistryTarget,
  versions: PackageVersion[],
  reachable: ReadonlySet<string>,
  credentials: RegistryManifestRequest['credentials'],
  nowMs: number,
  options: RetentionClassificationOptions = {},
): Promise<RetentionClassification> {
  const runtime: RetentionDeletion[] = []
  let retainedCount = 0
  for (const version of versions) {
    const match = version.tags.length === 1 ? CANONICAL_TAG.exec(version.tags[0]!) : undefined
    if (!match) {
      retainedCount++
      continue
    }
    const sourceSha = match[1]!
    const immutable = await resolveGhcrManifest(
      { credentials, reference: version.digest, target },
      options.registry,
    )
    const tagged = await resolveGhcrManifest(
      { credentials, reference: version.tags[0]!, target },
      options.registry,
    )
    if (
      !immutable ||
      !tagged ||
      immutable.digest !== version.digest ||
      tagged.digest !== version.digest
    )
      throw new Error('package version manifest binding changed')
    if (immutable.classification === 'protected' || tagged.classification === 'protected') {
      retainedCount++
      continue
    }
    runtime.push({ ...version, sourceSha, target })
  }

  const newestMainIds = new Set(
    runtime
      .filter(version => reachable.has(version.sourceSha))
      .toSorted(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id,
      )
      .slice(0, RETAIN_MAIN)
      .map(version => version.id),
  )
  const deletions: RetentionDeletion[] = []
  const cutoff = nowMs - QUEUE_AGE_MS
  for (const version of runtime) {
    if (reachable.has(version.sourceSha)) {
      if (newestMainIds.has(version.id)) retainedCount++
      else deletions.push(version)
      continue
    }
    if (Date.parse(version.createdAt) >= cutoff || Date.parse(version.updatedAt) >= cutoff) {
      retainedCount++
      continue
    }
    await verifyImageProvenance(
      {
        digest: version.digest,
        mode: 'queue-retention',
        sourceDigest: version.sourceSha,
        target,
      },
      options.provenance,
    )
    deletions.push(version)
  }
  return { deletions, retainedCount }
}

export async function revalidateManifestBinding(
  version: RetentionDeletion,
  credentials: RegistryManifestRequest['credentials'],
  registry?: RegistryClientOptions,
): Promise<void> {
  const immutable = await resolveGhcrManifest(
    { credentials, reference: version.digest, target: version.target },
    registry,
  )
  const tagged = await resolveGhcrManifest(
    { credentials, reference: version.tags[0]!, target: version.target },
    registry,
  )
  if (
    !immutable ||
    !tagged ||
    immutable.classification !== 'runtime' ||
    tagged.classification !== 'runtime' ||
    immutable.digest !== version.digest ||
    tagged.digest !== version.digest
  )
    throw new Error('package version manifest binding changed')
}
