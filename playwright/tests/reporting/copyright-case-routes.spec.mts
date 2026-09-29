import { expect, test, type Locator, type Page } from '../../helpers/test.mts'
import { scrollToLoadMore } from '../../helpers/scroll-to-load-more.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createCopyrightCaseFixture } from '../../helpers/create-copyright-case-fixture.mts'
import { createParsedCopyrightEmailIntake } from '../../../backend/services/copyright-notices/email-intake-test-fixtures.mts'

test('accepted case links retain poster scope in appeal and statutory counter-notice forms', async ({
  page,
}) => {
  const fixture = await createCopyrightCaseFixture()
  await loginAsUser(page, fixture.poster.id)
  await navigateTo(page, '/copyright/notices')
  const caseLink = page.getByRole('link', { name: `Case ${fixture.noticeId}`, exact: true })
  await expect(caseLink).toBeVisible()
  await caseLink.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Copyright notice')
  await navigateTo(page, `/copyright/notices/${fixture.noticeId}`)
  await expect(page.getByText(`Case ${fixture.noticeId}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Appeal', exact: true })).toBeVisible()

  await navigateTo(page, `/copyright/notices/${fixture.noticeId}/appeal`)
  const reason = page.getByLabel('Why should this action be changed?')
  await reason.pressSequentially('This is my owned photograph and placement.')
  await expect(reason).toHaveValue('This is my owned photograph and placement.')
  const target = page.getByRole('checkbox', { name: 'Affected material 1', exact: true })
  await expect(target).toBeChecked()
  await target.click()
  await expect(target).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Submit appeal', exact: true })).toBeDisabled()
  await target.click()
  await expect(target).toBeChecked()

  await navigateTo(page, `/copyright/notices/${fixture.noticeId}/counter-notice`)
  await page
    .getByLabel('Full legal name', { exact: true })
    .pressSequentially('Owned Material Poster')
  await expect(page.getByLabel('Full legal name', { exact: true })).toHaveValue(
    'Owned Material Poster',
  )
  const declaration = page.getByRole('checkbox', { name: /I state under penalty of perjury/ })
  await declaration.click()
  await expect(declaration).toBeChecked()
  const counterTarget = page.getByRole('checkbox', { name: 'Affected material 1', exact: true })
  await counterTarget.click()
  await expect(counterTarget).not.toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Submit counter-notice', exact: true }),
  ).toBeDisabled()
  const warning = page.getByTestId('copyright-misrepresentation-warning')
  await expect(warning).toContainText('512(f)')
  await expect(warning.getByRole('link')).toHaveAttribute('href', '/article/copyright-complaints')
})

test('staff review rationale hydrates for a genuine pending restriction', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  await loginAsUser(page, fixture.moderator.id)
  await navigateTo(page, '/copyright/review-queue')
  const item = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: `Case ${fixture.noticeId}`, exact: true }) })
  await revealOwnedQueueItem(page, item, '/api/v1/copyright-notices/review-queue')
  await expect(item).toBeVisible()
  const confirm = item.getByRole('button', { name: 'Confirm restriction', exact: true })
  await expect(confirm).toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Review rationale', exact: true })
    .pressSequentially('Review the owned fixture placement and current assessment.')
  await expect(confirm).toBeEnabled()
})

test('email review loads real parsed evidence and hydrates the private rationale', async ({
  page,
}) => {
  const fixture = await createCopyrightCaseFixture()
  const intake = await createParsedCopyrightEmailIntake()
  await loginAsUser(page, fixture.moderator.id)
  await navigateTo(page, '/copyright/email-review')
  const item = page.getByRole('button', { name: `Initial intake ${intake.id}`, exact: true })
  await revealOwnedQueueItem(page, item, '/api/v1/copyright-email-intakes/review-queue')
  await item.click()
  await expect(
    page.getByRole('heading', { name: 'Staff-private evidence', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('main').last()).toContainText('This is a copyright complaint.')
  const rationale = page.getByRole('textbox', { name: 'Review rationale', exact: true })
  await rationale.pressSequentially('Manual review of preserved email evidence.')
  await expect(rationale).toHaveValue('Manual review of preserved email evidence.')
})

test('guest filing page accepts a case access token', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  await navigateTo(page, `/copyright/notices/${fixture.noticeId}/guest`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Copyright case filing')
  await expect(page.getByLabel('Case access token', { exact: true })).toBeVisible()
})

async function revealOwnedQueueItem(page: Page, item: Locator, endpoint: string): Promise<void> {
  await expect
    .poll(async () => {
      if (await item.count()) return true
      await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()
      const nextPage = page.waitForResponse(response => {
        const url = new URL(response.url())
        return url.pathname === endpoint && url.searchParams.has('after') && response.ok()
      })
      await scrollToLoadMore(page)
      await nextPage
      return (await item.count()) > 0
    })
    .toBe(true)
  await item.scrollIntoViewIfNeeded()
}
