import { expect, test, type Page } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestSavedPostCollection,
  type TestSavedPostCollection,
} from '../../../backend/test-helpers/index.mts'
import {
  getPrivatePostCollectionBrowserClaims,
  type BrowserLifecycleObservation,
  type PrivatePostCollectionBrowserAdapter,
  type PrivatePostCollectionBrowserClaim,
  type PrivatePostCollectionContinuationInput,
  type PrivatePostCollectionRemovalInput,
} from '../../helpers/lifecycle-scenario-manifest.mts'

let ownerId = ''
let collection: TestSavedPostCollection
const PRIVATE_POST_COLLECTION_BROWSER_ADAPTER: PrivatePostCollectionBrowserAdapter =
  'web-playwright-private-post-collection'
const claims = getPrivatePostCollectionBrowserClaims(PRIVATE_POST_COLLECTION_BROWSER_ADAPTER)

test.beforeAll(async () => {
  const continuation = claims.find(isContinuationClaim)
  if (!continuation) throw new Error('Missing private-post browser continuation scenario')
  const suffix = randomSuffix()
  const owner = await createTestUser({ username: `saved-lifecycle-${suffix}` })
  if (!owner) throw new Error('Failed to create saved-post lifecycle owner')
  ownerId = owner.id
  collection = await insertTestSavedPostCollection({
    ownerId,
    visibleCount: continuation.scenario.input.preconditions.visibleCount,
    newerFilteredCount: continuation.scenario.input.preconditions.newerFilteredCount,
    slugPrefix: `saved-lifecycle-${suffix}`,
  })
})

test('executes every claimed private-post browser lifecycle scenario', async ({ page }) => {
  await loginAsUser(page, ownerId)
  for (const claim of claims) {
    const observed = await runPrivatePostCollectionScenario(page, claim)
    expect(observed, claim.scenario.id).toEqual(claim.scenario.expected)
  }
})

async function runPrivatePostCollectionScenario(
  page: Page,
  claim: PrivatePostCollectionBrowserClaim,
): Promise<BrowserLifecycleObservation> {
  await navigateTo(page, '/my/posts/saved')
  if (isContinuationClaim(claim)) {
    const { pageSize } = claim.scenario.input.preconditions
    const loadedPostIds = await loadAllRows(page, pageSize)
    return normalizeContinuationObservation(loadedPostIds)
  }
  if (!isRemovalClaim(claim))
    throw new Error(`Unsupported private-post scenario ${claim.scenario.id}`)
  await loadAllRows(page)
  const actualIdsByScenarioId = scenarioItemActualIds(claim)
  const removedPostId = actualIdsByScenarioId.get(claim.scenario.input.action.itemId)
  if (!removedPostId)
    throw new Error(`Missing fixture row for ${claim.scenario.input.action.itemId}`)
  const removeRow = postRelationRow(page, removedPostId)
  await expect(removeRow).toBeVisible()
  await removeRow.getByTestId('relation-management-action').click()
  await expect(removeRow).not.toBeAttached()
  return normalizeRemovalObservation(
    claim,
    await rowIds(page.getByTestId('post-relation-row')),
    actualIdsByScenarioId,
  )
}

async function loadAllRows(page: Page, pageSize?: number): Promise<string[]> {
  const rows = page.getByTestId('post-relation-row')
  if (pageSize) await expect(rows).toHaveCount(pageSize)
  const continuation = page.getByTestId('paginated-list-continuation')
  await expect(continuation).toBeVisible()
  await continuation.getByRole('button').click()
  await expect(continuation).toBeHidden()
  return rowIds(rows)
}

async function rowIds(rows: ReturnType<Page['getByTestId']>): Promise<string[]> {
  return rows.evaluateAll(elements =>
    elements.flatMap(element => {
      const postId = element.getAttribute('data-post-id')
      return postId ? [postId] : []
    }),
  )
}

function normalizeContinuationObservation(loadedPostIds: string[]): BrowserLifecycleObservation {
  return {
    visibleState: {
      loadedVisibleCount: loadedPostIds.length,
      duplicates: loadedPostIds.length - new Set(loadedPostIds).size,
    },
    availableActions: [],
    reconciliation: { strategy: 'browser-continuation' },
    cancellation: { behavior: 'not-applicable' },
  }
}

function normalizeRemovalObservation(
  claim: PrivatePostCollectionBrowserClaim & {
    scenario: { input: PrivatePostCollectionRemovalInput }
  },
  loadedPostIds: string[],
  actualIdsByScenarioId: Map<string, string>,
): BrowserLifecycleObservation {
  const presentItemIds = claim.scenario.input.preconditions.loadedItemIds.filter(scenarioItemId => {
    const actualId = actualIdsByScenarioId.get(scenarioItemId)
    return actualId
      ? loadedPostIds.includes(actualId) && scenarioItemId !== claim.scenario.input.action.itemId
      : false
  })
  return {
    visibleState: {
      presentItemIds,
      absentItemIds: claim.scenario.input.preconditions.loadedItemIds.filter(
        scenarioItemId => !presentItemIds.includes(scenarioItemId),
      ),
    },
    availableActions: [],
    reconciliation: { strategy: 'remove-one-by-id' },
    cancellation: { behavior: 'not-applicable' },
  }
}

function scenarioItemActualIds(
  claim: PrivatePostCollectionBrowserClaim & {
    scenario: { input: PrivatePostCollectionRemovalInput }
  },
): Map<string, string> {
  const scenarioItemIds = claim.scenario.input.preconditions.loadedItemIds
  const actualIds = [
    collection.visiblePostIds[0]!,
    ...collection.visiblePostIds.slice(-(scenarioItemIds.length - 1)),
  ]
  if (actualIds.length !== scenarioItemIds.length || actualIds.some(id => !id)) {
    throw new Error(
      `Saved-post fixture cannot satisfy ${claim.scenario.id} loaded-item preconditions`,
    )
  }
  return new Map(
    scenarioItemIds.map((scenarioItemId, index) => [scenarioItemId, actualIds[index]!]),
  )
}

function postRelationRow(page: Page, postId: string) {
  return page.locator(`[data-pw="post-relation-row"][data-post-id="${postId}"]`)
}

function isContinuationClaim(
  claim: PrivatePostCollectionBrowserClaim,
): claim is PrivatePostCollectionBrowserClaim & {
  scenario: { input: PrivatePostCollectionContinuationInput }
} {
  return claim.scenario.input.action.type === 'load-more'
}

function isRemovalClaim(
  claim: PrivatePostCollectionBrowserClaim,
): claim is PrivatePostCollectionBrowserClaim & {
  scenario: { input: PrivatePostCollectionRemovalInput }
} {
  return claim.scenario.input.action.type === 'remove'
}
