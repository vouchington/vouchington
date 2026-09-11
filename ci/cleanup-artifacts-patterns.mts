import {
  parseArtifactPatternsJson,
  type ArtifactClassification,
} from 'vouchington-tooling/gha-artifacts-cleanup'

import { createArtifactPatternMatcher } from './cleanup-artifacts-pattern-matcher.mjs'
import artifactPatterns from './cleanup-artifacts-patterns.json' with { type: 'json' }

export type { ArtifactClassification } from 'vouchington-tooling/gha-artifacts-cleanup'

/**
 * Never deleted by either cleanup path, regardless of run outcome or age.
 */
const patterns = parseArtifactPatternsJson(artifactPatterns)

export const KEEP_PATTERNS = patterns.keepPatterns

/** Deleted once the producing run is safe to clean up (see classifyArtifact). */
export const DELETE_PATTERNS = patterns.deletePatterns

const isKeep = createArtifactPatternMatcher(KEEP_PATTERNS)
const isDelete = createArtifactPatternMatcher(DELETE_PATTERNS)

export function classifyArtifact(name: string): ArtifactClassification {
  if (isKeep(name)) return 'keep'
  if (isDelete(name)) return 'delete'
  return 'keep'
}

export function isExplicitlyClassified(name: string): boolean {
  return isKeep(name) || isDelete(name)
}
