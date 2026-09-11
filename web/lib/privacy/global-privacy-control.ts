export function hasNavigatorGlobalPrivacyControl(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl === true
}

export function hasGlobalPrivacyControlHeader(headers: Headers): boolean {
  return headers.get('sec-gpc') === '1' || headers.get('x-voucha-gpc') === '1'
}
