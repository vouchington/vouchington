// Real S3 presigned PUT test — exercises the CORS allow-list on the staging uploads bucket.
// Runs only in the credentialed Playwright workflow, which provides AWS credentials and
// S3_BUCKET_IMAGE_UPLOADS. A missing credential fails the test.

import { test, expect } from '../../playwright/helpers/test.mts'
import { navigateTo } from '../../playwright/helpers/navigate-to.mts'
import { loginAsAdmin } from '../../playwright/helpers/auth.mts'
import { insertTestTopic } from '../../playwright/helpers/insert-test-topic.mts'
import { TEST_PNG } from '../../playwright/helpers/test-fixtures.mts'
import { randomSuffix } from '../../playwright/helpers/random-id.mts'

const hasAwsCredentials = Boolean(process.env.S3_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)
const imageUploadsBucket = process.env.S3_BUCKET_IMAGE_UPLOADS?.trim()
const S3_DUALSTACK_HOST_SUFFIX = '.s3.dualstack.us-west-2.amazonaws.com'

function expectNoEmptyChecksumQueryParams(uploadUrl: URL): void {
  const emptyChecksumParams = [...uploadUrl.searchParams].filter(
    ([name, value]) => name.toLowerCase().includes('checksum') && value === '',
  )
  expect(emptyChecksumParams).toHaveLength(0)
}

test('uploads logo image to S3 without CORS error', async ({ page }) => {
  expect(
    hasAwsCredentials && Boolean(imageUploadsBucket),
    'AWS credentials and S3_BUCKET_IMAGE_UPLOADS are required for this credentialed test.',
  ).toBe(true)
  const suffix = randomSuffix()
  const topic = await insertTestTopic(`image-upload-${suffix}`, `image-upload-${suffix}`, 'card')

  await loginAsAdmin(page)
  await navigateTo(page, `/card/${topic.id}/settings/about`)
  await page.locator('[data-hydrated="true"]').waitFor()

  // Register the response promise BEFORE triggering the upload to avoid a race
  // condition where the PUT completes before waitForResponse is set up.
  // Filter by method=PUT so we skip the CORS OPTIONS preflight and only assert
  // on the actual upload response to the audited dual-stack S3 host shape.
  const s3ResponsePromise = page.waitForResponse(
    response =>
      new URL(response.url()).hostname === `${imageUploadsBucket}${S3_DUALSTACK_HOST_SUFFIX}` &&
      response.request().method() === 'PUT',
    { timeout: 15_000 },
  )

  await page
    .getByTestId('topic-image-logo-upload')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(TEST_PNG) })

  // Wait for the presigned S3 PUT to complete (CORS success = 200/204, CORS failure = 403 preflight)
  const s3Response = await s3ResponsePromise
  const uploadUrl = new URL(s3Response.url())
  expectNoEmptyChecksumQueryParams(uploadUrl)
  expect(s3Response.status()).toBeGreaterThanOrEqual(200)
  expect(s3Response.status()).toBeLessThan(300)
})
