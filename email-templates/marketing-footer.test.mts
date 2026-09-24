import { describe, expect, it } from 'vitest'
import { renderCommunityModerationSummaryEmail } from './community-moderation-summary-renderer.mts'
import { renderFollowNewsSourcesEmail } from './follow-news-sources-renderer.mts'
import { renderFollowTopicsEmail } from './follow-topics-renderer.mts'
import { renderPostReferralLinkEmail } from './post-referral-link-renderer.mts'
import type { EmailRenderResultPromise } from './types.mts'

/**
 * CAN-SPAM enforcement test — every commercial/marketing template must render
 * both a physical mailing address and a visible unsubscribe link, in both the
 * HTML and plain-text output. If a template stops rendering either one, this
 * test fails CI. See README.md § Templates for the marketing/transactional split.
 */

const PHYSICAL_ADDRESS_MARKER = 'TEST_PHYSICAL_ADDRESS_MARKER'
const UNSUBSCRIBE_URL_MARKER = 'https://voucha.ai/test-unsubscribe-marker'

const MARKETING_TEMPLATES: { name: string; render: () => EmailRenderResultPromise }[] = [
  {
    name: 'follow-topics',
    render: () =>
      renderFollowTopicsEmail({
        userName: 'Alex',
        topics: [{ name: 'Credit Cards', url: 'https://voucha.ai/topics/credit-cards' }],
        settingsUrl: 'https://voucha.ai/my/topics/following',
        unsubscribeUrl: UNSUBSCRIBE_URL_MARKER,
        physicalAddress: PHYSICAL_ADDRESS_MARKER,
      }),
  },
  {
    name: 'post-referral-link',
    render: () =>
      renderPostReferralLinkEmail({
        userName: 'Alex',
        referralPrograms: [
          { name: 'Travel Cards', url: 'https://voucha.ai/referral-programs/travel-cards' },
        ],
        settingsUrl: 'https://voucha.ai/my/landing-pages',
        unsubscribeUrl: UNSUBSCRIBE_URL_MARKER,
        physicalAddress: PHYSICAL_ADDRESS_MARKER,
      }),
  },
  {
    name: 'follow-news-sources',
    render: () =>
      renderFollowNewsSourcesEmail({
        userName: 'Alex',
        sources: [{ name: 'The Verge', url: 'https://voucha.ai/sources/the-verge' }],
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: UNSUBSCRIBE_URL_MARKER,
        physicalAddress: PHYSICAL_ADDRESS_MARKER,
      }),
  },
  {
    name: 'community-moderation-summary',
    render: () =>
      renderCommunityModerationSummaryEmail({
        userName: 'Alex',
        generatedForDate: 'July 9, 2026',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: UNSUBSCRIBE_URL_MARKER,
        physicalAddress: PHYSICAL_ADDRESS_MARKER,
        communities: [],
      }),
  },
]

describe('marketing template CAN-SPAM footer enforcement', () => {
  it.each(MARKETING_TEMPLATES)(
    '$name renders the physical address and unsubscribe link in html and text',
    async ({ render }) => {
      const { html, text } = await render()

      expect(html).toContain(PHYSICAL_ADDRESS_MARKER)
      expect(text).toContain(PHYSICAL_ADDRESS_MARKER)
      expect(html).toContain(UNSUBSCRIBE_URL_MARKER)
      expect(text).toContain(UNSUBSCRIBE_URL_MARKER)
    },
  )
})
