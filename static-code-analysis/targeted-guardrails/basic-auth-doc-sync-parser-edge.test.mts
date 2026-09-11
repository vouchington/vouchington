import { describe, expect, it } from 'vitest'

import { checkBasicAuthRunbookExemptPathsSync } from './basic-auth-doc-sync.mts'

const runbook = `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | --- | --- | --- |
| \`/infra/ping\` | \`GET\`, \`HEAD\` | Caller | Auth |
| \`/api/v1/mcp\` | \`POST\` | Caller | Auth |
`

describe('basic-auth method map parser edge cases', () => {
  it('rejects method map entries that do not use literal new Set values', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const POST_METHODS = new Set(['POST'])
const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping', '/api/v1/mcp'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
  ['/api/v1/mcp', POST_METHODS],
])
`,
      runbookMarkdown: runbook,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse BASIC_AUTH_EXEMPT_METHODS_BY_PATH')
  })

  it('rejects source declarations that are not const Set and Map constructors', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `let BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
        runbookMarkdown: runbook,
      })[0],
    ).toContain('could not parse BASIC_AUTH_EXEMPT_PATHS')

    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new PathSet(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
        runbookMarkdown: runbook,
      })[0],
    ).toContain('could not parse BASIC_AUTH_EXEMPT_PATHS')

    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new RouteMap([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
        runbookMarkdown: runbook,
      })[0],
    ).toContain('could not parse BASIC_AUTH_EXEMPT_METHODS_BY_PATH')
  })

  it('accepts typed method map declarations', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `const BASIC_AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/infra/ping', '/api/v1/mcp'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
  ['/api/v1/mcp', new Set(['POST'])],
])
`,
        runbookMarkdown: runbook,
      }),
    ).toEqual([])
  })

  it('accepts typed source exempt path declarations', () => {
    expect(
      checkBasicAuthRunbookExemptPathsSync({
        sourceCode: `const BASIC_AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
        runbookMarkdown: runbook.replace('| `/api/v1/mcp` | `POST` | Caller | Auth |\n', ''),
      }),
    ).toEqual([])
  })

  it('rejects non-uppercase source methods that the runtime would not match', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping', '/api/v1/mcp'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
  ['/api/v1/mcp', new Set(['post'])],
])
`,
      runbookMarkdown: runbook.replace('`POST`', '`post`'),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse BASIC_AUTH_EXEMPT_METHODS_BY_PATH')
  })

  it('rejects source methods with whitespace or non-token characters', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET '])],
])
`,
      runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism
| --- | --- | --- | ---
| \`/infra/ping\` | \`GET \` | Caller | Auth
`,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse BASIC_AUTH_EXEMPT_METHODS_BY_PATH')
  })

  it('rejects runbook methods cells with unparsed text', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET'])],
])
`,
      runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | --- | --- | --- |
| \`/infra/ping\` | \`GET\` or \`POST\` | Caller | Auth |
`,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse the Exempt paths Markdown table')
  })

  it('rejects duplicate runbook path rows', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
      runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | --- | --- | --- |
| \`/infra/ping\` | \`POST\` | Caller | Auth |
| \`/infra/ping\` | \`GET\`, \`HEAD\` | Caller | Auth |
`,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('basic-auth exempt path table repeats path(s): `/infra/ping`')
  })

  it('rejects runbook delimiter rows with a different cell count than the header', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'HEAD'])],
])
`,
      runbookMarkdown: `# Staging Basic Auth

### Exempt paths

| Path | Methods | Caller | Auth mechanism |
| --- | --- | --- |
| \`/infra/ping\` | \`GET\`, \`HEAD\` | Caller | Auth |
`,
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('could not parse the Exempt paths Markdown table')
  })

  it('does not treat duplicate source methods as equivalent to distinct runbook methods', () => {
    const errors = checkBasicAuthRunbookExemptPathsSync({
      sourceCode: `const BASIC_AUTH_EXEMPT_PATHS = new Set(['/infra/ping'])
const BASIC_AUTH_EXEMPT_METHODS_BY_PATH = new Map([
  ['/infra/ping', new Set(['GET', 'GET'])],
])
`,
      runbookMarkdown: runbook
        .replace('| `/api/v1/mcp` | `POST` | Caller | Auth |\n', '')
        .replace('`GET`, `HEAD`', '`GET`, `HEAD`'),
    })

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      'lists method(s) for `/infra/ping` as `GET`, `HEAD`, but cloudflare-worker/src/basic-auth.mts has `GET`, `GET`',
    )
  })
})
