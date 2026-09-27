#!/usr/bin/env node

/**
 * CloudFront placement-delivery and unsigned Lambda URL smoke test.
 * Usage: node monitors/lambdas/image-resize.mts [staging|production]
 * TEST_IMAGE_PLACEMENT_PATH: current /images/placements/<placement>/<revision>/<image>
 * whose registry tuple is allowed and source exists; optional image/200 check.
 * LAMBDA_FUNCTION_URL: optional unsigned direct-access/403 check.
 */

type Environment = 'staging' | 'production'
const CLOUDFRONT_HOSTS: Record<Environment, string> = {
  staging: 'images-staging.voucha.ai',
  production: 'images.voucha.ai',
}
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PLACEMENT_PATH = new RegExp(`^/images/placements/${UUID}/(0|[1-9][0-9]*)/${UUID}$`)

export interface TestResult {
  name: string
  passed: boolean
  message: string
}

export async function runImageResizeSmoke(input: {
  imageOrigin: string
  testImagePlacementPath?: string
  lambdaFunctionUrl?: string
}): Promise<TestResult[]> {
  const livePath = input.testImagePlacementPath
  if (livePath) {
    const match = PLACEMENT_PATH.exec(livePath)
    if (!match || match[0] !== livePath || Number(match[1]) > 2147483647) {
      throw new Error('TEST_IMAGE_PLACEMENT_PATH must be a canonical current image placement path')
    }
  }
  const missingPath = `/images/placements/${crypto.randomUUID()}/0/${crypto.randomUUID()}`
  const checks = [
    {
      name: 'missing placement tuple → 404',
      url: new URL(`${missingPath}?w=200`, input.imageOrigin),
      status: 404,
      image: false,
    },
    {
      name: 'removed generic image route → 404',
      url: new URL(`/images/${crypto.randomUUID()}?w=200`, input.imageOrigin),
      status: 404,
      image: false,
    },
  ]
  if (livePath) {
    checks.push({
      name: 'current allowed placement → 200 image',
      url: new URL(`${livePath}?w=200`, input.imageOrigin),
      status: 200,
      image: true,
    })
  }
  if (input.lambdaFunctionUrl) {
    checks.push({
      name: 'direct Lambda URL blocked → 403',
      url: new URL(`${missingPath}?w=200`, input.lambdaFunctionUrl),
      status: 403,
      image: false,
    })
  }
  const results: TestResult[] = []
  for (const check of checks) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- smoke probes are bounded and report each endpoint independently.
      const response = await fetch(check.url, { signal: AbortSignal.timeout(15_000) })
      const contentType = response.headers.get('content-type')
      const passed =
        response.status === check.status && (!check.image || contentType?.startsWith('image/'))
      // Only headers are needed; release response bodies/connections before the next probe.
      // oxlint-disable-next-line no-await-in-loop -- response cleanup precedes the next bounded smoke probe.
      await response.body?.cancel()
      results.push({
        name: check.name,
        passed: Boolean(passed),
        message: `Expected ${check.status}${check.image ? ' image/*' : ''}; got ${response.status} ${contentType ?? ''}`,
      })
    } catch (error) {
      results.push({ name: check.name, passed: false, message: `Request failed: ${String(error)}` })
    }
  }
  return results
}

async function main(): Promise<void> {
  const environment = process.argv[2] ?? process.env.ENVIRONMENT ?? 'staging'
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error(`Unknown environment: ${environment}. Use 'staging' or 'production'.`)
  }
  const results = await runImageResizeSmoke({
    imageOrigin: `https://${CLOUDFRONT_HOSTS[environment]}`,
    testImagePlacementPath: process.env.TEST_IMAGE_PLACEMENT_PATH,
    lambdaFunctionUrl: process.env.LAMBDA_FUNCTION_URL,
  })
  for (const result of results) {
    console.log(`${result.passed ? '✓' : '✗'} [${result.name}] ${result.message}`)
  }
  const failed = results.filter(result => !result.passed)
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} tests failed.`)
    process.exitCode = 1
  } else {
    console.log(`\nAll ${results.length} tests passed.`)
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
