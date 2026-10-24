import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'

test.use({ storageState: AUTH_STATE })

test('deep comment permalink offers earlier replies', async ({ page }) => {
  const author = requireTestValue(await createTestUser(), 'Failed to create ancestor author')
  const root = await createTestPost({
    user: author,
    post_type: 'discussion',
    title: `Ancestor trail ${randomSuffix()}`,
  })
  let parentId = root.id
  for (let depth = 0; depth < 7; depth++) {
    const comment = await createTestPost({
      user: author,
      post_type: 'comment',
      parent_post_id: parentId,
      markdown: `Ancestor level ${depth}`,
    })
    parentId = comment.id
  }

  await navigateTo(page, `/discussion/${root.id}/comment/${parentId}`)
  await expect(page.getByTestId('comment-ancestor-trail-retry')).toBeVisible()
})
