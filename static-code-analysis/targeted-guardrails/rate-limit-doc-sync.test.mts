import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkTargetedGuardrails } from './index.mts'
import { checkRateLimitDocBindingsSync } from './rate-limit-doc-sync.mts'

const testRoot = process.env.RUNNER_TEMP || tmpdir()

function sourceWithBindings(bindings: string[]): string {
  const lines = bindings.map(binding => `  ${binding}?: RateLimiterBinding`).join('\n')
  return `export interface Env {
${lines}
  WEB_ORIGIN?: string
}`
}

function docWithBindings(bindings: string[]): string {
  const rows = bindings.map(binding => `| \`${binding}\` | Purpose |`).join('\n')
  return `# Cloudflare Worker

## Rate Limiting

| Binding | Purpose |
| --- | --- |
${rows}
`
}

describe('rate-limit binding documentation sync guard', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('keeps documented bindings in sync with Env rate-limit bindings', () => {
    const bindings = ['RATE_LIMITER_GET_HEAD', 'RATE_LIMITER_SERVER_ACTION']

    expect(
      checkRateLimitDocBindingsSync({
        sourceCode: sourceWithBindings(bindings),
        docMarkdown: docWithBindings(bindings),
      }),
    ).toEqual([])
  })

  it('flags Env rate-limit bindings missing from the reference', () => {
    const errors = checkRateLimitDocBindingsSync({
      sourceCode: sourceWithBindings(['RATE_LIMITER_GET_HEAD', 'RATE_LIMITER_SERVER_ACTION']),
      docMarkdown: docWithBindings(['RATE_LIMITER_GET_HEAD']),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('missing Env binding(s): `RATE_LIMITER_SERVER_ACTION`')
  })

  it('flags stale reference rate-limit bindings missing from Env', () => {
    const errors = checkRateLimitDocBindingsSync({
      sourceCode: sourceWithBindings(['RATE_LIMITER_GET_HEAD']),
      docMarkdown: docWithBindings(['RATE_LIMITER_GET_HEAD', 'RATE_LIMITER_SERVER_ACTION']),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('stale Env binding(s): `RATE_LIMITER_SERVER_ACTION`')
  })

  it('ignores commented-out and duplicate Env rate-limit bindings', () => {
    const sourceCode = `${sourceWithBindings(['RATE_LIMITER_GET_HEAD'])}
// RATE_LIMITER_COMMENTED?: RateLimiterBinding
/*
  RATE_LIMITER_BLOCK_COMMENTED?: RateLimiterBinding
*/
export interface MoreEnv {
  RATE_LIMITER_GET_HEAD?: RateLimiterBinding
}`

    expect(
      checkRateLimitDocBindingsSync({
        sourceCode,
        docMarkdown: docWithBindings(['RATE_LIMITER_GET_HEAD']),
      }),
    ).toEqual([])
  })

  it('reports missing source rate-limit bindings clearly', () => {
    const errors = checkRateLimitDocBindingsSync({
      sourceCode: 'export interface Env { WEB_ORIGIN?: string }',
      docMarkdown: docWithBindings(['RATE_LIMITER_GET_HEAD']),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('no RATE_LIMITER_* Env bindings found')
  })

  it('does not flag unrelated Env changes while rate-limit bindings stay in sync', async () => {
    const repoRoot = await mkdtemp(join(testRoot, 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/types.mts'
    const docFile = 'cloudflare-worker/reference-rate-limiting.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(
      join(repoRoot, sourceFile),
      sourceWithBindings(['RATE_LIMITER_SERVER_ACTION']).replace(
        '  WEB_ORIGIN?: string',
        '  WEB_ORIGIN?: string\n  PRODUCTION?: string',
      ),
    )
    await writeFile(join(repoRoot, docFile), docWithBindings(['RATE_LIMITER_SERVER_ACTION']))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [sourceFile, docFile],
      trackedFileSet: new Set([sourceFile, docFile]),
    })

    expect(result.errors).toEqual([])
  })

  it('reports a missing reference path when rate-limit source remains tracked', async () => {
    const repoRoot = await mkdtemp(join(testRoot, 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/types.mts'
    const docFile = 'cloudflare-worker/reference-rate-limiting.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(join(repoRoot, sourceFile), sourceWithBindings(['RATE_LIMITER_SERVER_ACTION']))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [sourceFile, docFile],
      trackedFileSet: new Set([sourceFile, docFile]),
    })

    expect(result.errors).toEqual([
      '::error file=cloudflare-worker/src/types.mts::cloudflare-worker/src/types.mts: rate-limit doc-sync guard expects cloudflare-worker/reference-rate-limiting.md to exist; if you renamed one of the two, update the guard path constants together',
    ])
  })

  it('checks reference-document changes against the current Env bindings', async () => {
    const repoRoot = await mkdtemp(join(testRoot, 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/types.mts'
    const docFile = 'cloudflare-worker/reference-rate-limiting.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(join(repoRoot, sourceFile), sourceWithBindings(['RATE_LIMITER_SERVER_ACTION']))
    await writeFile(join(repoRoot, docFile), docWithBindings([]))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [sourceFile, docFile],
      trackedFileSet: new Set([sourceFile, docFile]),
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('missing Env binding(s): `RATE_LIMITER_SERVER_ACTION`')
  })

  it('does not let an untracked reference document satisfy a tracked source', async () => {
    const repoRoot = await mkdtemp(join(testRoot, 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/types.mts'
    const docFile = 'cloudflare-worker/reference-rate-limiting.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(join(repoRoot, sourceFile), sourceWithBindings(['RATE_LIMITER_SERVER_ACTION']))
    await writeFile(join(repoRoot, docFile), docWithBindings(['RATE_LIMITER_SERVER_ACTION']))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [sourceFile],
      trackedFileSet: new Set([sourceFile]),
    })

    expect(result.errors).toEqual([
      '::error file=cloudflare-worker/src/types.mts::cloudflare-worker/src/types.mts: rate-limit doc-sync guard expects cloudflare-worker/reference-rate-limiting.md to also be tracked; if you renamed one of the two, update the guard path constants together',
    ])
  })

  it('does not let an untracked source satisfy a tracked reference document', async () => {
    const repoRoot = await mkdtemp(join(testRoot, 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/types.mts'
    const docFile = 'cloudflare-worker/reference-rate-limiting.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await writeFile(join(repoRoot, sourceFile), sourceWithBindings(['RATE_LIMITER_SERVER_ACTION']))
    await writeFile(join(repoRoot, docFile), docWithBindings(['RATE_LIMITER_SERVER_ACTION']))

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [docFile],
      trackedFileSet: new Set([docFile]),
    })

    expect(result.errors).toEqual([
      '::error file=cloudflare-worker/reference-rate-limiting.md::cloudflare-worker/reference-rate-limiting.md: rate-limit doc-sync guard expects cloudflare-worker/src/types.mts to also be tracked; if you renamed one of the two, update the guard path constants together',
    ])
  })
})
