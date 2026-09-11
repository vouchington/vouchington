import { hasNavigatorGlobalPrivacyControl } from '@/lib/privacy/global-privacy-control'

export function trackLandingPageVisit(
  landingPageId: string,
  data: {
    referrer?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
  },
): void {
  if (hasNavigatorGlobalPrivacyControl()) return
  navigator.sendBeacon(
    `/api/v1/landing-pages/${landingPageId}/visits`,
    new Blob([JSON.stringify(data)], { type: 'application/json' }),
  )
}

export function trackLandingPageClick(
  landingPageId: string,
  data: {
    landing_page_item_id: string
    group_member_id?: string
  },
): void {
  if (hasNavigatorGlobalPrivacyControl()) return
  navigator.sendBeacon(
    `/api/v1/landing-pages/${landingPageId}/clicks`,
    new Blob([JSON.stringify(data)], { type: 'application/json' }),
  )
}
