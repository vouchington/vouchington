import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser, insertTestList } from '../../../backend/test-helpers/index.mts'
import { insertContentProvenanceOAuthClient } from '../../../backend/test-helpers/data-stores/psql/content-provenance.mts'
import {
  renameTestOAuthClient,
  setTestOAuthClientVerified,
} from '../../../backend/test-helpers/entities/oauth-client-management.mts'

// The shared seeded administrator that owns the AUTH_STATE session.
const STAFF_USER_ID = '019f0000-0000-7000-8000-000000000000'

type Channel = 'mcp' | 'api' | 'web'
type SeededList = { id: string; name: string }

let suffix = ''
let clientName = ''
let verifiedClientId = ''
let unverifiedClientId = ''
let mcpList: SeededList
let apiList: SeededList
let webList: SeededList
let staffOwnedMcpList: SeededList
let staffOwnedApiList: SeededList
let staffOwnedWebList: SeededList

async function seedList(channel: Channel, ownerUserId: string, label: string): Promise<SeededList> {
  const name = `PW Provenance ${label} ${suffix} ${channel}`
  const oauthClientId = channel === 'mcp' ? verifiedClientId : unverifiedClientId
  const list = await insertTestList({
    ownerUserId,
    name,
    visibility: 'public',
    provenance:
      channel === 'web'
        ? { createdVia: 'web', oauthClientId: null }
        : { createdVia: channel, oauthClientId },
  })
  return { id: list.id, name }
}

// A list has no browse surface: its card is the owner's row on /my/lists.
const row = (page: Page, { name }: SeededList) =>
  page.getByTestId('my-list-row').filter({ hasText: name })

const header = (page: Page) => page.getByTestId('list-header')

test.beforeAll(async () => {
  // Fresh per entry: users.username is globally unique.
  suffix = randomSuffix()
  clientName = `Provenance Agent ${suffix}`
  const author = await createTestUser({ username: `pw-provenance-${suffix}` })
  verifiedClientId = await insertContentProvenanceOAuthClient()
  await renameTestOAuthClient(verifiedClientId, clientName)
  await setTestOAuthClientVerified(verifiedClientId, STAFF_USER_ID)
  unverifiedClientId = await insertContentProvenanceOAuthClient()
  mcpList = await seedList('mcp', author.id, 'detail')
  apiList = await seedList('api', author.id, 'detail')
  webList = await seedList('web', author.id, 'detail')
  staffOwnedMcpList = await seedList('mcp', STAFF_USER_ID, 'staff')
  staffOwnedApiList = await seedList('api', STAFF_USER_ID, 'staff')
  staffOwnedWebList = await seedList('web', STAFF_USER_ID, 'staff')
})

test.describe('List provenance — public viewers', () => {
  test('my lists rows label API and MCP lists and leave web lists unlabeled', async ({ page }) => {
    const owner = await withCleanUser(page)
    const ownMcpList = await seedList('mcp', owner.id, 'own')
    const ownApiList = await seedList('api', owner.id, 'own')
    const ownWebList = await seedList('web', owner.id, 'own')

    await navigateTo(page, '/my/lists')

    await expect(row(page, ownMcpList).getByTestId('list-provenance-badge')).toHaveText(
      `via ${clientName}`,
    )
    await expect(row(page, ownApiList).getByTestId('list-provenance-badge')).toHaveText('via API')
    await expect(row(page, ownWebList)).toBeVisible()
    await expect(row(page, ownWebList).getByTestId('list-provenance-badge')).toHaveCount(0)
    await expect(page.getByTestId('list-provenance-channel')).toHaveCount(0)
  })

  test('list detail shows the label and no staff-only provenance', async ({ page }) => {
    await navigateTo(page, `/list/${apiList.id}`)

    await expect(header(page).getByTestId('list-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('list-provenance-channel')).toHaveCount(0)
    await expect(header(page).getByTestId('list-provenance-client')).toHaveCount(0)
    await expect(header(page).getByTestId('list-provenance-client-verification')).toHaveCount(0)
  })

  test('list detail for a web list has no provenance badge', async ({ page }) => {
    await navigateTo(page, `/list/${webList.id}`)

    await expect(page.getByTestId('list-name')).toHaveText(webList.name)
    await expect(header(page).getByTestId('list-provenance-badge')).toHaveCount(0)
  })
})

test.describe('List provenance — staff viewers', () => {
  test.use({ storageState: AUTH_STATE })

  test('my lists rows show the raw channel of every list but not the client', async ({ page }) => {
    await navigateTo(page, '/my/lists')

    await expect(row(page, staffOwnedMcpList).getByTestId('list-provenance-channel')).toHaveText(
      'Channel: mcp',
    )
    await expect(row(page, staffOwnedApiList).getByTestId('list-provenance-channel')).toHaveText(
      'Channel: api',
    )
    await expect(row(page, staffOwnedWebList).getByTestId('list-provenance-channel')).toHaveText(
      'Channel: web',
    )
    await expect(row(page, staffOwnedWebList).getByTestId('list-provenance-badge')).toHaveCount(0)
    await expect(page.getByTestId('list-provenance-client')).toHaveCount(0)
  })

  test('list detail names the OAuth client and whether staff verified it', async ({ page }) => {
    await navigateTo(page, `/list/${mcpList.id}`)

    await expect(header(page).getByTestId('list-provenance-badge')).toHaveText(`via ${clientName}`)
    await expect(header(page).getByTestId('list-provenance-channel')).toHaveText('Channel: mcp')
    await expect(header(page).getByTestId('list-provenance-client')).toContainText(
      `Client: ${clientName}`,
    )
    await expect(header(page).getByTestId('list-provenance-client-verification')).toHaveText(
      'Verified',
    )

    await navigateTo(page, `/list/${apiList.id}`)

    await expect(header(page).getByTestId('list-provenance-badge')).toHaveText('via API')
    await expect(header(page).getByTestId('list-provenance-client-verification')).toHaveText(
      'Unverified',
    )
  })
})
