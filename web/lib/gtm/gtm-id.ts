const GTM_ID_RE = /^GTM-[A-Z0-9]+$/

export function getValidGtmId(gtmId?: string): string | undefined {
  if (!gtmId || !GTM_ID_RE.test(gtmId)) {
    return undefined
  }

  return gtmId
}
