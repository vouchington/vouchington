'use client'

import { usePodcastPlayer } from './use-podcast-player'

/** Bottom padding spacer matching the mini-player height; place after footer in root layout. */
export function PodcastPlayerSpacer() {
  const { currentEpisode, miniPlayerHeight } = usePodcastPlayer()
  return currentEpisode ? (
    <div
      className='shrink-0'
      style={{ height: `${miniPlayerHeight ?? 64}px` }}
      aria-hidden='true'
    />
  ) : null
}
