import { countDiffLineChanges, type DiffLineChanges } from './diff-size.mts'
import {
  parseChangedPackageJsonPaths,
  parseRemovedSurfaces,
  type RemovedSurface,
} from './removed-surfaces.mts'

export type DiffSummary = {
  changedPackageJsonPaths: string[]
  lineChanges: DiffLineChanges
  removedSurfaces: RemovedSurface[]
}

export function createDiffSummary(): DiffSummary {
  return { changedPackageJsonPaths: [], lineChanges: { added: 0, deleted: 0 }, removedSurfaces: [] }
}

/** Reduces one complete unified-diff file block without retaining the surrounding patch. */
export function reduceDiffBlock(summary: DiffSummary, block: string): void {
  const changes = countDiffLineChanges(block)
  summary.lineChanges.added += changes.added
  summary.lineChanges.deleted += changes.deleted
  summary.removedSurfaces.push(...parseRemovedSurfaces(block))
  for (const path of parseChangedPackageJsonPaths(block)) {
    if (!summary.changedPackageJsonPaths.includes(path)) summary.changedPackageJsonPaths.push(path)
  }
}
