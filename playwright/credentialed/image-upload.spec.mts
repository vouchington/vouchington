// Real S3 presigned PUT test — exercises the CORS allow-list on the staging uploads bucket.
// Requires AWS credentials (S3_AWS_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID).
// This test is skipped when credentials or the staging bucket are not available (dependabot /
// untrusted PRs).

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

// Skip the entire suite at the file level so beforeAll (DB write) never runs when
// credentials are absent (dependabot PRs / local dev without AWS config).
test.skip(
  !hasAwsCredentials || !imageUploadsBucket,
  'Requires AWS credentials and S3_BUCKET_IMAGE_UPLOADS',
)

let topic: { id: string; urlSlug: string }

test.beforeAll(async () => {
  const suffix = randomSuffix()
  topic = await insertTestTopic(`image-upload-${suffix}`, `image-upload-${suffix}`, 'card')
})

test('uploads logo image to S3 without CORS error', async ({ page }) => {
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
