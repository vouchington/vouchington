import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser, insertTestTopic } from '../../../backend/test-helpers/index.mts'
import { insertContentProvenanceOAuthClient } from '../../../backend/test-helpers/data-stores/psql/content-provenance.mts'
import {
  renameTestOAuthClient,
  setTestOAuthClientVerified,
} from '../../../backend/test-helpers/entities/oauth-client-management.mts'

// The shared seeded administrator that owns the AUTH_STATE session.
const STAFF_USER_ID = '019f0000-0000-7000-8000-000000000000'

type SeededTopic = { id: string; name: string }

let suffix = ''
let clientName = ''
let mcpTopic: SeededTopic
let apiTopic: SeededTopic
let webTopic: SeededTopic

async function seedTopic(
  channel: 'mcp' | 'api' | 'web',
  createdById: string,
  oauthClientId: string | null,
): Promise<SeededTopic> {
  const name = `PW Provenance ${suffix} ${channel}`
  const id = await insertTestTopic({
    name,
    slug: `pw-provenance-${channel}-${suffix}`,
    createdById,
    provenance:
      channel === 'web'
        ? { createdVia: 'web', oauthClientId: null }
        : { createdVia: channel, oauthClientId },
  })
  return { id, name }
}

const search = (page: Page) =>
  navigateTo(page, `/topics?q=${encodeURIComponent(`PW Provenance ${suffix}`)}&sort=new`)

const card = (page: Page, { name }: SeededTopic) =>
  page.getByTestId('topic-card').filter({ hasText: name })

const header = (page: Page) => page.getByTestId('topic-detail-header')

test.beforeAll(async () => {
  // Fresh per entry: topic names and slugs and users.username are globally unique.
  suffix = randomSuffix()
  clientName = `Provenance Agent ${suffix}`
  const author = await createTestUser({ username: `pw-provenance-${suffix}` })
  const verifiedClientId = await insertContentProvenanceOAuthClient()
  await renameTestOAuthClient(verifiedClientId, clientName)
  await setTestOAuthClientVerified(verifiedClientId, STAFF_USER_ID)
  const unverifiedClientId = await insertContentProvenanceOAuthClient()
  mcpTopic = await seedTopic('mcp', author.id, verifiedClientId)
  apiTopic = await seedTopic('api', author.id, unverifiedClientId)
  webTopic = await seedTopic('web', author.id, null)
})

test.describe('Topic provenance — public viewers', () => {
  test('cards label API and MCP topics and leave web topics unlabeled', async ({ page }) => {
    await search(page)

    await expect(card(page, mcpTopic).getByTestId('topic-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(card(page, apiTopic).getByTestId('topic-provenance-badge')).toHaveText('via API')
    await expect(card(page, webTopic)).toBeVisible()
    await expect(card(page, webTopic).getByTestId('topic-provenance-badge')).toHaveCount(0)
  })

  test('cards show no staff-only provenance', async ({ page }) => {
    await search(page)

    await expect(card(page, apiTopic)).toBeVisible()
    await expect(page.getByTestId('topic-provenance-channel')).toHaveCount(0)
  })

  test('topic detail shows the label and no staff-only provenance', async ({ page }) => {
    await navigateTo(page, `/topic/${apiTopic.id}/posts`)

    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('topic-provenance-channel')).toHaveCount(0)
    await expect(header(page).getByTestId('topic-provenance-client')).toHaveCount(0)
    await expect(header(page).getByTestId('topic-provenance-client-verification')).toHaveCount(0)
  })

  test('topic detail for a web topic has no provenance badge', async ({ page }) => {
    await navigateTo(page, `/topic/${webTopic.id}/posts`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(webTopic.name)
    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveCount(0)
  })
})

test.describe('Topic provenance — staff viewers', () => {
  test.use({ storageState: AUTH_STATE })

  test('cards show the raw channel of every topic but not the client', async ({ page }) => {
    await search(page)

    await expect(card(page, mcpTopic).getByTestId('topic-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(card(page, apiTopic).getByTestId('topic-provenance-channel')).toHaveText(
      'Channel: api',
    )
    await expect(card(page, webTopic).getByTestId('topic-provenance-channel')).toHaveText(
      'Channel: web',
    )
    await expect(card(page, webTopic).getByTestId('topic-provenance-badge')).toHaveCount(0)
    await expect(page.getByTestId('topic-provenance-client')).toHaveCount(0)
  })

  test('topic detail names the OAuth client and whether staff verified it', async ({ page }) => {
    await navigateTo(page, `/topic/${mcpTopic.id}/posts`)

    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveText(`via ${clientName}`)
    await expect(header(page).getByTestId('topic-provenance-channel')).toHaveText('Channel: mcp')
    await expect(header(page).getByTestId('topic-provenance-client')).toContainText(
      `Client: ${clientName}`,
    )
    await expect(header(page).getByTestId('topic-provenance-client-verification')).toHaveText(
      'Verified',
    )

    await navigateTo(page, `/topic/${apiTopic.id}/posts`)

    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('topic-provenance-client-verification')).toHaveText(
      'Unverified',
    )
  })
})
