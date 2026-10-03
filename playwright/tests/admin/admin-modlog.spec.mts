import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser, insertTestModeratorAction } from '../../../backend/test-helpers/index.mts'

test.use({ storageState: AUTH_STATE })

test.describe('admin modlog', () => {
  let actorId = ''
  let actorUsername = ''
  let reason = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    actorUsername = `modlog-actor-${suffix}`
    const actor = await createTestUser({ username: actorUsername })
    actorId = actor.id
    reason = `Modlog fixture ${suffix}`
    await insertTestModeratorAction({ actorId, actionType: 'ban', reason })
  })

  test('admin sees the filtered moderation action', async ({ page }) => {
    await navigateTo(page, `/admin/modlog?actor_id=${actorId}`)
    await expect(page.getByTestId('admin-modlog-heading')).toBeVisible()
    const row = page.getByTestId('admin-modlog-row')
    await expect(row).toHaveCount(1)
    await expect(row).toBeVisible()
    await expect(row).toContainText(`@${actorUsername}`)
    await expect(row).toContainText('ban')
    await expect(row).toContainText(reason)
  })
})
