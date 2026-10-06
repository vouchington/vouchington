import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestRssFeed,
  insertTestTopic,
} from '../../../backend/test-helpers/index.mts'
import { insertContentProvenanceOAuthClient } from '../../../backend/test-helpers/data-stores/psql/content-provenance.mts'
import {
  renameTestOAuthClient,
  setTestOAuthClientVerified,
} from '../../../backend/test-helpers/entities/oauth-client-management.mts'

// The shared seeded administrator that owns the AUTH_STATE session.
const STAFF_USER_ID = '019f0000-0000-7000-8000-000000000000'

type SeededSource = { topicId: string; title: string }

let suffix = ''
let clientName = ''
let mcpSource: SeededSource
let apiSource: SeededSource
let webSource: SeededSource

// The source page names the feed's provenance once. Its topic row carries a different channel
// and client, so any leak of the topic row onto the page fails the assertions below.
async function seedSource(
  channel: 'mcp' | 'api' | 'web',
  createdById: string,
  oauthClientId: string | null,
  topicOauthClientId: string,
): Promise<SeededSource> {
  const title = `PW Provenance ${suffix} ${channel}`
  const topicId = await insertTestTopic({
    name: title,
    slug: `pw-provenance-${channel}-${suffix}`,
    createdById,
    topicType: 'rss_feed',
    provenance: { createdVia: 'mcp', oauthClientId: topicOauthClientId },
  })
  await insertTestRssFeed({
    topicId,
    title,
    provenance:
      channel === 'web'
        ? { createdVia: 'web', oauthClientId: null }
        : { createdVia: channel, oauthClientId },
  })
  return { topicId, title }
}

const search = (page: Page) =>
  navigateTo(page, `/sources?q=${encodeURIComponent(`PW Provenance ${suffix}`)}`)

const card = (page: Page, { title }: SeededSource) =>
  page.getByTestId('source-list-item').filter({ hasText: title })

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
  mcpSource = await seedSource('mcp', author.id, verifiedClientId, unverifiedClientId)
  apiSource = await seedSource('api', author.id, unverifiedClientId, verifiedClientId)
  webSource = await seedSource('web', author.id, null, verifiedClientId)
})

test.describe('Source provenance — public viewers', () => {
  test('cards label API and MCP sources and leave web sources unlabeled', async ({ page }) => {
    await search(page)

    await expect(card(page, mcpSource).getByTestId('source-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(card(page, apiSource).getByTestId('source-provenance-badge')).toHaveText('via API')
    await expect(card(page, webSource)).toBeVisible()
    await expect(card(page, webSource).getByTestId('source-provenance-badge')).toHaveCount(0)
  })

  test('cards show no staff-only provenance', async ({ page }) => {
    await search(page)

    await expect(card(page, apiSource)).toBeVisible()
    await expect(page.getByTestId('source-provenance-channel')).toHaveCount(0)
  })

  test('source detail shows the feed label once and no staff-only provenance', async ({ page }) => {
    await navigateTo(page, `/source/${apiSource.topicId}/posts`)

    await expect(header(page).getByTestId('source-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('source-provenance-badge')).toHaveCount(1)
    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveCount(0)
    await expect(header(page).getByTestId('source-provenance-channel')).toHaveCount(0)
    await expect(header(page).getByTestId('source-provenance-client')).toHaveCount(0)
    await expect(header(page).getByTestId('source-provenance-client-verification')).toHaveCount(0)
  })

  test('source detail for a web feed has no provenance badge', async ({ page }) => {
    await navigateTo(page, `/source/${webSource.topicId}/posts`)

    await expect(header(page)).toBeVisible()
    await expect(header(page).getByTestId('source-provenance-badge')).toHaveCount(0)
    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveCount(0)
  })
})

test.describe('Source provenance — staff viewers', () => {
  test.use({ storageState: AUTH_STATE })

  test('cards show the raw channel of every source but not the client', async ({ page }) => {
    await search(page)

    await expect(card(page, mcpSource).getByTestId('source-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(card(page, apiSource).getByTestId('source-provenance-channel')).toHaveText(
      'Channel: api',
    )
    await expect(card(page, webSource).getByTestId('source-provenance-channel')).toHaveText(
      'Channel: web',
    )
    await expect(card(page, webSource).getByTestId('source-provenance-badge')).toHaveCount(0)
    await expect(page.getByTestId('source-provenance-client')).toHaveCount(0)
  })

  test('source detail names the feed OAuth client and whether staff verified it', async ({
    page,
  }) => {
    await navigateTo(page, `/source/${mcpSource.topicId}/posts`)

    await expect(header(page).getByTestId('source-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(header(page).getByTestId('source-provenance-channel')).toHaveText('Channel: mcp')
    await expect(header(page).getByTestId('source-provenance-client')).toContainText(
      `Client: ${clientName}`,
    )
    await expect(header(page).getByTestId('source-provenance-client-verification')).toHaveText(
      'Verified',
    )
    await expect(header(page).getByTestId('topic-provenance-badge')).toHaveCount(0)

    await navigateTo(page, `/source/${apiSource.topicId}/posts`)

    await expect(header(page).getByTestId('source-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('source-provenance-channel')).toHaveText('Channel: api')
    await expect(header(page).getByTestId('source-provenance-client-verification')).toHaveText(
      'Unverified',
    )
    await expect(header(page).getByTestId('topic-provenance-channel')).toHaveCount(0)
  })
})
