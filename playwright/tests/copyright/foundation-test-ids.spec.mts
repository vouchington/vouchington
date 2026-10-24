import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { createCopyrightCaseFixture } from '../../helpers/create-copyright-case-fixture.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test('a restricted notice links the poster to the hosted material', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  await loginAsUser(page, fixture.poster.id)
  await navigateTo(page, `/copyright/notices/${fixture.noticeId}`)
  await expect(page.getByTestId('copyright-notice-hosted-use-url')).toBeAttached()
})
