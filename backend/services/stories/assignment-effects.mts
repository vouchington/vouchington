import onError from '@modules/on-error'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'

export async function dispatchPostCommitEffectsBestEffort(
  refreshResults: StoryPostRefreshResult[],
): Promise<void> {
  const results = await Promise.allSettled(
    refreshResults.map(refreshResult => refreshResult.dispatchPostCommitEffects()),
  )
  for (const result of results) {
    if (result.status === 'rejected')
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }
}
