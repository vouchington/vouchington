import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser, insertTestCommunity } from '../../../backend/test-helpers/index.mts'
import { insertContentProvenanceOAuthClient } from '../../../backend/test-helpers/data-stores/psql/content-provenance.mts'
import {
  renameTestOAuthClient,
  setTestOAuthClientVerified,
} from '../../../backend/test-helpers/entities/oauth-client-management.mts'

// The shared seeded administrator that owns the AUTH_STATE session.
const STAFF_USER_ID = '019f0000-0000-7000-8000-000000000000'

type SeededCommunity = { slug: string; name: string }

let suffix = ''
let clientName = ''
let mcpCommunity: SeededCommunity
let apiCommunity: SeededCommunity
let webCommunity: SeededCommunity

async function seedCommunity(
  channel: 'mcp' | 'api' | 'web',
  createdById: string,
  oauthClientId: string | null,
): Promise<SeededCommunity> {
  const slug = `pw-provenance-${channel}-${suffix}`
  const name = `PW Provenance ${suffix} ${channel}`
  await insertTestCommunity({
    name,
    slug,
    createdById,
    provenance:
      channel === 'web'
        ? { createdVia: 'web', oauthClientId: null }
        : { createdVia: channel, oauthClientId },
  })
  return { slug, name }
}

const search = (page: Page) =>
  navigateTo(page, `/communities?q=${encodeURIComponent(`PW Provenance ${suffix}`)}`)

const card = (page: Page, { slug }: SeededCommunity) =>
  page
    .getByTestId('community-card')
    .filter({ has: page.getByTestId(`community-card-link-${slug}`) })

const header = (page: Page) => page.getByTestId('community-header')

test.beforeAll(async () => {
  // Fresh per entry: community slugs, names and users.username are globally unique.
  suffix = randomSuffix()
  clientName = `Provenance Agent ${suffix}`
  const author = await createTestUser({ username: `pw-provenance-${suffix}` })
  const verifiedClientId = await insertContentProvenanceOAuthClient()
  await renameTestOAuthClient(verifiedClientId, clientName)
  await setTestOAuthClientVerified(verifiedClientId, STAFF_USER_ID)
  const unverifiedClientId = await insertContentProvenanceOAuthClient()
  mcpCommunity = await seedCommunity('mcp', author.id, verifiedClientId)
  apiCommunity = await seedCommunity('api', author.id, unverifiedClientId)
  webCommunity = await seedCommunity('web', author.id, null)
})

test.describe('Community provenance — public viewers', () => {
  test('cards label API and MCP communities and leave web communities unlabeled', async ({
    page,
  }) => {
    await search(page)

    await expect(card(page, mcpCommunity).getByTestId('community-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(card(page, apiCommunity).getByTestId('community-provenance-badge')).toHaveText(
      'via API',
    )
    await expect(card(page, webCommunity)).toBeVisible()
    await expect(card(page, webCommunity).getByTestId('community-provenance-badge')).toHaveCount(0)
  })

  test('cards show no staff-only provenance', async ({ page }) => {
    await search(page)

    await expect(card(page, apiCommunity)).toBeVisible()
    await expect(page.getByTestId('community-provenance-channel')).toHaveCount(0)
  })

  test('community detail shows the label and no staff-only provenance', async ({ page }) => {
    await navigateTo(page, `/communities/${apiCommunity.slug}`)

    await expect(header(page).getByTestId('community-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('community-provenance-channel')).toHaveCount(0)
    await expect(header(page).getByTestId('community-provenance-client')).toHaveCount(0)
    await expect(header(page).getByTestId('community-provenance-client-verification')).toHaveCount(
      0,
    )
  })

  test('community detail for a web community has no provenance badge', async ({ page }) => {
    await navigateTo(page, `/communities/${webCommunity.slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText(webCommunity.name)
    await expect(header(page).getByTestId('community-provenance-badge')).toHaveCount(0)
  })
})

test.describe('Community provenance — staff viewers', () => {
  test.use({ storageState: AUTH_STATE })

  test('cards show the raw channel of every community but not the client', async ({ page }) => {
    await search(page)

    await expect(card(page, mcpCommunity).getByTestId('community-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(card(page, apiCommunity).getByTestId('community-provenance-channel')).toHaveText(
      'Channel: api',
    )
    await expect(card(page, webCommunity).getByTestId('community-provenance-channel')).toHaveText(
      'Channel: web',
    )
    await expect(card(page, webCommunity).getByTestId('community-provenance-badge')).toHaveCount(0)
    await expect(page.getByTestId('community-provenance-client')).toHaveCount(0)
  })

  test('community detail names the OAuth client and whether staff verified it', async ({
    page,
  }) => {
    await navigateTo(page, `/communities/${mcpCommunity.slug}`)

    await expect(header(page).getByTestId('community-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(header(page).getByTestId('community-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(header(page).getByTestId('community-provenance-client')).toContainText(
      `Client: ${clientName}`,
    )
    await expect(header(page).getByTestId('community-provenance-client-verification')).toHaveText(
      'Verified',
    )

    await navigateTo(page, `/communities/${apiCommunity.slug}`)

    await expect(header(page).getByTestId('community-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('community-provenance-client-verification')).toHaveText(
      'Unverified',
    )
  })
})
