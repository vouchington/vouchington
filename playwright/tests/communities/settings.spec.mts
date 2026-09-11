import { test, expect, withMonitoredPage } from '../../helpers/test.mts'
import { loginAsTestUser, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUserWithAge,
  insertTestCommunityMember,
  CONTRIBUTING_USER_AGE_MS,
} from '../../../backend/test-helpers/index.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Community settings page tests.
 * Tests settings form, moderation queue, applications, and invites pages.
 */

let COMMUNITY_SLUG = ''
let COMMUNITY_NAME = ''
let COMMUNITY_ID = ''
let MODERATOR_USER_ID = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-settings-playwright-${suffix}`,
    name: `PW Settings Playwright ${suffix}`,
  }
}

test.describe('Community Settings', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const fixture = createCommunityFixture()
    COMMUNITY_NAME = fixture.name
    COMMUNITY_SLUG = fixture.slug

    await withMonitoredPage(browser, testInfo, async page => {
      await loginAsTestUser(page)
      const communityId = await page.evaluate(
        async ({ name, slug }) => {
          const res = await fetch('/api/v1/communities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, slug }),
          })
          if (res.status === 409) {
            const lookupRes = await fetch(`/api/v1/communities/${slug}`, {
              credentials: 'include',
            })
            if (!lookupRes.ok) throw new Error(`Failed to look up community: ${lookupRes.status}`)
            const lookupData = (await lookupRes.json()) as { community?: { id: string } }
            return lookupData.community?.id ?? null
          }
          if (!res.ok) throw new Error(`Failed to create community: ${res.status}`)
          const data = (await res.json()) as { community?: { id: string } }
          return data.community?.id ?? null
        },
        { name: COMMUNITY_NAME, slug: COMMUNITY_SLUG },
      )
      if (!communityId) throw new Error('Failed to create or look up test community')
      COMMUNITY_ID = communityId
    })

    await insertTestCommunityMember({
      communityId: COMMUNITY_ID,
      userId: TEST_USER_ID,
      role: 'owner',
    }).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes('unique') && !msg.includes('duplicate') && !msg.includes('already exists'))
        throw error
    })

    const moderator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!moderator) throw new Error('Failed to create moderator test user')
    MODERATOR_USER_ID = moderator.id
    await insertTestCommunityMember({
      communityId: COMMUNITY_ID,
      userId: MODERATOR_USER_ID,
      role: 'moderator',
    })
  })

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings`)
  })

  test('settings page has heading', async ({ page }) => {
    await expect(page.getByTestId('community-settings-heading')).toBeVisible()
  })

  test('shows community name input with current name', async ({ page }) => {
    await expect(page.getByTestId('community-settings-name-input')).toHaveValue(COMMUNITY_NAME)
  })

  test('shows slug input', async ({ page }) => {
    await expect(page.getByTestId('community-settings-slug-input')).toHaveValue(COMMUNITY_SLUG)
  })

  test('shows Save Settings button', async ({ page }) => {
    await expect(page.getByTestId('community-settings-save-button')).toBeVisible()
  })

  test('updates member roster privacy setting', async ({ page }) => {
    await page.getByTestId('community-settings-member-roster-visibility-select').click()
    await page.getByTestId('community-settings-member-roster-visibility-option-moderators').click()
    await expect(
      page.getByTestId('community-settings-member-roster-visibility-select'),
    ).toContainText('moderators')
    await page.getByTestId('community-settings-save-button').click()
    await expect(page.getByTestId('community-settings-success')).toBeVisible()
  })

  test('shows Danger Zone with Archive Community button', async ({ page }) => {
    await expect(page.getByTestId('community-danger-zone-heading')).toBeVisible()
    await expect(page.getByTestId('community-archive-button')).toBeVisible()
  })

  test('archive button shows Confirm Archive on first click', async ({ page }) => {
    await page.getByTestId('community-archive-button').click()
    await expect(page.getByTestId('community-archive-button')).toHaveText('Confirm Archive')
  })

  test('moderation page has heading', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/moderation`)
    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
  })

  test('moderation page exposes community AI agent toggles', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/moderation`)
    await expect(page.getByTestId('community-ai-agents-panel')).toBeVisible()
    await expect(page.getByTestId('community-ai-agent-row').first()).toBeVisible()
    await expect(
      page
        .getByTestId('community-ai-agent-toggle')
        .and(page.locator('[data-agent-slug="self-promotion"]')),
    ).toBeVisible()
    await expect(
      page
        .getByTestId('community-ai-agent-toggle')
        .and(page.locator('[data-agent-slug="marketplace"]')),
    ).toBeVisible()
    await expect(page.getByTestId('community-ai-agent-entitlement-reason')).toHaveCount(0)
    await expect(page.getByTestId('community-ai-agent-always-on-badge').first()).toBeVisible()
  })

  test('applications page has heading', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/applications`)
    await expect(page.getByTestId('community-applications-heading')).toBeVisible()
  })

  test('invites page has heading', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/invites`)
    await expect(page.getByTestId('community-invites-heading')).toBeVisible()
  })

  test('invites page shows invite form', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/invites`)
    await expect(page.getByTestId('community-invites-email-input')).toBeVisible()
    await expect(page.getByTestId('community-invites-send-button')).toBeVisible()
  })

  test('owner sees both Settings and Moderation tabs', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-nav-settings')).toBeVisible()
    await expect(page.getByTestId('community-nav-moderation')).toBeVisible()
  })

  test.describe('moderator nav', () => {
    test('Settings tab is not rendered for moderator', async ({ page }) => {
      await loginAsUser(page, MODERATOR_USER_ID)
      await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
      await expect(page.getByTestId('community-nav-settings')).not.toBeAttached()
      await expect(page.getByTestId('community-nav-moderation')).toBeVisible()
    })

    test('moderator can access the moderation queue page', async ({ page }) => {
      await loginAsUser(page, MODERATOR_USER_ID)
      await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/moderation`)
      await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    })

    test('direct nav to /settings redirects moderator to moderation page', async ({ page }) => {
      await loginAsUser(page, MODERATOR_USER_ID)
      await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings`)
      await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    })
  })
})
