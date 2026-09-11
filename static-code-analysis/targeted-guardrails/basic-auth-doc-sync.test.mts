import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkBasicAuthRunbookExemptPathsSync } from './basic-auth-doc-sync.mts'
import type { ExemptRoute } from './basic-auth-doc-sync-parsers.mts'
import { checkTargetedGuardrails } from './index.mts'

function basicAuthSource(routes: ExemptRoute[]): string {
  const paths = routes.map(route => route.path)
  const methods = routes
    .map(route => `  [${JSON.stringify(route.path)}, new Set(${JSON.stringify(route.methods)})],`)
    .join('\n')
  return `const BASIC_AUTH_EXEMPT_PATHS = new Set(${JSON.stringify(paths, null, 2)})

const BASIC_AUTH_EXEMPT_METHODS_BY_PATH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
${methods}
])
`
}

function basicAuthRunbook(routes: ExemptRoute[]): string {
  const rows = routes
    .map(
      route =>
        `| \`${route.path}\` | ${route.methods.map(method => `\`${method}\``).join(', ')} | Caller | Auth |`,
    )
    .join('\n')
  return `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | --- | --- | --- |
${rows}

## Enable
`
}

const syncedRoutes: ExemptRoute[] = [
  { methods: ['POST'], path: '/api/v1/mcp' },
  { methods: ['GET', 'HEAD'], path: '/infra/ping' },
]

describe('basic-auth exempt path doc sync guard', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('keeps the runbook table in sync with source', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: basicAuthSource(syncedRoutes),
        runbookMarkdown: basicAuthRunbook(syncedRoutes),
      }),
    ).toEqual([])
  })

  it('accepts static template literals in source exempt paths', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode:
          'const BASIC_AUTH_EXEMPT_PATHS = new Set([`/api/v1/mcp`, "/infra/ping"])\nconst BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([[`/api/v1/mcp`, new Set(["POST"])], ["/infra/ping", new Set(["GET", "HEAD"])]])',
        runbookMarkdown: basicAuthRunbook(syncedRoutes),
      }),
    ).toEqual([])
  })

  it('accepts comments and trailing commas in source exempt paths and methods', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `
const BASIC_AUTH_EXEMPT_PATHS = new Set([
  // MCP clients call this route directly.
  '/api/v1/mcp',
  '/infra/ping', /* health check */
])

const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/api/v1/mcp', new Set(['POST'])],
  ['/infra/ping', new Set([
    'GET',
    'HEAD', /* liveness probe */
  ])],
])
`,
        runbookMarkdown: basicAuthRunbook(syncedRoutes),
      }),
    ).toEqual([])
  })

  it('ignores similar maps after the basic auth method map', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `${basicAuthSource(syncedRoutes)}

