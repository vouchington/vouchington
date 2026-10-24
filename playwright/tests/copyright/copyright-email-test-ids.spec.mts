import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { loginAsUser } from '../../helpers/auth.mts'
import { revealOwnedQueueItem } from '../../helpers/copyright-queue.mts'
import { createTestUser } from '../../../backend/test-helpers/entities/users.mts'
import { createParsedCopyrightEmailIntake } from '../../../backend/test-helpers/copyright-email-intake-fixtures.mts'
import { declineTestCopyrightEmailIntake } from '../../../backend/test-helpers/services/copyright-notices/declined-email-intake.mts'
import {
  copyrightEmailMessageId,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '../../../backend/test-helpers/services/copyright-notices/email-thread-cases.mts'
import { failTestCopyrightDeliveryIntent } from '../../../backend/test-helpers/data-stores/psql/copyright-notice-reads.mts'
import { appendCopyrightEmailIntakeRecommendation } from '../../../backend/services/copyright-notices/email-recommendations.mts'

const QUEUE_ENDPOINT = '/api/v1/copyright-email-intakes/review-queue'

async function openQueueItem(page: Page, name: string) {
  const staff = await createTestUser({ administrator: true })
  await loginAsUser(page, staff.id)
  await navigateTo(page, '/copyright/email-review')
  const item = page.getByRole('button', { name, exact: true })
  await revealOwnedQueueItem(page, item, QUEUE_ENDPOINT)
  return item
}

test('an email with an agent recommendation lets staff add and remove hosted images', async ({
  page,
}) => {
  const intake = await createParsedCopyrightEmailIntake()
  await appendCopyrightEmailIntakeRecommendation({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    promptVersion: 'test-v1',
    model: 'test-model',
    structuredOutput: {},
  })
  const item = await openQueueItem(page, `Initial intake ${intake.id}`)
  await item.click()
  await page.getByTestId('copyright-email-approval-add-hosted-image').click()
  await expect(
    page.getByTestId('copyright-email-approval-remove-hosted-image').first(),
  ).toBeAttached()
})

test('staff can start and cancel recording an email as legal process', async ({ page }) => {
  const intake = await createParsedCopyrightEmailIntake()
  const item = await openQueueItem(page, `Initial intake ${intake.id}`)
  await item.click()
  await page.getByTestId('copyright-email-legal-process-action-open-confirm').click()
  await expect(page.getByTestId('copyright-email-legal-process-action-confirm')).toBeAttached()
  await expect(page.getByTestId('copyright-email-legal-process-action-cancel')).toBeAttached()
})

test('a declined email whose reply failed can be retried after confirming', async ({ page }) => {
  const declined = await declineTestCopyrightEmailIntake()
  await failTestCopyrightDeliveryIntent(declined.intentId)
  const item = await openQueueItem(page, `Initial intake ${declined.intakeId}`)
  await page
    .getByRole('listitem')
    .filter({ has: item })
    .getByTestId('copyright-email-reply-retry-open')
    .click()
  await expect(page.getByTestId('copyright-email-reply-retry-confirm')).toBeAttached()
})

test('a reply to an admitted email offers admit and reject correspondence', async ({ page }) => {
  const moderator = await createTestUser({ administrator: true })
  const messageId = copyrightEmailMessageId()
  await promoteInitialCopyrightEmail({ moderator, messageId })
  const reply = await recordThreadedCopyrightEmail({
    messageId: copyrightEmailMessageId(),
    inReplyTo: [messageId],
    replyReferences: [messageId],
  })
  const item = await openQueueItem(page, `Matched correspondence ${reply.intakeId}`)
  await item.click()
  await expect(page.getByTestId('copyright-email-correspondence-actions-admit')).toBeAttached()
  await expect(page.getByTestId('copyright-email-correspondence-actions-reject')).toBeAttached()
})

test('a reply that matches no case can be associated with a notice by staff', async ({ page }) => {
  const reply = await recordThreadedCopyrightEmail({
    messageId: copyrightEmailMessageId(),
    inReplyTo: [copyrightEmailMessageId()],
    replyReferences: [copyrightEmailMessageId()],
  })
  const item = await openQueueItem(page, `Unresolved reply ${reply.intakeId}`)
  await item.click()
  await expect(
    page.getByTestId('copyright-email-notice-association-associate-notice'),
  ).toBeAttached()
})
