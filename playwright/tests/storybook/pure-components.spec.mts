import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { storybookBundleHasStory } from '../../helpers/storybook.mts'

const currentBundleSentinelStory = 'design-system-pure-components--shared-badges-and-links'

async function skipIfStorybookBundleIsStale(page: Parameters<typeof navigateTo>[0]) {
  test.skip(
    !(await storybookBundleHasStory(page, currentBundleSentinelStory)),
    'Full-stack Storybook bundle predates this pure component story sweep.',
  )
}

async function openStory(page: Parameters<typeof navigateTo>[0], id: string) {
  await navigateTo(page, `/storybook/iframe.html?id=${id}&viewMode=story`)
}

test.describe('Storybook pure component stories', () => {
  test('renders shared pure badges, links, search shell, and separator', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-pure-components--shared-badges-and-links')

    await expect(page.getByTestId('agent-badge')).toBeVisible()
    await expect(page.getByTestId('rss-feed-link')).toBeVisible()
    await expect(page.getByTestId('separator')).toBeVisible()
    await expect(page.getByTestId('search-input-shell')).toBeVisible()
    await expect(page.getByTestId('input').first()).toBeVisible()
  })

  test('renders data point and review counter pure leaves', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-pure-components--data-point-details')

    await expect(page.getByTestId('data-point-row')).toHaveCount(2)
    await expect(page.getByTestId('data-point-result-badge')).toBeVisible()
    await expect(page.getByTestId('review-content-counter')).toBeVisible()
  })

  test('renders plan feature label pure leaves', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-pure-components--plan-feature-labels')

    await expect(page.getByTestId('plan-feature-label')).toHaveCount(2)
    await expect(
      page.getByTestId('plan-feature-label').filter({ hasText: 'Immediate access' }),
    ).toBeVisible()
  })

  test('renders entity vouch/disavow wrappers', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-pure-components--entity-vouch-disavow-votes')

    await expect(page.getByTestId('topic-vouch-disavow-vote')).toBeVisible()
    await expect(page.getByTestId('hostname-vouch-disavow-vote')).toBeVisible()
    await expect(page.getByTestId('entity-vouch-disavow-vote')).toBeVisible()
    await expect(page.getByTestId('entity-vouch-disavow-vote-sign-in')).toBeVisible()
  })

  test('renders semantic vote controls', async ({ page }) => {
    test.skip(
      !(await storybookBundleHasStory(
        page,
        'design-system-interactive-components--score-vote-variants',
      )),
      'Interactive components story bundle predates this sweep.',
    )
    await openStory(page, 'design-system-interactive-components--score-vote-variants')

    const compactVote = page.locator('[data-vote-root="storybook-semantic-compact"]')
    await expect(compactVote).toBeVisible()
    await page.getByTestId('semantic-vote-trigger').click()
    await expect(page.getByTestId('semantic-vote-choices')).toBeVisible()
    await expect(page.getByTestId('semantic-vote-choice').first()).toBeVisible()
    await expect(page.getByTestId('semantic-vote-binary-choice').first()).toBeVisible()
    await expect(
      page.getByTestId('semantic-vote-choice').filter({ hasText: 'Neutral' }),
    ).toBeVisible()
    await expect(page.getByTestId('semantic-vote-clear')).toHaveCount(0)
  })

  test('renders shared bookmark and upload buttons', async ({ page }) => {
    test.skip(
      !(await storybookBundleHasStory(
        page,
        'design-system-interactive-components--shared-buttons',
      )),
      'Interactive components story bundle predates this sweep.',
    )
    await openStory(page, 'design-system-interactive-components--shared-buttons')

    await expect(page.getByTestId('entity-bookmark-button')).toBeVisible()
    await expect(page.getByTestId('image-upload-button')).toBeAttached()
    await expect(page.getByTestId('community-proxy-bookmark-button')).toBeVisible()
  })

  test('renders user trust election cards', async ({ page }) => {
    test.skip(
      !(await storybookBundleHasStory(
        page,
        'design-system-interactive-components--user-election-cards',
      )),
      'Interactive components story bundle predates this sweep.',
    )
    await openStory(page, 'design-system-interactive-components--user-election-cards')

    await expect(page.getByTestId('user-signal-election-card')).toBeVisible()
    await expect(page.getByTestId('user-vouch-election-card')).toBeVisible()
    await expect(page.getByTestId('user-signal-vote-choice').first()).toBeVisible()
    await expect(page.getByTestId('user-signal-vote-clear')).toHaveCount(0)
  })

  test('renders the user-tags aside', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'entities-users--asides')

    const userTags = page.getByTestId('user-tags-aside')
    await expect(userTags).toBeVisible()
    await expect(userTags.getByRole('button', { name: 'Manage' })).toBeVisible()
    await expect(userTags).toContainText('No user tags yet')
  })

  test('renders dismissible CTA aside', async ({ page }) => {
    test.skip(
      !(await storybookBundleHasStory(
        page,
        'design-system-interactive-components--dismissible-cta-aside-default',
      )),
      'Interactive components story bundle predates this sweep.',
    )
    await openStory(page, 'design-system-interactive-components--dismissible-cta-aside-default')

    await expect(page.getByTestId('dismissible-cta-aside')).toBeVisible()
  })

  test('renders memoized primitive stories', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'design-system-components-textarea--with-label')

    await expect(page.getByTestId('label')).toBeVisible()
    await expect(page.getByTestId('textarea')).toBeVisible()

    await openStory(page, 'design-system-components-switch--default')
    await expect(page.getByTestId('switch').first()).toBeVisible()

    await openStory(page, 'design-system-components-tabs--default')
    await expect(page.getByTestId('tabs-list')).toBeVisible()
    await expect(page.getByTestId('tabs-trigger').first()).toBeVisible()
    await expect(page.getByTestId('tabs-content').first()).toBeVisible()

    await openStory(page, 'design-system-components-menubar--default')
    await expect(page.getByTestId('menubar')).toBeVisible()
    await expect(page.getByTestId('menubar-trigger').first()).toBeVisible()

    await openStory(page, 'design-system-components-checkbox--card')
    await expect(page.getByTestId('checkbox-card').first()).toBeVisible()

    await openStory(page, 'design-system-components-avatar--fallback')
    await expect(page.getByTestId('avatar').first()).toBeVisible()
    await expect(page.getByTestId('avatar-fallback').first()).toBeVisible()

    await openStory(page, 'design-system-components-avatar--with-image')
    await expect(page.getByTestId('avatar-image').first()).toBeVisible()
  })

  test('renders memoized aside CTA content stories', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'entities-asides--all-asides')
    await expect(page.getByTestId('connect-social-aside-content')).toBeVisible()
    await expect(page.getByTestId('create-first-post-aside-content')).toBeVisible()
    await expect(page.getByTestId('follow-topics-aside-content')).toBeVisible()
    await expect(page.getByTestId('upgrade-membership-aside-content')).toBeVisible()
  })

  test('renders dispute annotation and topic-claim review actions', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'entities-admin-review-disputes--status-card')
    await expect(page.getByTestId('dispute-status-card')).toBeVisible()

    await openStory(page, 'entities-admin-review-disputes--annotation')
    await expect(page.getByTestId('dispute-annotation')).toBeVisible()

    await openStory(page, 'entities-admin-review-disputes--claim-review-pending')
    await expect(page.getByTestId('topic-claim-review')).toBeVisible()
    await expect(page.getByTestId('claim-approve')).toBeVisible()
    await expect(page.getByTestId('claim-reject')).toBeVisible()

    await openStory(page, 'entities-admin-review-disputes--claim-review-verified')
    await expect(page.getByTestId('claim-revoke')).toBeVisible()
  })
})
