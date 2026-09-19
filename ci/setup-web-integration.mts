#!/usr/bin/env node

import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runPnpm } from './run-pnpm-command.mts'
import { clearStaleTestCaches, getWranglerRuntimeRoot } from './stale-test-cache-cleanup.mts'

const ROOT_DIR = process.cwd()
const WEB_DIR = resolve(ROOT_DIR, 'web')
const WORKER_DIR = resolve(ROOT_DIR, 'cloudflare-worker')

const imageOrigin =
  process.env.IMAGE_ORIGIN ??
  (process.env.IMAGE_LAMBDA_PORT ? `http://localhost:${process.env.IMAGE_LAMBDA_PORT}` : undefined)

// NEXT_PUBLIC_ASSET_PREFIX and NEXT_PUBLIC_API_BASE_URL are Next.js compile-time constants: a
// per-shard port baked into either would make this build unshareable across shards/runs (#10990).
// See docs/overview/infrastructure/reference-environment-variables-web-build-time-and-runtime-public-config.md
// for why neither is needed in CI; robots.ts prerenders its voucha.ai fallback, and this script
// never derives either from a port -- reaching the build is decided by the caller's environment.
const totalStart = performance.now()
const startedAt = new Date().toISOString()
const timingReportPath = process.env.VOUCHINGTON_SETUP_WEB_TIMINGS_JSON
const timings: Record<string, number> = {}
const fsCache = process.env.WEB_BUILD_FS_CACHE_ENABLED === 'true'
const turbopackCachePath = `${WEB_DIR}/.next/cache/turbopack`
const nextBuildCache = !fsCache ? 'disabled' : existsSync(turbopackCachePath) ? 'hit' : 'miss'

// Written after every step below (see timeStep's finally block), not just once at the end, so a
// watchdog SIGKILL mid-`next-build` still leaves partial data on disk for issue #10937.
writeTimingReport()

await timeStep('cache-cleanup', async () => {
  clearStaleTestCaches({
    rootDir: ROOT_DIR,
    preserveNextBuildCache: fsCache,
    wranglerRuntimeDirs: process.env.CI
      ? [
          getWranglerRuntimeRoot(
            process.env.WORKER_PORT ?? '8787',
            process.env.GITHUB_RUN_ATTEMPT ?? '0',
          ),
        ]
      : [],
    log: message => process.stderr.write(`${message}\n`),
  })
})

await timeStep('cloudflare-worker-build', () =>
  runPnpm(ROOT_DIR, ['--dir', 'cloudflare-worker', 'build'], { NODE_ENV: 'production' }),
)
await timeStep('next-build', () =>
  runPnpm(ROOT_DIR, ['--dir', 'web', 'build'], {
    NODE_ENV: 'production',
    NEXT_TEST_BUILD: process.env.NEXT_TEST_BUILD ?? '1',
    ...(imageOrigin !== undefined ? { IMAGE_ORIGIN: imageOrigin } : {}),
    NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY:
      process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA',
    ALLOW_TURNSTILE_TEST_KEY: 'true',
    // VAPID public key used by the push-notifications enable flow. Without it,
    // the handler short-circuits with a "Web push is not configured" toast and
    // the Playwright round-trip test cannot reach the SW registration step.
    // The key is decoded via base64url and passed to PushManager.subscribe(),
    // which Playwright stubs to avoid contacting a real push service.
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ??
      'BHl0gZb-cpN8lY6FjEpmYTFQc-5hFCnM3vYIVOXsHOXOtfsmYmSlEdAOO4eXw3pZTbNuubGHTODWpl_vP7C_OeY',
  }),
)
const webPublicDir = resolve(WEB_DIR, 'public')
const webStandalonePublicDir = resolve(WEB_DIR, '.next', 'standalone', 'web', 'public')
const webStaticDir = resolve(WEB_DIR, '.next', 'static')
const webStandaloneStaticDir = resolve(WEB_DIR, '.next', 'standalone', 'web', '.next', 'static')
const workerBuildPath = resolve(WORKER_DIR, 'dist', 'index.js')
const webStandaloneServerPath = resolve(WEB_DIR, '.next', 'standalone', 'web', 'server.js')

if (!existsSync(workerBuildPath)) {
  throw new Error(`Missing Cloudflare Worker build artifact at ${workerBuildPath}`)
}

if (!existsSync(webStandaloneServerPath)) {
  throw new Error(`Missing Next.js standalone server artifact at ${webStandaloneServerPath}`)
}

await timeStep('standalone-asset-copy', async () => {
  try {
    rmSync(webStandalonePublicDir, { force: true, recursive: true })
    rmSync(webStandaloneStaticDir, { force: true, recursive: true })
    cpSync(webPublicDir, webStandalonePublicDir, { recursive: true })
    cpSync(webStaticDir, webStandaloneStaticDir, { recursive: true })
  } catch (error) {
    // Stable marker for hasWebStackBuildFailureSignal, in case a runner shutdown races the
    // process before GitHub appends its own non-143 exit-code line (#10990 review).
    process.stderr.write(`standalone-asset-copy failed: ${String(error)}\n`)
    throw error
  }
})
timings.total = performance.now() - totalStart
writeTimingReport()

function writeTimingReport(): void {
  if (timingReportPath == null || timingReportPath.trim() === '') return

  try {
    writeFileSync(
      timingReportPath,
      `${JSON.stringify(
        {
          startedAt,
          nextBuildCache,
          timings,
        },
        null,
        2,
      )}\n`,
    )
  } catch (error) {
    // Best-effort diagnostics: a write failure (disk pressure, an unexpected path type) must not
    // abort the build or replace the real build error from timeStep's finally block.
    process.stderr.write(`Failed to write timing report to ${timingReportPath}: ${String(error)}\n`)
  }
}

async function timeStep(name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now()
  try {
    await fn()
  } finally {
    timings[name] = performance.now() - start
    // `finally` still runs when `fn()` rejects (e.g. a watchdog SIGKILL during `next-build`), so
    // this durably records partial progress before the rejection propagates and crashes the
    // script -- see the module doc comment on the incremental write contract for issue #10937.
    writeTimingReport()
  }
}
