import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `agent-prompts-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner user')
  ownerUserId = owner.id

  communitySlug = `agent-prompts-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Agent Prompts Test ${suffix}`,
  })

  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
})

test.describe('Community agent prompts', () => {
  test('moderation page shows agent prompts panel', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-agent-prompts-panel')).toBeVisible()
  })

  test('moderation page shows agent prompt history', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-agent-prompt-history')).toBeVisible()
  })

  test('shows the create prompt form', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-agent-prompt-form')).toBeVisible()
  })

  test('creates a prompt, shows it in the list, and records a history entry', async ({ page }) => {
    const suffix = randomSuffix()
    const promptText = `Test agent prompt ${suffix}`

    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    const form = page.getByTestId('community-agent-prompt-form')
    await expect(form).toBeVisible()

    const textarea = form.getByLabel('New agent prompt')
    await textarea.pressSequentially(promptText)

    const submitButton = form.getByRole('button', { name: 'Create Prompt' })
    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/agent-prompts') && response.request().method() === 'POST',
    )
    await submitButton.click()
    await responsePromise

    await expect(page.getByTestId('community-agent-prompt-list')).toBeVisible()
    await expect(page.getByTestId('community-agent-prompt-item').first()).toBeVisible()

    // Reload to get server-rendered history (SSR re-fetches after mutation completes)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-agent-prompt-history-entry').first()).toBeVisible()

    // Load-more only appears when cursor is non-null (>20 entries); with 1 entry it is absent
    await expect(page.getByTestId('community-agent-prompt-history-load-more')).toHaveCount(0)
  })

  test('opens the automod prompt test panel', async ({ page }) => {
    const suffix = randomSuffix()
    const promptText = `Panel test agent prompt ${suffix}`

    await loginAsUser(page, ownerUserId)
    await page.route('**/api/v1/communities/*/automod/simulate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeSimulationResponse({ matched: false })),
      })
    })
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    const form = page.getByTestId('community-agent-prompt-form')
    await form.getByLabel('New agent prompt').pressSequentially(promptText)
    await form.getByRole('button', { name: 'Create Prompt' }).click()

    const promptItem = page.getByTestId('community-agent-prompt-item').first()
    await expect(promptItem).toBeVisible()
    await promptItem.getByRole('button', { name: 'Test' }).click()

    await expect(page.getByTestId('community-agent-prompt-test-panel')).toBeVisible()
    await expect(page.getByLabel('Simulation prompt')).toBeVisible()

    await promptItem.getByRole('button', { name: 'Run Test' }).click()
    await expect(page.getByTestId('community-agent-prompt-test-results')).toBeVisible()
    await expect(page.getByTestId('community-agent-prompt-test-empty')).toBeVisible()
  })

  test('shows projected automod simulation matches', async ({ page }) => {
    const suffix = randomSuffix()
    const promptText = `Panel match agent prompt ${suffix}`

    await loginAsUser(page, ownerUserId)
    await page.route('**/api/v1/communities/*/automod/simulate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeSimulationResponse({ matched: true })),
      })
    })
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    const form = page.getByTestId('community-agent-prompt-form')
    await form.getByLabel('New agent prompt').pressSequentially(promptText)
    await form.getByRole('button', { name: 'Create Prompt' }).click()

    const promptItem = page.getByTestId('community-agent-prompt-item').first()
    await expect(promptItem).toBeVisible()
    await promptItem.getByRole('button', { name: 'Test' }).click()
    await promptItem.getByRole('button', { name: 'Run Test' }).click()

    await expect(page.getByTestId('community-agent-prompt-test-results')).toBeVisible()
    await expect(page.getByTestId('community-agent-prompt-test-result')).toBeVisible()
    await expect(page.getByText('Matches panel prompt')).toBeVisible()
  })
})

function makeSimulationResponse({ matched }: { matched: boolean }) {
  return {
    simulation: {
      prompt_id: 'prompt-1',
      time_window_hours: 168,
      sample_count: matched ? 1 : 0,
      would_flag_count: matched ? 1 : 0,
      would_unpublish_count: 0,
      false_positive_estimate: {
        historical_flagged_count: 0,
        historical_approved_count: 0,
        rate: null,
      },
    },
    results: matched
      ? [
          {
            post_id: 'post-1',
            title: 'Matched simulated post',
            post_type: 'discussion',
            approved_at: '2026-01-01T00:00:00.000Z',
            content_excerpt: 'Simulated post body',
            flagged: true,
            reason: 'Matches panel prompt',
            would_unpublish: false,
          },
        ]
      : [],
  }
}
