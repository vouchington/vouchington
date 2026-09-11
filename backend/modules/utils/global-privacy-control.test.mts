import { describe, expect, it } from 'vitest'
import { hasGlobalPrivacyControlHeaders } from './global-privacy-control.mts'

describe('hasGlobalPrivacyControlHeaders', () => {
  it('detects GPC from Headers instances', () => {
    expect(hasGlobalPrivacyControlHeaders(new Headers({ 'Sec-GPC': '1' }))).toBe(true)
  })

  it('detects canonical case Sec-GPC in plain header objects', () => {
    expect(hasGlobalPrivacyControlHeaders({ 'Sec-GPC': '1' })).toBe(true)
  })

  it('detects normalized internal GPC headers in plain header objects', () => {
    expect(hasGlobalPrivacyControlHeaders({ 'x-voucha-gpc': '1' })).toBe(true)
  })

  it('does not treat non-1 GPC values as active', () => {
    expect(hasGlobalPrivacyControlHeaders({ 'Sec-GPC': '0', 'x-voucha-gpc': '0' })).toBe(false)
  })
})
