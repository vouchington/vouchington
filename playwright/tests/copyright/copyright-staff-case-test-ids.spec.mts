import { expect, test, type Page } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { loginAsUser } from '../../helpers/auth.mts'
import { createCopyrightCaseFixture } from '../../helpers/create-copyright-case-fixture.mts'
import { revealOwnedQueueItem } from '../../helpers/copyright-queue.mts'
import {
  addCopyrightAppeal,
  addCopyrightCounterNotice,
  addCopyrightLegalHold,
  addCopyrightStaydownMatch,
  failCopyrightRecoveryIntents,
  issueManyCopyrightGuestCapabilities,
} from '../../../backend/test-helpers/copyright-staff-case-states.mts'

const QUEUE_ENDPOINT = '/api/v1/copyright-notices/review-queue'

async function openCase(
  page: Page,
  fixture: Awaited<ReturnType<typeof createCopyrightCaseFixture>>,
) {
  await loginAsUser(page, fixture.moderator.id)
  await navigateTo(page, '/copyright/review-queue')
  const item = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: `Case ${fixture.noticeId}`, exact: true }) })
  await revealOwnedQueueItem(page, item, QUEUE_ENDPOINT)
  return item
}

test('staff issue guest access, then ask for information or revoke it', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  const item = await openCase(page, fixture)
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  await item
    .getByLabel('Access expires')
    .fill(
      `${expiry.getFullYear()}-${pad(expiry.getMonth() + 1)}-${pad(expiry.getDate())}T${pad(expiry.getHours())}:${pad(expiry.getMinutes())}`,
    )
  await item.getByTestId('copyright-staff-guest-capability-issue').click()
  await expect(item.getByTestId('copyright-staff-guest-capability-rows-revoke')).toBeAttached()
  await item.getByTestId('copyright-staff-guest-capability-rows-request').click()
  await expect(
    item.getByTestId('copyright-staff-guest-capability-request-information'),
  ).toBeAttached()
})

test('a failed guest access list can be reloaded', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  await page.route('**/api/v1/copyright-notices/*/guest-capabilities*', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  const item = await openCase(page, fixture)
  await expect(item.getByTestId('copyright-staff-guest-capability-rows-reload')).toBeVisible()
})

test('guest access past the first page offers older entries', async ({ page }) => {
  const fixture = await createCopyrightCaseFixture()
  await issueManyCopyrightGuestCapabilities(fixture, 26)
  const item = await openCase(page, fixture)
  await expect(item.getByTestId('copyright-staff-guest-capability-rows-load-older')).toBeAttached()
})

test('a case with an appeal, counter-notice, court filing and failures shows its review controls', async ({
  page,
}) => {
  const fixture = await createCopyrightCaseFixture()
  await addCopyrightAppeal(fixture)
  await addCopyrightCounterNotice(fixture)
  await addCopyrightLegalHold(fixture.noticeId)
  await failCopyrightRecoveryIntents(fixture.noticeId)
  await addCopyrightStaydownMatch(fixture)
  const item = await openCase(page, fixture)
  await expect(item.getByTestId('copyright-staff-case-appeal-submit')).toBeAttached()
  await expect(item.getByTestId('copyright-staff-case-legal-hold-submit')).toBeAttached()
  await expect(item.getByTestId('copyright-staff-case-detail-retry').first()).toBeAttached()
  await expect(item.getByTestId('copyright-staff-staydown-matches-mark-reviewed')).toBeAttached()
  await expect(item.getByTestId('copyright-staff-review-buttons-approve').first()).toBeAttached()
})
