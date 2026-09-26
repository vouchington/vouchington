import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'

/**
 * Collapses candidate rows that belong to the same existing story down to a single
 * representative each, keeping the nearest (input is already `distance ASC`, so the first
 * occurrence of a `story_id` is its closest member). Required, not just an optimization: the
 * Choice classifier binds one criterion per *candidate entity* (`classifierCandidateKey`), and two
 * criteria naming the same story would fail `assertBindingSet`'s "cannot duplicate concrete
 * candidates" check. Standalone candidates (`story_id: null`) are never deduped against one
 * another -- each is its own distinct `rss_feed_item` candidate entity.
 *
 * Lives in this DB-free package (rather than next to `findClusterCandidates` in
 * `@services/stories/cluster-candidates.mts`) so it -- and the Choice bindings builder that calls
 * it -- can be unit tested without loading `@data-stores/psql`.
 */
export function dedupeStoryClusterCandidates(
  candidates: readonly StoryClusterCandidateRow[],
): StoryClusterCandidateRow[] {
  const seenStoryIds = new Set<string>()
  const deduped: StoryClusterCandidateRow[] = []
  for (const candidate of candidates) {
    if (candidate.story_id) {
      if (seenStoryIds.has(candidate.story_id)) continue
      seenStoryIds.add(candidate.story_id)
    }
    deduped.push(candidate)
  }
  return deduped
}
