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

    it('resolves /feed/podcasts to podcasts', () => {
      expect(getActiveIntent('/feed/podcasts')).toBe('podcasts')
    })

    it('resolves /podcast-episodes to podcasts', () => {
      expect(getActiveIntent('/podcast-episodes')).toBe('podcasts')
    })

    it('resolves /my/podcasts to podcasts', () => {
      expect(getActiveIntent('/my/podcasts')).toBe('podcasts')
    })
  })

  describe('videos intent', () => {
    it('resolves /videos to videos', () => {
      expect(getActiveIntent('/videos')).toBe('videos')
    })

    it('resolves /feed/videos to videos', () => {
      expect(getActiveIntent('/feed/videos')).toBe('videos')
    })

    it('resolves /my/channels to videos', () => {
      expect(getActiveIntent('/my/channels')).toBe('videos')
    })

    it('resolves /channels to videos', () => {
      expect(getActiveIntent('/channels')).toBe('videos')
    })
  })

  describe('other intents', () => {
    it('resolves /web-search to web-search', () => {
      expect(getActiveIntent('/web-search')).toBe('web-search')
    })

    it('resolves /domains to web-search', () => {
      expect(getActiveIntent('/domains')).toBe('web-search')
    })

    it('resolves /urls to web-search', () => {
      expect(getActiveIntent('/urls')).toBe('web-search')
    })

    it('resolves /sources to web-search', () => {
      expect(getActiveIntent('/sources')).toBe('web-search')
    })

    it('resolves /source/123 to web-search (baseline; overridden per feed_type by SetNavIntent)', () => {
      expect(getActiveIntent('/source/123')).toBe('web-search')
    })

    it('resolves /my/sources/import-export to web-search', () => {
      expect(getActiveIntent('/my/sources/import-export')).toBe('web-search')
    })

    it('resolves /crawler/123 to web-search', () => {
      expect(getActiveIntent('/crawler/123')).toBe('web-search')
    })

    it('resolves /crawler/123/edit to web-search', () => {
      expect(getActiveIntent('/crawler/123/edit')).toBe('web-search')
    })

    it('resolves /referral-programs to referral-links', () => {
      expect(getActiveIntent('/referral-programs')).toBe('referral-links')
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
