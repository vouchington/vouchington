#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const MANIFEST = resolve(ROOT, 'web/.next/standalone/web-build-cache-manifest.json')
const PROFILE = 'ci-production-worker-assets-v1'

function expectedManifest() {
  const sourceSha = process.env.GITHUB_SHA
  const runId = process.env.GITHUB_RUN_ID
  const attempt = process.env.GITHUB_RUN_ATTEMPT
  const os = process.env.RUNNER_OS
  const arch = process.env.RUNNER_ARCH
  if (!sourceSha?.match(/^[a-f0-9]{40}$/) || !runId || !attempt || !os || !arch) {
    throw new Error('Missing shared web build cache identity from GitHub Actions')
  }
  return { version: 1, profile: PROFILE, sourceSha, runId, attempt, os, arch }
}

function hasCompleteRuntime(): boolean {
  const standalone = resolve(ROOT, 'web/.next/standalone/web')
  const staticDir = resolve(ROOT, 'web/.next/static')
  const copiedStaticDir = resolve(standalone, '.next/static')
  const publicDir = resolve(standalone, 'public')
  const server = resolve(standalone, 'server.js')
  const worker = resolve(ROOT, 'cloudflare-worker/dist/index.js')
  return (
    existsSync(server) &&
    statSync(server).isFile() &&
    statSync(server).size > 0 &&
    existsSync(worker) &&
    statSync(worker).isFile() &&
    statSync(worker).size > 0 &&
    existsSync(publicDir) &&
    statSync(publicDir).isDirectory() &&
    existsSync(staticDir) &&
    statSync(staticDir).isDirectory() &&
    readdirSync(staticDir).length > 0 &&
    existsSync(copiedStaticDir) &&
    statSync(copiedStaticDir).isDirectory() &&
    readdirSync(copiedStaticDir).length > 0
  )
}

const mode = process.argv[2]
if (mode !== 'write' && mode !== 'verify') {
  throw new Error('Usage: node ci/web-build-cache-manifest.mts write|verify')
}

const expected = expectedManifest()
if (!hasCompleteRuntime()) {
  throw new Error('Shared web build runtime output is incomplete')
}

if (mode === 'write') {
  writeFileSync(MANIFEST, `${JSON.stringify(expected)}\n`)
} else if (
  !existsSync(MANIFEST) ||
  readFileSync(MANIFEST, 'utf8') !== `${JSON.stringify(expected)}\n`
) {
  throw new Error('Shared web build cache manifest does not match this CI run')
}
