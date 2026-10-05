import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { insertContentProvenanceOAuthClient } from '../../../backend/test-helpers/data-stores/psql/content-provenance.mts'
import {
  renameTestOAuthClient,
  setTestOAuthClientVerified,
} from '../../../backend/test-helpers/entities/oauth-client-management.mts'

// The shared seeded administrator that owns the AUTH_STATE session.
const STAFF_USER_ID = '019f0000-0000-7000-8000-000000000000'

type SeededPost = { id: string; slug: string }

let suffix = ''
let username = ''
let clientName = ''
let mcpPost: SeededPost
let apiPost: SeededPost
let webPost: SeededPost

async function seedPost(
  channel: 'mcp' | 'api' | 'web',
  createdById: string,
  oauthClientId: string | null,
): Promise<SeededPost> {
  const slug = `pw-provenance-${channel}-${suffix}`
  const id = await insertTestPost({
    title: `Provenance ${channel} ${suffix}`,
    slug,
    createdById,
    markdown: `Provenance ${channel} body.`,
    postType: 'discussion',
    provenance:
      channel === 'web'
        ? { createdVia: 'web', oauthClientId: null }
        : { createdVia: channel, oauthClientId },
  })
  return { id, slug }
}

const card = (page: Page, { slug }: SeededPost) =>
  page.getByTestId('post-card-root').and(page.locator(`[data-post-slug="${slug}"]`))

test.beforeAll(async () => {
  // Fresh per entry: users.username and post slugs are globally unique.
  suffix = randomSuffix()
  username = `pw-provenance-${suffix}`
  clientName = `Provenance Agent ${suffix}`
  const author = await createTestUser({ username })
  const verifiedClientId = await insertContentProvenanceOAuthClient()
  await renameTestOAuthClient(verifiedClientId, clientName)
  await setTestOAuthClientVerified(verifiedClientId, STAFF_USER_ID)
  const unverifiedClientId = await insertContentProvenanceOAuthClient()
  mcpPost = await seedPost('mcp', author.id, verifiedClientId)
  apiPost = await seedPost('api', author.id, unverifiedClientId)
  webPost = await seedPost('web', author.id, null)
})

test.describe('Post provenance — public viewers', () => {
  test('cards label API and MCP posts and leave web posts unlabeled', async ({ page }) => {
    await navigateTo(page, `/user/${username}/posts`)

    await expect(card(page, mcpPost).getByTestId('post-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(card(page, apiPost).getByTestId('post-provenance-badge')).toHaveText('via API')
    await expect(card(page, webPost)).toBeVisible()
    await expect(card(page, webPost).getByTestId('post-provenance-badge')).toHaveCount(0)
  })

  test('post detail shows the label and no staff-only provenance', async ({ page }) => {
    await navigateTo(page, `/discussion/${apiPost.id}`)

    await expect(page.getByTestId('post-provenance-badge')).toHaveText('via API')
    await expect(page.getByTestId('post-provenance-channel')).toHaveCount(0)
    await expect(page.getByTestId('post-provenance-client')).toHaveCount(0)
    await expect(page.getByTestId('post-provenance-client-verification')).toHaveCount(0)
  })

  test('post detail for a web post has no provenance badge', async ({ page }) => {
    await navigateTo(page, `/discussion/${webPost.id}`)

    await expect(page.getByTestId('post-detail-heading')).toHaveText(`Provenance web ${suffix}`)
    await expect(page.getByTestId('post-provenance-badge')).toHaveCount(0)
  })
})

test.describe('Post provenance — staff viewers', () => {
  test.use({ storageState: AUTH_STATE })

  test('cards show the raw channel of every post', async ({ page }) => {
    await navigateTo(page, `/user/${username}/posts`)

    await expect(card(page, mcpPost).getByTestId('post-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(card(page, apiPost).getByTestId('post-provenance-channel')).toHaveText(
      'Channel: api',
    )
    await expect(card(page, webPost).getByTestId('post-provenance-channel')).toHaveText(
      'Channel: web',
    )
    await expect(card(page, webPost).getByTestId('post-provenance-badge')).toHaveCount(0)
  })

  test('post detail names the OAuth client and whether staff verified it', async ({ page }) => {
    await navigateTo(page, `/discussion/${mcpPost.id}`)

    await expect(page.getByTestId('post-provenance-badge')).toHaveText(`via ${clientName}`)
    await expect(page.getByTestId('post-provenance-channel')).toHaveText('Channel: mcp')
    await expect(page.getByTestId('post-provenance-client')).toContainText(`Client: ${clientName}`)
    await expect(page.getByTestId('post-provenance-client-verification')).toHaveText('Verified')

    await navigateTo(page, `/discussion/${apiPost.id}`)

    await expect(page.getByTestId('post-provenance-badge')).toHaveText('via API')
    await expect(page.getByTestId('post-provenance-client-verification')).toHaveText('Unverified')
  })
})
