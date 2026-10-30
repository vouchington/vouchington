// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getActiveIntent } from '../intents'

describe('getActiveIntent', () => {
  describe('admin route intents', () => {
    it('resolves /memberships/grants to settings', () => {
      expect(getActiveIntent('/memberships/grants')).toBe('settings')
    })
  })

  describe('engineering intent', () => {
    it('resolves /admin/queues to engineering', () => {
      expect(getActiveIntent('/admin/queues')).toBe('engineering')
    })

    it('resolves /admin/postgresql to engineering', () => {
      expect(getActiveIntent('/admin/postgresql')).toBe('engineering')
    })

    it('resolves /admin/valkey to engineering', () => {
      expect(getActiveIntent('/admin/valkey')).toBe('engineering')
    })

    it('resolves /admin/ai-costs to engineering', () => {
      expect(getActiveIntent('/admin/ai-costs')).toBe('engineering')
    })

    it('resolves /admin/dynamic-config to engineering', () => {
      expect(getActiveIntent('/admin/dynamic-config')).toBe('engineering')
    })
  })

  describe('podcasts intent', () => {
    it('resolves /podcasts to podcasts', () => {
      expect(getActiveIntent('/podcasts')).toBe('podcasts')
    })
  })

  describe('videos intent', () => {
    it('resolves /videos to videos', () => {
      expect(getActiveIntent('/videos')).toBe('videos')
    })
  })

  describe('other intents', () => {
    it('resolves /urls to web-search', () => {
      expect(getActiveIntent('/urls')).toBe('web-search')
    })

    it('resolves /my/referrals to referral-links', () => {
      expect(getActiveIntent('/my/referrals')).toBe('referral-links')
    })

    it('resolves /feed/referral-links to referral-links', () => {
      expect(getActiveIntent('/feed/referral-links')).toBe('referral-links')
    })

    it('resolves /feed/referral-links/mutual to referral-links', () => {
      expect(getActiveIntent('/feed/referral-links/mutual')).toBe('referral-links')
    })

    it('resolves /my/landing-pages to landing-pages', () => {
      expect(getActiveIntent('/my/landing-pages')).toBe('landing-pages')
    })

    it('resolves /communities to communities', () => {
      expect(getActiveIntent('/communities')).toBe('communities')
    })

    it('resolves /growth to growth', () => {
      expect(getActiveIntent('/growth')).toBe('growth')
    })
  })

  describe('fallback', () => {
    it('returns news for unknown paths', () => {
      expect(getActiveIntent('/unknown-path')).toBe('news')
    })

    it('returns news for /', () => {
      expect(getActiveIntent('/')).toBe('news')
    })

    it('returns news for /some/deeply/nested/unknown', () => {
      expect(getActiveIntent('/some/deeply/nested/unknown')).toBe('news')
    })
  })
})
