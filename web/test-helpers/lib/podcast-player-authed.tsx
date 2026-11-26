/* oxlint-disable react/only-export-components -- shared test support exports fixtures beside the wrapper components */

import { AuthProvider } from '@/lib/auth/auth-provider'
import { PodcastPlayerProvider } from '@/lib/podcast-player/context'
import { usePodcastPlayer } from '@/lib/podcast-player/use-podcast-player'
import type { PodcastEpisode } from '@/lib/podcast-player/types'

export const clientTestUser = { id: 'user-1', roles: ['user'], account_type: null }

export function makeEpisode(id: string): PodcastEpisode {
  return {
    episodeId: id,
    enclosureUrl: `https://example.com/audio/${id}.mp3`,
    enclosureType: 'audio/mpeg',
    durationSeconds: 1800,
    title: `Episode ${id}`,
    showId: 'show-1',
    showTitle: 'Test Show',
    coverArtUrl: '/sideload/test-cover.jpg',
    showHref: '/source/test-show/latest',
  }
}

export function CaptureContext({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof usePodcastPlayer>) => void
}) {
  onContext(usePodcastPlayer())
  return null
}

export function AuthedWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider initialUser={clientTestUser}>
      <PodcastPlayerProvider>{children}</PodcastPlayerProvider>
    </AuthProvider>
  )
}
