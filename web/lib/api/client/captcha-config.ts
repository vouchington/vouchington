'use client'

import { clientApi } from './instance'

export type CaptchaConfigResponse = {
  always_approve: boolean
}

export function fetchCaptchaConfig(): Promise<CaptchaConfigResponse> {
  return clientApi.get<CaptchaConfigResponse>('/api/v1/captcha-config')
}
