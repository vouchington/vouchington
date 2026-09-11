import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderCommunityModerationSummaryEmail } from './community-moderation-summary-renderer.mts'
import CommunityModerationSummaryEmail from './community-moderation-summary.tsx'

describe('renderCommunityModerationSummaryEmail', () => {
  it('renders the expected subject and snapshots', async () => {
    const result = await renderCommunityModerationSummaryEmail(
      CommunityModerationSummaryEmail.PreviewProps!,
    )

    expect(result.subject).toBe('Community moderation summary for July 9, 2026')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-moderation-summary.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/community-moderation-summary.txt', import.meta.url)),
    )
  })

  it('includes moderation counts in both formats', async () => {
    const result = await renderCommunityModerationSummaryEmail({
      userName: 'Jordan',
      generatedForDate: 'July 9, 2026',
      settingsUrl: 'https://voucha.ai/communities/travel-hackers/settings/moderation',
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
    })

    expect(result.html).toContain('Pending reports:')
    expect(result.text).toContain('Pending reports: 3')
  })

  it('renders the activity digest fields in a non-English locale', async () => {
    const result = await renderCommunityModerationSummaryEmail({
      userName: 'Amélie',
      generatedForDate: '9 juillet 2026',
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
      uiLocale: 'fr',
      communities: [
        {
          name: 'Voyageurs Malins',
          url: 'https://voucha.ai/communities/voyageurs-malins',
          pendingPostReviews: 1,
          pendingApplications: 0,
          pendingReports: 0,
          escalatedItems: 0,
          suspectedBanEvaders: 0,
          netMemberChange: -2,
          totalActiveMembers: 50,
          newDiscussionPosts: 3,
          newReviewPosts: 1,
          newDataPointPosts: 0,
          topDiscussionTitle: 'Meilleure carte pour voyager en Asie ?',
          topDiscussionReplyCount: 7,
          activeMemberCount: 10,
          activeMemberRate: 0.2,
        },
      ],
    })

    // React Email's pretty-printer can wrap long interpolated text across lines,
    // so collapse whitespace before asserting on multi-word substrings.
    const normalizedHtml = result.html.replace(/\s+/g, ' ')
    expect(normalizedHtml).toContain('Activité de la communauté')
    expect(normalizedHtml).toContain('Variation des membres')
    expect(normalizedHtml).toContain('-2')
    expect(normalizedHtml).toContain('Total des membres actifs')
    expect(normalizedHtml).toContain('Nouvelles discussions')
    expect(normalizedHtml).toContain('Nouveaux avis')
    expect(normalizedHtml).toContain('Nouvelles données')
    expect(normalizedHtml).toContain('Discussion phare')
    expect(normalizedHtml).toContain('Meilleure carte pour voyager en Asie ?')
    expect(normalizedHtml).toContain('7 réponses')
    expect(normalizedHtml).toContain('Membres actifs')
    expect(result.text).toContain('Variation des membres: -2')
    expect(result.text).toContain(
      'Discussion phare: Meilleure carte pour voyager en Asie ? (7 réponses)',
    )
  })

  it('renders the pluralized top discussion reply count in es and pt locales', async () => {
    const cases = [
      {
        uiLocale: 'es',
        replyCount: 1,
        expected: '1 respuesta',
        memberChangeLabel: 'Cambio de miembros',
      },
      {
        uiLocale: 'pt',
        replyCount: 4,
        expected: '4 respostas',
        memberChangeLabel: 'Variação de membros',
      },
    ] as const

    for (const { uiLocale, replyCount, expected, memberChangeLabel } of cases) {
      const result = await renderCommunityModerationSummaryEmail({
        userName: 'Test',
        generatedForDate: 'July 9, 2026',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        uiLocale,
        communities: [
          {
            name: 'Test Community',
            url: 'https://voucha.ai/communities/test',
            pendingPostReviews: 0,
            pendingApplications: 0,
            pendingReports: 0,
            escalatedItems: 0,
            suspectedBanEvaders: 0,
            netMemberChange: 0,
            totalActiveMembers: 10,
            newDiscussionPosts: 0,
            newReviewPosts: 0,
            newDataPointPosts: 0,
            topDiscussionTitle: 'Test discussion',
            topDiscussionReplyCount: replyCount,
            activeMemberCount: 5,
            activeMemberRate: 0.5,
          },
        ],
      })

      expect(result.text).toContain(expected)
      expect(result.text).toContain(`${memberChangeLabel}: 0`)
      expect(result.text).not.toContain(`${memberChangeLabel}: +0`)
      expect(result.html).not.toContain('+0')
    }
  })

  it('falls back to the locale greeting and empty state when no user name is provided', async () => {
    for (const [uiLocale, greeting, empty] of [
      ['es', 'Hola,', 'Ninguna comunidad necesita atención ahora.'],
      ['fr', 'Bonjour,', 'Aucune communauté ne nécessite votre attention'],
      ['pt', 'Olá,', 'Nenhuma comunidade precisa de atenção agora.'],
    ] as const) {
      const result = await renderCommunityModerationSummaryEmail({
        userName: undefined,
        generatedForDate: 'July 9, 2026',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
        communities: [],
        uiLocale,
      })

      expect(result.text).toContain(greeting)
      expect(result.html).toContain(empty)
    }
  })
})
