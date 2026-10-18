import {
  renderCommunityApplicationDecisionEmail,
  renderCommunityInviteEmail,
  renderCommunityModerationSummaryEmail,
  renderCommunityOwnershipTransferEmail,
  renderCommunityRoleChangeEmail,
  renderDataExportReadyEmail,
  renderEmailVerificationEmail,
  renderFollowNewsSourcesEmail,
  renderFollowTopicsEmail,
  renderLoginTokenEmail,
  renderPostReferralLinkEmail,
  renderRenewalPriceIncreaseEmail,
  renderWelcomeEmail,
  renderApiKeyExpiryEmail,
} from './index.mts'

import type { EmailRenderResultPromise } from '@vouchington/email'

import { describe, expect, it } from 'vitest'

import CommunityApplicationDecisionEmail from './community-application-decision.tsx'
import CommunityInviteEmail from './community-invite.tsx'
import CommunityModerationSummaryEmail from './community-moderation-summary.tsx'
import CommunityOwnershipTransferEmail from './community-ownership-transfer.tsx'
import CommunityRoleChangeEmail from './community-role-change.tsx'
import DataExportReadyEmail from './data-export-ready.tsx'
import EmailVerificationEmail from './email-verification.tsx'
import FollowNewsSourcesEmail from './follow-news-sources.tsx'
import FollowTopicsEmail from './follow-topics.tsx'
import LoginTokenEmail from './login-token.tsx'
import PostReferralLinkEmail from './post-referral-link.tsx'
import RenewalPriceIncreaseEmail from './renewal-price-increase.tsx'

import WelcomeEmail from './welcome.tsx'

const frenchDocuments: ReadonlyArray<readonly [string, () => EmailRenderResultPromise]> = [
  [
    'api key expiry',
    () =>
      renderApiKeyExpiryEmail({
        label: 'Reader',
        expiresAt: '2026-10-08T12:00:00.000Z',
        apiKeysUrl: 'https://voucha.ai/my/api-keys',
        uiLocale: 'fr',
      }),
  ],
  [
    'community application decision',
    () =>
      renderCommunityApplicationDecisionEmail({
        ...CommunityApplicationDecisionEmail.PreviewProps!,
        uiLocale: 'fr',
      }),
  ],
  [
    'community invite',
    () => renderCommunityInviteEmail({ ...CommunityInviteEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'community moderation summary',
    () =>
      renderCommunityModerationSummaryEmail({
        ...CommunityModerationSummaryEmail.PreviewProps!,
        uiLocale: 'fr',
      }),
  ],
  [
    'community ownership transfer',
    () =>
      renderCommunityOwnershipTransferEmail({
        ...CommunityOwnershipTransferEmail.PreviewProps!,
        uiLocale: 'fr',
      }),
  ],
  [
    'community role change',
    () =>
      renderCommunityRoleChangeEmail({ ...CommunityRoleChangeEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'data export ready',
    () => renderDataExportReadyEmail({ ...DataExportReadyEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'email verification',
    () => renderEmailVerificationEmail({ ...EmailVerificationEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'follow news sources',
    () => renderFollowNewsSourcesEmail({ ...FollowNewsSourcesEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'follow topics',
    () => renderFollowTopicsEmail({ ...FollowTopicsEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'login token',
    () => renderLoginTokenEmail({ ...LoginTokenEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'post referral link',
    () => renderPostReferralLinkEmail({ ...PostReferralLinkEmail.PreviewProps!, uiLocale: 'fr' }),
  ],
  [
    'renewal price increase',
    () =>
      renderRenewalPriceIncreaseEmail({
        ...RenewalPriceIncreaseEmail.PreviewProps!,
        uiLocale: 'fr',
      }),
  ],
  ['welcome', () => renderWelcomeEmail({ ...WelcomeEmail.PreviewProps!, uiLocale: 'fr' })],
]

describe('transactional email document language', () => {
  it.each(frenchDocuments)(
    '%s uses the resolved UI locale for html and body lang',
    async (_name, render) => {
      const { html } = await render()
      // React Email sets lang on the document, the body, and the inner cell independently.
      expect(html.match(/lang="fr"/g)).toHaveLength(3)
      expect(html).not.toContain('lang="en"')
    },
  )

  it('normalizes a regional UI locale onto the document language', async () => {
    const { html } = await renderWelcomeEmail({ uiLocale: 'pt-BR' })
    expect(html.match(/lang="pt"/g)).toHaveLength(3)
    expect(html).not.toContain('lang="en"')
  })

  it('keeps the English document language when the UI locale is unsupported', async () => {
    const { html } = await renderWelcomeEmail({ uiLocale: 'de-DE' })
    expect(html.match(/lang="en"/g)).toHaveLength(3)
  })
})
