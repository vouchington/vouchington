'use client'

import { clientApi } from './instance'

export type PlaybackPositionResponse = {
  position_seconds: number
  completed_at: string | null
}

/**
 * Reports the current playback position to the server.
 * Called on a ~10–15s throttle while playing, and flushed on pause / ended / pagehide.
 * Only called when the user is authenticated.
 */
export async function reportPlaybackPosition(
  episodeId: string,
  body: { position_seconds: number; completed?: boolean },
): Promise<void> {
  await clientApi.put(
    `/api/v1/podcast-episodes/${encodeURIComponent(episodeId)}/playback-position`,
    body,
  )
}

/**
 * Fetches the saved playback position for an episode.
 * Called once when an episode is loaded into the global player to resume playback.
 * Only called when the user is authenticated.
 */
export async function fetchPlaybackPosition(
  episodeId: string,
): Promise<PlaybackPositionResponse | null> {
  const res = await clientApi.get<{ playback_position: PlaybackPositionResponse | null }>(
    `/api/v1/podcast-episodes/${encodeURIComponent(episodeId)}/playback-position`,
  )
  return res.playback_position
}
