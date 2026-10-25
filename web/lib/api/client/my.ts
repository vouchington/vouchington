'use client'
import { clientApi } from './instance'
import { assertEncodablePathSegmentIdentifier } from './path-identifiers'
import type {
  ProfileResponseBody,
  ProfileLinkResponseBody,
  IdentityResponseBody,
  ListResponse,
  LandingPageDetailResponseBody,
  LandingPageResponseBody,
  RewardsProgramStatusResponseBody,
  PointValuationResponseBody,
} from '@/types/api-responses'
import type { EmailAddress } from '@/types/user'
export { createMyCard, deleteMyCard, updateMyCard } from './my-cards'
export {
  createMySpendingCategory,
  deleteMySpendingCategory,
  getMySpendingCategoriesClient,
  updateMySpendingCategory,
} from './my-spending-categories'
export {
  createMyWebPushSubscription,
  deleteMyNotification,
  deleteMyWebPushSubscription,
  getMyWebPushSubscriptionsClient,
  getMyUnreadNotificationsSummaryClient,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  markMyNotificationReadKeepalive,
} from './my-notifications'
export function updateMyProfile(body: unknown): Promise<ProfileResponseBody> {
  return clientApi.patch<ProfileResponseBody>('/api/v1/my/profile', body)
}
export function createMyProfileLink(body: unknown): Promise<ProfileLinkResponseBody> {
  return clientApi.post<ProfileLinkResponseBody>('/api/v1/my/profile/links', body)
}
export function updateMyProfileLink(
  linkId: string,
  body: unknown,
): Promise<ProfileLinkResponseBody> {
  return clientApi.patch<ProfileLinkResponseBody>(`/api/v1/my/profile/links/${linkId}`, body)
}
export function deleteMyProfileLink(linkId: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/profile/links/${linkId}`)
}
export function reorderMyProfileLinks(body: unknown): Promise<void> {
  return clientApi.put('/api/v1/my/profile/links/order', body)
}
export function createMyLandingPage(body: unknown): Promise<LandingPageResponseBody> {
  return clientApi.post<LandingPageResponseBody>('/api/v1/my/landing-pages', body)
}
export function updateMyLandingPage(
  pageId: string,
  body: unknown,
): Promise<LandingPageResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(pageId)
  return clientApi.patch<LandingPageResponseBody>(
    `/api/v1/my/landing-pages/${encodeURIComponent(safeId)}`,
    body,
  )
}
export function deleteMyLandingPage(pageId: string): Promise<void> {
  const safeId = assertEncodablePathSegmentIdentifier(pageId)
  return clientApi.delete(`/api/v1/my/landing-pages/${encodeURIComponent(safeId)}`)
}
export function setDefaultMyLandingPage(pageId: string): Promise<LandingPageResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(pageId)
  return clientApi.patch<LandingPageResponseBody>(
    `/api/v1/my/landing-pages/${encodeURIComponent(safeId)}`,
    { is_default: true },
  )
}
export function replaceMyLandingPageItems(
  pageId: string,
  body: unknown,
): Promise<LandingPageDetailResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(pageId)
  return clientApi.put<LandingPageDetailResponseBody>(
    `/api/v1/my/landing-pages/${encodeURIComponent(safeId)}/items`,
    body,
  )
}
export function getMyLandingPageClient(pageId: string): Promise<LandingPageDetailResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(pageId)
  return clientApi.get<LandingPageDetailResponseBody>(
    `/api/v1/my/landing-pages/${encodeURIComponent(safeId)}`,
  )
}
export function updateMyIdentity(body: unknown): Promise<IdentityResponseBody> {
  return clientApi.patch<IdentityResponseBody>('/api/v1/my/identity', body)
}
export function unsubscribeEmailToken(token: string): Promise<{ ok: true }> {
  return clientApi.post<{ ok: true }>('/api/v1/email-unsubscribe', { token })
}
export function requestMyEmailAddressVerification(
  emailAddress: string,
): Promise<{ email_address: string }> {
  return clientApi.post<{ email_address: string }>('/api/v1/my/email-addresses', {
    email_address: emailAddress,
  })
}
export function getMyEmailAddressesClient(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<EmailAddress>> {
  return clientApi.get<ListResponse<EmailAddress>>('/api/v1/my/email-addresses', {
    searchParams: options,
  })
}
export function verifyMyEmailAddress(
  emailAddress: string,
  token: string,
): Promise<ListResponse<EmailAddress>> {
  return clientApi.post<ListResponse<EmailAddress>>(
    `/api/v1/my/email-addresses/${encodeURIComponent(emailAddress)}/verifications`,
    { token },
  )
}
export function setPrimaryMyEmailAddress(
  emailAddress: string,
): Promise<ListResponse<EmailAddress>> {
  return clientApi.patch<ListResponse<EmailAddress>>(
    `/api/v1/my/email-addresses/${encodeURIComponent(emailAddress)}`,
    { is_primary: true },
  )
}
export function deleteMyEmailAddress(emailAddress: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/email-addresses/${encodeURIComponent(emailAddress)}`)
}
export function createMyRewardsProgramStatus(
  body: unknown,
): Promise<RewardsProgramStatusResponseBody> {
  return clientApi.post<RewardsProgramStatusResponseBody>(
    '/api/v1/my/rewards-program-statuses',
    body,
  )
}
export function updateMyRewardsProgramStatus(
  id: string,
  body: unknown,
): Promise<RewardsProgramStatusResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(id)
  return clientApi.patch<RewardsProgramStatusResponseBody>(
    `/api/v1/my/rewards-program-statuses/${encodeURIComponent(safeId)}`,
    body,
  )
}
export function deleteMyRewardsProgramStatus(id: string): Promise<void> {
  const safeId = assertEncodablePathSegmentIdentifier(id)
  return clientApi.delete(`/api/v1/my/rewards-program-statuses/${encodeURIComponent(safeId)}`)
}
export function createMyRewardsProgramPointValuation(
  body: unknown,
): Promise<PointValuationResponseBody> {
  return clientApi.post<PointValuationResponseBody>(
    '/api/v1/my/rewards-program-point-valuations',
    body,
  )
}
export function updateMyRewardsProgramPointValuation(
  id: string,
  body: unknown,
): Promise<PointValuationResponseBody> {
  const safeId = assertEncodablePathSegmentIdentifier(id)
  return clientApi.patch<PointValuationResponseBody>(
    `/api/v1/my/rewards-program-point-valuations/${encodeURIComponent(safeId)}`,
    body,
  )
}
export function deleteMyRewardsProgramPointValuation(id: string): Promise<void> {
  const safeId = assertEncodablePathSegmentIdentifier(id)
  return clientApi.delete(
    `/api/v1/my/rewards-program-point-valuations/${encodeURIComponent(safeId)}`,
  )
}
