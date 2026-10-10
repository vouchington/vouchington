'use client'

import { clientApi } from './instance'

export async function replayCopyrightMediaDelivery(): Promise<void> {
  await clientApi.post('/api/v1/copyright-media-delivery/replays', {})
}

export function replayCopyrightActionIntent(noticeId: string, intentId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/action-intents/${intentId}/replays`,
    {},
  )
}

export function replayCopyrightDeliveryIntent(noticeId: string, intentId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/delivery-intents/${intentId}/replays`,
    {},
  )
}
