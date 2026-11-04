import {
  enqueueCommunityActivityDigestWindows,
  getCommunityActivityDigestDispatchData,
} from '@queues/notifications/enqueues'
import {
  prepareCommunityActivityDigestWindows,
  type DigestCursorOptions,
} from '@services/notifications/community-activity-digest-dispatch'

export async function processCommunityActivityDigestScheduleTick(
  data: { targetWindowStart?: string },
  options: DigestCursorOptions = {},
): Promise<void> {
  const targetWindowStart =
    data.targetWindowStart ?? getCommunityActivityDigestDispatchData().windowStart
  const result = await prepareCommunityActivityDigestWindows(new Date(targetWindowStart), options)
  await enqueueCommunityActivityDigestWindows(
    result.windows.map(window => ({
      windowStart: window.windowStart.toISOString(),
      windowEnd: window.windowEnd.toISOString(),
    })),
  )
}
