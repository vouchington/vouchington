import {
  renderCommunityInviteEmail,
  renderCommunityModerationSummaryEmail,
  renderDataExportReadyEmail,
  renderEmailVerificationEmail,
  renderReauthenticationEmail,
  renderFollowNewsSourcesEmail,
  renderFollowTopicsEmail,
  renderLoginTokenEmail,
  renderPostReferralLinkEmail,
  renderWelcomeEmail,
} from './index.mts'

import { describe, expect, it } from 'vitest'

import { COPYRIGHT_YEAR, colors } from './styles.mts'

const templateDefs = [
  {
    name: 'reauthentication',
    render: () => renderReauthenticationEmail({ token: 'ABCDEFG234', expiresInMinutes: 15 }),
  },
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

describe('email template brand consistency', () => {
  it.each(templateDefs)('$name uses the current brand styles', async ({ render }) => {
    const { html } = await render()
    expect(html).toContain(colors.primary)
    expect(html).not.toContain('#0066cc')
    // Catch both compact and spaced CSS declarations.
    expect(html).not.toMatch(/background-color\s*:\s*#000000/i)
    // VouchaHeader's wordmark uses this letter spacing.
    expect(html).toContain('Voucha')
    expect(html).toContain('letter-spacing:0.5px')
    expect(html).toContain(COPYRIGHT_YEAR)
    expect(html).not.toContain('padding:40px')
    expect(html).not.toContain('padding: 40px')
  })
})
