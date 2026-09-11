#!/usr/bin/env node

/**
 * Smoke test for the voucha-image-resize Lambda.
 * Verifies the CloudFront-fronted image endpoint and Lambda URL access control.
 *
 * Usage:
 *   node monitors/lambdas/image-resize.mts [staging|production]
 *
 * Environment variables:
 *   ENVIRONMENT         staging (default) or production
 *   TEST_IMAGE_KEY      S3 key that exists; when set, expects a 200 image response
 *   LAMBDA_FUNCTION_URL Direct Lambda URL (https://…lambda-url.us-west-2.on.aws);
 *                       when set, verifies the URL is blocked (403) without SigV4 auth
 */

type Environment = 'staging' | 'production'

const CLOUDFRONT_HOSTS: Record<Environment, string> = {
  staging: 'images-staging.voucha.ai',
  production: 'images.voucha.ai',
}

const env = (process.argv[2] ?? process.env.ENVIRONMENT ?? 'staging') as Environment
if (env !== 'staging' && env !== 'production') {
  console.error(`Unknown environment: ${env}. Use 'staging' or 'production'.`)
  process.exit(1)
}

interface TestResult {
  name: string
  passed: boolean
  message: string
}

const host = CLOUDFRONT_HOSTS[env]
const results: TestResult[] = []

function pass(name: string, message: string): void {
  results.push({ name, passed: true, message })
}

function fail(name: string, message: string): void {
  results.push({ name, passed: false, message })
}

// ── Test 1: nonexistent key → 404, not 5xx ────────────────────────────────

const nonexistentUrl = `https://${host}/images/smoke-test-nonexistent-key-that-does-not-exist?w=200`
try {
  const res = await fetch(nonexistentUrl, { signal: AbortSignal.timeout(15_000) })
  if (res.status === 404) {
    pass('nonexistent key → 404', `Got ${res.status} as expected`)
  } else if (res.status >= 500) {
    fail(
      'nonexistent key → 404',
      `Got ${res.status} — Lambda or CloudFront error. Check CloudWatch logs.`,
    )
  } else if (res.status === 403) {
    fail('nonexistent key → 404', `Got 403 — auth header missing or Lambda URL IAM misconfigured`)
  } else {
    fail('nonexistent key → 404', `Unexpected ${res.status}`)
  }
} catch (err) {
  fail('nonexistent key → 404', `Request failed: ${(err as Error).message}`)
}

// ── Test 2: real image key → 200 image response ───────────────────────────

if (process.env.TEST_IMAGE_KEY) {
  const imageUrl = `https://${host}/images/${process.env.TEST_IMAGE_KEY}?w=200`
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
    const ct = res.headers.get('content-type')
    if (res.status === 200 && ct?.startsWith('image/')) {
      pass('real image key → 200', `Got ${res.status} ${ct}`)
    } else if (res.status === 200) {
      fail('real image key → 200', `Got ${res.status} but Content-Type is "${ct}"`)
    } else {
      fail('real image key → 200', `Got ${res.status}`)
    }
  } catch (err) {
    fail('real image key → 200', `Request failed: ${(err as Error).message}`)
  }
}

// ── Test 3: direct Lambda URL → 403 (AWS_IAM auth blocks unsigned requests) ─

if (process.env.LAMBDA_FUNCTION_URL) {
  const directUrl = `${process.env.LAMBDA_FUNCTION_URL}/images/some-key?w=200`
  try {
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(15_000) })
    if (res.status === 403) {
      pass('direct Lambda URL blocked', `Got ${res.status} — IAM auth is enforced`)
    } else {
      fail(
        'direct Lambda URL blocked',
        `Expected 403, got ${res.status} — Lambda URL may not be protected`,
      )
    }
  } catch (err) {
    fail('direct Lambda URL blocked', `Request failed: ${(err as Error).message}`)
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

const failed = results.filter(r => !r.passed)
for (const r of results) {
  const icon = r.passed ? '✓' : '✗'
  console.log(`${icon} [${r.name}] ${r.message}`)
}

if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} tests failed.`)
  process.exit(1)
} else {
  console.log(`\nAll ${results.length} tests passed.`)
}
