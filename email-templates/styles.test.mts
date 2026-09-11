import { describe, expect, it } from 'vitest'
import { renderCommunityInviteEmail } from './community-invite-renderer.mts'
import { renderCommunityModerationSummaryEmail } from './community-moderation-summary-renderer.mts'
import { renderDataExportReadyEmail } from './data-export-ready-renderer.mts'
import { renderEmailVerificationEmail } from './email-verification-renderer.mts'
import { renderFollowNewsSourcesEmail } from './follow-news-sources-renderer.mts'
import { renderFollowTopicsEmail } from './follow-topics-renderer.mts'
import { renderLoginTokenEmail } from './login-token-renderer.mts'
import { renderPostReferralLinkEmail } from './post-referral-link-renderer.mts'
import { COPYRIGHT_YEAR, colors } from './styles.mts'
import { renderSupportReplyEmail } from './support-reply-renderer.mts'
import { renderWelcomeEmail } from './welcome-renderer.mts'

const templateDefs = [
  {
    name: 'login-token',
    render: () =>
      renderLoginTokenEmail({
        emailAddress: 'tests+test@voucha.ai',
        token: 'abc123',
        expiration: '10 minutes',
      }),
  },
  {
    name: 'email-verification',
    render: () => renderEmailVerificationEmail({ token: 'verify123' }),
  },
  {
    name: 'welcome',
    render: () => renderWelcomeEmail({ userName: 'Alex' }),
  },
  {
    name: 'follow-topics',
    render: () =>
      renderFollowTopicsEmail({
        userName: 'Alex',
        topics: [{ name: 'Credit Cards', url: 'https://voucha.ai/topics/credit-cards' }],
        settingsUrl: 'https://voucha.ai/my/topics/following',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
      }),
  },
  {
    name: 'follow-news-sources',
    render: () =>
      renderFollowNewsSourcesEmail({
        userName: 'Alex',
        sources: [{ name: 'The Verge', url: 'https://voucha.ai/sources/the-verge' }],
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
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
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
      }),
  },
  {
    name: 'community-moderation-summary',
    render: () =>
      renderCommunityModerationSummaryEmail({
        userName: 'Alex',
        generatedForDate: 'July 9, 2026',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        communities: [
          {
            name: 'Travel Hackers',
            url: 'https://voucha.ai/communities/travel-hackers',
            pendingPostReviews: 2,
            pendingApplications: 1,
            pendingReports: 3,
            escalatedItems: 1,
            suspectedBanEvaders: 0,
            netMemberChange: 5,
            totalActiveMembers: 128,
            newDiscussionPosts: 4,
            newReviewPosts: 2,
            newDataPointPosts: 1,
            topDiscussionTitle: 'Best credit card for a Japan trip?',
            topDiscussionReplyCount: 12,
            activeMemberCount: 41,
            activeMemberRate: 0.32,
          },
        ],
      }),
  },
  {
    name: 'support-reply',
    render: () =>
      renderSupportReplyEmail({
        bodyText: 'Thank you for reaching out.\n\nWe will follow up shortly.',
      }),
  },
  {
    name: 'community-invite',
    render: () =>
      renderCommunityInviteEmail({
        communityName: 'Travel Hackers',
        inviterName: 'John',
        code: 'abc12345',
      }),
  },
  {
    name: 'data-export-ready',
    render: () =>
      renderDataExportReadyEmail({
        downloadUrl: 'https://voucha.ai/downloads/preview',
        expiresInDays: 7,
      }),
  },
]

// Cache rendered HTML so each template is rendered at most once across all assertions.
const htmlCache = new Map<string, string>()

async function getHtml(name: string, render: () => Promise<{ html: string }>): Promise<string> {
  const cached = htmlCache.get(name)
  if (cached !== undefined) return cached
  const { html } = await render()
  htmlCache.set(name, html)
  return html
}

describe('email template brand consistency', () => {
  it.each(templateDefs)(
    '$name contains brand gold and not legacy blue',
    async ({ name, render }) => {
      const html = await getHtml(name, render)
      expect(html).toContain(colors.primary)
      expect(html).not.toContain('#0066cc')
      // Use regex to catch both `background-color:#000000` and `background-color: #000000`
      expect(html).not.toMatch(/background-color\s*:\s*#000000/i)
    },
  )

  it.each(templateDefs)('$name contains Voucha header', async ({ name, render }) => {
    const html = await getHtml(name, render)
    // VouchaHeader renders "Voucha" with letter-spacing:0.5px — unique to the header wordmark
    expect(html).toContain('Voucha')
    expect(html).toContain('letter-spacing:0.5px')
  })

  it.each(templateDefs)('$name contains current copyright year', async ({ name, render }) => {
    const html = await getHtml(name, render)
    expect(html).toContain(COPYRIGHT_YEAR)
  })

  it.each(templateDefs)(
    '$name does not have legacy 40px section padding',
    async ({ name, render }) => {
      const html = await getHtml(name, render)
      expect(html).not.toContain('padding:40px')
      expect(html).not.toContain('padding: 40px')
    },
  )
})
