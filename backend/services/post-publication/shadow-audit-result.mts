import type { ShadowAuditCandidate } from './shadow-audit.mts'

export type PostPublicationShadowAuditResult = {
  dryRun: boolean
  scannedByScope: { post: number; author: number; community: number; rssFeed: number }
  discrepanciesByScope: { post: number; author: number; community: number; rssFeed: number }
  checkpoint: string | null
  /** True when the caller should invoke the same audit again with `checkpoint`. */
  hasMore: boolean
}

export function makeShadowAuditResult(
  dryRun: boolean,
  candidates: ShadowAuditCandidate[],
  limit: number,
): PostPublicationShadowAuditResult {
  return {
    dryRun,
    scannedByScope: countScopes(candidates),
    discrepanciesByScope: countScopes(candidates.filter(candidate => candidate.is_discrepant)),
    checkpoint: candidates.at(-1)?.id ?? null,
    hasMore: candidates.length === limit,
  }
}

function countScopes(candidates: ShadowAuditCandidate[]) {
  return {
    post: candidates.length,
    author: candidates.filter(candidate => candidate.has_author).length,
    community: candidates.filter(candidate => candidate.has_community).length,
    rssFeed: candidates.filter(candidate => candidate.has_rss_source).length,
  }
}
