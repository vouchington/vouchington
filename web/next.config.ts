import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { nextBuildPageDataWorkerCount } from './next-build-page-data-worker-count'

const isTestBuild = process.env.NEXT_TEST_BUILD === '1'

export function assertSecureSharpVersion(version: string): void {
  const parsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!parsed || (Number(parsed[1]) === 0 && Number(parsed[2]) < 35)) {
    throw new Error(`The web build requires sharp >=0.35.0; found ${version}`)
  }
}

assertSecureSharpVersion(sharp.versions.sharp)

// In local dev, pages are always loaded from the CF Worker (e.g. localhost:8787).
// Without mkcert: assetPrefix points to Next.js directly (cross-origin); allowedDevOrigins
// lets Next.js accept cross-origin requests from the CF Worker for dev overlay / CORS fonts.
// With mkcert: assetPrefix points to the CF Worker (same-origin); Next.js still receives
// proxied requests from the worker, so allowedDevOrigins still applies.
const workerPort = process.env.WORKER_PORT || '8787'
const nextPort = process.env.NEXT_PORT || '3001'
const storybookPort = process.env.STORYBOOK_PORT || String(Number(nextPort) + 1000)
const allowedDevOrigins =
  process.env.NODE_ENV === 'development' ? [`localhost:${workerPort}`] : undefined

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    authInterrupts: true,
    // Turbopack defaults minify=true for `next build`; skip it for test builds
    // (NEXT_TEST_BUILD=1) to skip minification for faster CI builds.
    turbopackMinify: isTestBuild ? false : undefined,
    // Turbopack's persistent filesystem cache for builds. Off by default (matching
    // Next.js 16's own experimental default): in CI the cache grew to 1.5 GB per
    // job with every job building independently (no cross-job cache sharing), far
    // past what's worth keeping around. WEB_BUILD_FS_CACHE_ENABLED is a repo
    // variable (`vars.WEB_BUILD_FS_CACHE_ENABLED`) for investigating the cache
    // again later without editing code. With it unset/false, web/.next/cache
    // stays near-empty (~260 KB) and this has no effect.
    turbopackFileSystemCacheForBuild: process.env.WEB_BUILD_FS_CACHE_ENABLED === 'true',
    // Next 16.3 defaults this to true and resolves `typescript/bin/tsc` directly.
    // The pinned TypeScript 6 preview intentionally exposes `tsc6` instead, but
    // retains the compiler API Next uses when CLI mode is disabled.
    useTypeScriptCli: false,
    optimizePackageImports: ['lucide-react', 'recharts'],
    // Next defaults this pool to os.cpus().length - 1. Size it from the stricter
    // physical or cgroup memory limit to preserve build headroom on constrained CI hosts.
    // On cgroup v2 with both properties set (this fleet's policy sets both),
    // process.constrainedMemory() returns min(memory.max, memory.high), so on
    // this fleet's capped hosts the value received here is memory.high, not memory.max. See
    // docs/development/reference-host-locks-nextjs-build-worker-reserve.md.
    cpus: nextBuildPageDataWorkerCount({
      physicalMemoryBytes: os.totalmem(),
      constrainedMemoryBytes: process.constrainedMemory(),
      cpuCount: os.cpus().length,
    }),
  },
  reactStrictMode: true,
  reactCompiler: true,
  // Never run TypeScript type checking inside `next build`. Types are checked by
  // the dedicated `typecheck:web` job in static-code-analysis.yml
  // (`next typegen && tsc --noEmit --incremental`), which in the main CI
  // pipeline runs before any build job; type errors never affect `next build`'s
  // emit anyway, so the in-build pass is pure redundant work (~46s/build).
  // (build-web.yml via workflow_dispatch and local `pnpm --dir web build` bypass
  // that gate — run `pnpm run typecheck:web` explicitly there.)
  typescript: { ignoreBuildErrors: true },
  compress: isTestBuild ? false : undefined,
  compiler: {
    reactRemoveProperties: process.env.STRIP_TEST_IDS
      ? { properties: ['^data-(pw|testid)$'] }
      : false,
  },
  poweredByHeader: false,
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  allowedDevOrigins,
  turbopack: {
    // Expand root to the monorepo root so Turbopack can resolve @ts-shared/*
    // packages. These are declared as pnpm workspace packages and hoisted to
    // root node_modules as symlinks; with root:web/ Turbopack cannot follow
    // those symlinks outside its root. With root:monorepo-root, Next.js places
    // standalone output at .next/standalone/web/ (see copy-standalone-assets.sh
    // and package start commands which use that subdirectory path).
    root: path.resolve(__dirname, '..'),
  },
  // Restrict next/image to known remote domains. Update this list when adding
  // external image sources. Currently empty since images are served same-origin
  // via the image lambda / CloudFront.
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
  // Content-Security-Policy is set at the Cloudflare Worker level (cloudflare-worker/src/csp.mts).
  // Do not add CSP headers here — the Worker is the single enforcement point.

  // CORS for cross-origin static assets. Pages load from the CF Worker origin
  // but static files are served by Next.js (via assetPrefix), so browsers and
  // audit tooling require Access-Control-Allow-Origin on cross-origin requests.
  // This header applies in all environments; in production it is harmless
  // because CloudFront serves assets directly (not through Next.js).
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
  async redirects() {
    const ownerPrivatePaths: Array<[string, string]> = [
      ['communities/proxy-following', 'my/communities/proxy-following'],
      ['communities/proxy-muted', 'my/communities/proxy-muted'],
      ['communities/saved', 'my/communities/saved'],
      ['domains/blocked', 'my/domains/blocked'],
      ['domains/muted', 'my/domains/muted'],
      ['posts/following', 'my/posts/following'],
      ['posts/hidden', 'my/posts/hidden'],
      ['posts/saved', 'my/posts/saved'],
      ['posts/subscribed', 'my/posts/subscribed'],
      ['rss-feed-items/hidden', 'my/news-items/hidden'],
      ['rss-feed-items/saved', 'my/news-items/saved'],
      ['rss-feed-items/viewed', 'my/news-items/viewed'],
      ['rss-feeds/muted', 'my/news-sources/muted'],
      ['topics/blocked', 'my/topics/blocked'],
      ['topics/dismissed-recommendations', 'my/topics/dismissed-recommendations'],
      ['topics/muted', 'my/topics/muted'],
      ['topics/viewed', 'my/topics/viewed'],
      ['urls/saved', 'my/urls/saved'],
      ['users/blocked', 'my/users/blocked'],
      ['users/dismissed-recommendations', 'my/users/dismissed-recommendations'],
      ['users/muted', 'my/users/muted'],
      ['users/subscribed-posts', 'my/users/subscribed-posts'],
    ]
    return [
      {
        source: '/how-it-works',
        destination: '/',
        permanent: true,
      },
      {
        source: '/keyboard-shortcuts',
        destination: '/article/keyboard-shortcuts',
        permanent: true,
      },
      ...ownerPrivatePaths.map(([src, dst]) => ({
        source: `/user/:id/${src}`,
        destination: `/${dst}`,
        permanent: false,
      })),
    ]
  },
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return []
    }

    return [
      {
        source: '/storybook',
        destination: `http://127.0.0.1:${storybookPort}/storybook/`,
      },
      {
        source: '/storybook/:path*',
        destination: `http://127.0.0.1:${storybookPort}/storybook/:path*`,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, { sourcemaps: { disable: true } })
