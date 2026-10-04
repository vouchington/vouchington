'use client'

import { admissionIdempotency } from './admission-idempotency'
import { withoutCopyrightCaptcha } from './copyright-notice-idempotency'
import { clientApi } from './instance'
import type {
  CopyrightEuNoticeInput,
  CopyrightEuNoticeResponse,
  CopyrightEuRedressResponse,
} from '@/types/copyright-eu'

export function createCopyrightEuNotice(
  input: CopyrightEuNoticeInput,
): Promise<CopyrightEuNoticeResponse> {
  return admissionIdempotency.run(
    { route: 'copyright-eu-notices.create', body: withoutCopyrightCaptcha(input) },
    idempotencyKey =>
      clientApi.post('/api/v1/copyright-eu-notices', input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  )
}

export function createCopyrightEuRedress(
  noticeId: string,
  input: { explanation: string; cf_turnstile_response?: string },
): Promise<CopyrightEuRedressResponse> {
  return admissionIdempotency.run(
    { route: 'copyright-eu-notices.complaint', noticeId, body: withoutCopyrightCaptcha(input) },
    idempotencyKey =>
      clientApi.post(`/api/v1/copyright-eu-notices/${noticeId}/redress-requests`, input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  )
}
