import {
  classifyPackageVersions,
  revalidateManifestBinding,
  type RetentionClassificationOptions,
  type RetentionDeletion,
} from './image-retention-classify.mts'
import {
  GithubPackageClient,
  type GithubPackageOptions,
  type PackageVersion,
} from './image-retention-github.mts'
import { loadMainReachability, type MainReachabilityOptions } from './image-retention-git.mts'
import type { RegistryManifestRequest, RegistryTarget } from './image-registry.mts'
import { selectedImageTargets } from './image-targets.mts'

const TARGETS: RegistryTarget[] = ['api', 'worker-cpu', 'worker-io', 'web']

export type RetentionRequest = {
  credentials: RegistryManifestRequest['credentials']
  githubToken: string
}
export type RetentionOptions = RetentionClassificationOptions & {
  git?: MainReachabilityOptions
  github?: GithubPackageOptions
  nowMs?: number
  signal?: AbortSignal
  workspaceRoot?: string
}
export type RetentionPlan = {
  deletions: RetentionDeletion[]
  invisibleOptionalTargets: RegistryTarget[]
  mainTip: string
  retainedCount: number
  visibleTargets: RegistryTarget[]
}
export type RetentionApplyResult = { deleted: RetentionDeletion[] }

export class RetentionDeletionError extends Error {
  readonly deleted: RetentionDeletion[]
  readonly indeterminate: RetentionDeletion | undefined
  readonly neverAttempted: RetentionDeletion[]

  constructor(
    deleted: RetentionDeletion[],
    indeterminate: RetentionDeletion | undefined,
    neverAttempted: RetentionDeletion[],
  ) {
    super('package deletion stopped after an indeterminate request')
    this.deleted = deleted
    this.indeterminate = indeterminate
    this.neverAttempted = neverAttempted
  }
}

function immutableOptions(options: RetentionOptions) {
  const signal = options.signal
  return {
    git: { ...options.git, signal },
    github: { ...options.github, signal },
    nowMs: options.nowMs ?? Date.now(),
    provenance: { ...options.provenance, signal },
    registry: { ...options.registry, signal },
    signal,
    workspaceRoot: options.workspaceRoot ?? process.cwd(),
  }
}

function sameVersion(left: PackageVersion, right: PackageVersion): boolean {
  return (
    left.id === right.id &&
    left.digest === right.digest &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.tags.length === right.tags.length &&
    left.tags.every((tag, index) => tag === right.tags[index])
  )
}

async function allOrThrow<T>(promises: Array<Promise<T>>): Promise<T[]> {
  const settled = await Promise.allSettled(promises)
  const failure = settled.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return settled.map(result => (result as PromiseFulfilledResult<T>).value)
}

export async function buildRetentionPlan(
  request: RetentionRequest,
  options: RetentionOptions = {},
): Promise<RetentionPlan> {
  const immutableRequest = {
    credentials: { ...request.credentials },
    githubToken: request.githubToken,
  }
  const immutable = immutableOptions(options)
  if (!Number.isSafeInteger(immutable.nowMs) || immutable.nowMs <= 0)
    throw new Error('invalid image retention clock')
  const client = new GithubPackageClient(immutableRequest.githubToken, immutable.github)
  const [main, backendTargets, visibleTargets] = await Promise.all([
    loadMainReachability(immutable.git),
    selectedImageTargets('backend', immutable.workspaceRoot),
    client.listPackages(),
  ])
  const requiredTargets = [...backendTargets, 'web'] as RegistryTarget[]
  const missingRequired = requiredTargets.filter(target => !visibleTargets.includes(target))
  if (missingRequired.length > 0)
    throw new Error(`required GHCR packages are not visible: ${missingRequired.join(',')}`)
  const selectedTargets = TARGETS.filter(target => visibleTargets.includes(target))
  const versions = await allOrThrow(
    selectedTargets.map(async target => ({ target, versions: await client.listVersions(target) })),
  )
  const classifications = await allOrThrow(
    versions.map(async ({ target, versions: packageVersions }) => ({
      target,
      result: await classifyPackageVersions(
        target,
        packageVersions,
        main.reachable,
        immutableRequest.credentials,
        immutable.nowMs,
        { provenance: immutable.provenance, registry: immutable.registry },
      ),
    })),
  )
  const deletions = classifications
    .flatMap(({ result }) => result.deletions)
    .toSorted(
      (left, right) =>
        TARGETS.indexOf(left.target) - TARGETS.indexOf(right.target) ||
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id - right.id,
    )
  return {
    deletions,
    invisibleOptionalTargets: backendTargets.includes('worker-io')
      ? []
      : TARGETS.filter(target => target === 'worker-io' && !visibleTargets.includes(target)),
    mainTip: main.tip,
    retainedCount: classifications.reduce((total, { result }) => total + result.retainedCount, 0),
    visibleTargets: selectedTargets,
  }
}

export async function applyRetentionPlan(
  request: RetentionRequest,
  plan: RetentionPlan,
  options: RetentionOptions = {},
): Promise<RetentionApplyResult> {
  const immutablePlan: RetentionPlan = {
    deletions: plan.deletions.map(deletion => ({ ...deletion, tags: [...deletion.tags] })),
    invisibleOptionalTargets: [...plan.invisibleOptionalTargets],
    mainTip: plan.mainTip,
    retainedCount: plan.retainedCount,
    visibleTargets: [...plan.visibleTargets],
  }
  if (immutablePlan.deletions.length === 0) return { deleted: [] }
  const immutableRequest = {
    credentials: { ...request.credentials },
    githubToken: request.githubToken,
  }
  const immutable = immutableOptions(options)
  const client = new GithubPackageClient(immutableRequest.githubToken, immutable.github)
  const currentMain = await loadMainReachability(immutable.git)
  if (currentMain.tip !== immutablePlan.mainTip)
    throw new Error('pinned main changed before deletion')
  for (const deletion of immutablePlan.deletions) {
    const current = await client.getVersion(deletion.target, deletion.id)
    if (!sameVersion(current, deletion)) throw new Error('package version changed before deletion')
    await revalidateManifestBinding(deletion, immutableRequest.credentials, immutable.registry)
  }
  if ((await client.getRemoteMainTip()) !== immutablePlan.mainTip)
    throw new Error('remote main changed before deletion')
  const deleted: RetentionDeletion[] = []
  for (const [index, deletion] of immutablePlan.deletions.entries()) {
    if (immutable.signal?.aborted)
      throw new RetentionDeletionError(deleted, undefined, immutablePlan.deletions.slice(index))
    try {
      await client.deleteVersion(deletion.target, deletion.id)
      deleted.push(deletion)
    } catch {
      throw new RetentionDeletionError(deleted, deletion, immutablePlan.deletions.slice(index + 1))
    }
  }
  return { deleted }
}
