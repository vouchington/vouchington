import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchApiKeys } from '@services/api-keys/search'
import { listEmailAddressesPage } from '@services/my/email-addresses'
import { listOwnedOAuthApps } from '@services/oauth-authorization-server/app-management'
import { listUserOAuthGrants } from '@services/oauth-authorization-server/grant-management'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  ACCOUNT_HISTORY,
  deleteAccountListFixture,
  EMAIL_STORAGE_CAP,
  seedAccountListFixture,
} from './account-list-fixtures.mts'

// All four account routes accept up to 100. Email storage has a separate product bound.
const ROUTE_PAGE_SIZE = 100

type Page = { results: { id: string }[]; hasNextPage: boolean }

function assertPage(page: Page, expected: readonly string[], hasNextPage: boolean): void {
  assert.deepEqual(
    page.results.map(row => row.id),
    expected,
  )
  assert.equal(page.hasNextPage, hasNextPage)
}

function captureUuidPages(
  scenario: string,
  name: string,
  expected: readonly string[],
  list: (afterId?: string) => Promise<Page>,
): Promise<void> {
  return runAndCapture(
    scenario,
    async () => {
      assert.ok(expected.length > ROUTE_PAGE_SIZE)
      const first = await list()
      assertPage(first, expected.slice(0, ROUTE_PAGE_SIZE), true)
      const second = await list(first.results.at(-1)!.id)
      assertPage(
        second,
        expected.slice(ROUTE_PAGE_SIZE, ROUTE_PAGE_SIZE * 2),
        expected.length > ROUTE_PAGE_SIZE * 2,
      )
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function captureEmailAddresses(ownerId: string, expected: readonly string[]): Promise<void> {
  const scenario = 'account-email-addresses-at-cap'
  const name = 'listEmailAddressesPage'
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_email_addresses', max: EMAIL_STORAGE_CAP },
      { kind: 'usesIndexes', indexes: ['idx_user_email_addresses__user_primary_id'] },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      assert.equal(expected.length, EMAIL_STORAGE_CAP)
      assertPage(await listEmailAddressesPage(ownerId, { limit: ROUTE_PAGE_SIZE }), expected, false)
      const limit = EMAIL_STORAGE_CAP - 1
      const first = await listEmailAddressesPage(ownerId, { limit })
      assertPage(first, expected.slice(0, limit), true)
      const last = first.results.at(-1)!
      const after = { tier: Number(last.is_primary), id: last.id }
      assertPage(
        await listEmailAddressesPage(ownerId, { limit, after }),
        expected.slice(limit),
        false,
      )
    },
    undefined,
    name,
    { exactCapturedNames: [name, name, name] },
  )
}

export async function runAccountListCapacityScenarios(): Promise<void> {
  const fixture = await seedAccountListFixture()
  try {
    await write(`/* analyzeAccountListFixture */ ANALYZE user_email_addresses, api_keys,
      oauth_clients, oauth_grants, oauth_access_tokens`)
    await captureEmailAddresses(fixture.ownerId, fixture.emailIds)
    registerScenarioContract('account-api-keys-at-cap', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'api_keys', max: ROUTE_PAGE_SIZE + 1 },
        { kind: 'usesIndexes', indexes: ['idx_api_keys__user_id'], noSort: true },
      ],
    })
    await captureUuidPages(
      'account-api-keys-at-cap',
      'searchApiKeys',
      fixture.activeKeyIds,
      afterId => searchApiKeys(fixture.ownerId, { limit: ROUTE_PAGE_SIZE, afterId }),
    )
    registerScenarioContract('account-oauth-apps-at-cap', {
      expectations: [
        { kind: 'noSeqScan', relation: 'oauth_clients' },
        { kind: 'maxProcessedRows', relation: 'oauth_clients', max: ACCOUNT_HISTORY },
      ],
    })
    await captureUuidPages(
      'account-oauth-apps-at-cap',
      'listOwnedOAuthApps',
      fixture.activeClientIds,
      afterId => listOwnedOAuthApps(fixture.ownerId, { limit: ROUTE_PAGE_SIZE, afterId }),
    )
    registerScenarioContract('account-oauth-grants-at-cap', {
      expectations: [
        { kind: 'noSeqScan', relation: 'oauth_grants' },
        {
          kind: 'maxProcessedRows',
          relation: 'oauth_grants',
          // The custom first page walks the global primary index. https://github.com/vouchington/vouchington/issues/6389
          max: 6_735,
        },
        { kind: 'noSeqScan', relation: 'oauth_access_tokens' },
      ],
    })
    await captureUuidPages(
      'account-oauth-grants-at-cap',
      'listUserOAuthGrants',
      fixture.activeGrantIds,
      afterId => listUserOAuthGrants(fixture.ownerId, { limit: ROUTE_PAGE_SIZE, afterId }),
    )
  } finally {
    await deleteAccountListFixture(fixture)
  }
}