const UNRELATED_METHODS_BY_PATH = new Map([
  ['/debug/status', new Set(['GET'])],
])
`,
        runbookMarkdown: basicAuthRunbook(syncedRoutes),
      }),
    ).toEqual([])
  })

  it('accepts one-hyphen Markdown table separators', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: basicAuthSource(syncedRoutes),
        runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| - | - | - | - |
| \`/api/v1/mcp\` | \`POST\` | Caller | Auth |
| \`/infra/ping\` | \`GET\`, \`HEAD\` | Caller | Auth |
`,
      }),
    ).toEqual([])
  })

  it('rejects malformed Markdown table separators before route rows', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: basicAuthSource([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
        runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | not-a-separator | --- | --- |
| --- | --- | --- | --- |
| \`/infra/ping\` | \`GET\`, \`HEAD\` | Caller | Auth |
`,
      })[0],
    ).toContain('could not parse the Exempt paths Markdown table')
  })

  it('ignores shadowed nested exempt path declarations', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `
const BASIC_AUTH_EXEMPT_PATHS = new Set(getPaths())

function localOnly() {
  const BASIC_AUTH_EXEMPT_PATHS = new Set(["/infra/ping"])
  return BASIC_AUTH_EXEMPT_PATHS
}
`,
      runbookMarkdown: basicAuthRunbook([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse BASIC_AUTH_EXEMPT_PATHS')
  })

  it('flags source paths the runtime would never match', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: basicAuthSource([
        { methods: ['POST'], path: '/api/v1/MCP' },
        { methods: ['GET', 'HEAD'], path: '/infra/ping/' },
      ]),
      runbookMarkdown: basicAuthRunbook([
        { methods: ['POST'], path: '/api/v1/MCP' },
        { methods: ['GET', 'HEAD'], path: '/infra/ping/' },
      ]),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      'contains uppercase or trailing-slash path(s) the runtime would never match: `/api/v1/MCP`, `/infra/ping/`',
    )
  })

  it('flags source paths missing from the runbook table', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: basicAuthSource(syncedRoutes),
      runbookMarkdown: basicAuthRunbook([{ methods: ['POST'], path: '/api/v1/mcp' }]),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('missing source path(s): `/infra/ping`')
  })

  it('flags extra runbook paths missing from source', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: basicAuthSource([{ methods: ['POST'], path: '/api/v1/mcp' }]),
      runbookMarkdown: basicAuthRunbook(syncedRoutes),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      'not present in cloudflare-worker/src/basic-auth.mts: `/infra/ping`',
    )
  })

  it('flags runbook methods that drift from source', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: basicAuthSource(syncedRoutes),
      runbookMarkdown: basicAuthRunbook([
        { methods: ['POST'], path: '/api/v1/mcp' },
        { methods: ['GET'], path: '/infra/ping' },
      ]),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      'lists method(s) for `/infra/ping` as `GET`, but cloudflare-worker/src/basic-auth.mts has `GET`, `HEAD`',
    )
  })

  it('flags source path and method map drift', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])

const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/api/v1/mcp', new Set(['POST'])],
])
`,
      runbookMarkdown: basicAuthRunbook([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
    })

    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain(
      'BASIC_AUTH_EXEMPT_METHODS_BY_PATH is missing exempt path(s): `/infra/ping`',
    )
    expect(errors[1]).toContain(
      'BASIC_AUTH_EXEMPT_METHODS_BY_PATH lists path(s) not present in BASIC_AUTH_EXEMPT_PATHS: `/api/v1/mcp`',
    )
  })

  it('reports malformed source and runbook shapes clearly', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: 'const BASIC_AUTH_EXEMPT_PATHS = new Set(getPaths())',
        runbookMarkdown: basicAuthRunbook([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
      })[0],
    ).toContain('could not parse BASIC_AUTH_EXEMPT_PATHS')

    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: 'const BASIC_AUTH_EXEMPT_PATHS = new Set(["/infra/ping"])',
        runbookMarkdown: basicAuthRunbook([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
      })[0],
    ).toContain('could not parse BASIC_AUTH_EXEMPT_METHODS_BY_PATH')

    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: basicAuthSource([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
        runbookMarkdown:
          '### Exempt paths\n\n| Path | Caller | Auth |\n| --- | --- | --- |\n| /infra/ping | Health checks | none |',
      })[0],
    ).toContain('could not parse the Exempt paths Markdown table')
  })

  it('checks tracked source and runbook files together', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-targeted-guardrails-'))
    testDirs.push(repoRoot)
    const sourceFile = 'cloudflare-worker/src/basic-auth.mts'
    const runbookFile = 'docs/operations/cloudflare-worker-staging-auth.md'
    await mkdir(join(repoRoot, 'cloudflare-worker/src'), { recursive: true })
    await mkdir(join(repoRoot, 'docs/operations'), { recursive: true })
    await writeFile(
      join(repoRoot, sourceFile),
      basicAuthSource([{ methods: ['GET', 'HEAD'], path: '/infra/ping' }]),
    )
    await writeFile(
      join(repoRoot, runbookFile),
      basicAuthRunbook([{ methods: ['POST'], path: '/api/v1/mcp' }]),
    )

    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles: [sourceFile, runbookFile],
      trackedFileSet: new Set([sourceFile, runbookFile]),
    })

    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('missing source path(s): `/infra/ping`')
    expect(result.errors[1]).toContain('not present in cloudflare-worker/src/basic-auth.mts')
  })
})
