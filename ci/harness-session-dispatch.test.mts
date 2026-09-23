import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  dispatchHarnessSession,
  type HarnessDispatchEnvironment,
} from './harness-session-dispatch.mts'

const sessionId = 'sess-0123abcd'
const sessionUrl = `https://harness.example.com/sessions/${sessionId}`

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

// Answers every request with one session and records `METHOD /pathname` plus the JSON body, so
// assertions name the Auto Harness endpoint without pinning the client's query strings or call order.
function sessionApi(created: boolean) {
  const requests: Array<{ body: unknown; route: string }> = []
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    requests.push({
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      route: `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`,
    })
    return jsonResponse({ created, id: sessionId, url: sessionUrl }, created ? 201 : 200)
  })
  const bodyFor = (route: string) => requests.find(request => request.route === route)?.body
  const routes = () => requests.map(request => request.route)
  return { bodyFor, fetchImplementation, routes }
}

const baseEnvironment: HarnessDispatchEnvironment = {
  HARNESS_API_KEY: 'hns_secret',
  HARNESS_CONCURRENCY_ID: 'filaments-fix-123',
  HARNESS_DISPATCH_ENABLED: 'true',
  HARNESS_FALLBACKS: '[{"providerId":"prov-grok"},{"providerId":"prov-codex"}]',
  HARNESS_METADATA: '{"issueNumber":123}',
  HARNESS_PRIORITY: '20',
  HARNESS_PROMPT: 'Fix the issue',
  HARNESS_QUEUE_TTL_SECONDS: '3600',
  HARNESS_REF: 'refs/heads/main',
  HARNESS_REPOSITORY_ID: 'repo-filaments',
  HARNESS_REQUIRED_LABELS: '["filaments"]',
  HARNESS_TARGET: '{"providerId":"prov-cursor"}',
  HARNESS_TIMEOUT: '6300',
  HARNESS_URL: 'https://harness.example.com',
}

describe('fresh dispatch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the documented session schema and writes outputs', async () => {
    const output = join(mkdtempSync(join(tmpdir(), 'harness-dispatch-')), 'output')
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const api = sessionApi(true)

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
        api.fetchImplementation,
      ),
    ).resolves.toEqual({ created: true, id: sessionId, url: sessionUrl })

    expect(api.bodyFor('POST /api/v1/sessions')).toMatchObject({
      concurrencyId: 'filaments-fix-123',
      fallbacks: [{ providerId: 'prov-grok' }, { providerId: 'prov-codex' }],
      metadata: { issueNumber: 123 },
      priority: 20,
      prompt: 'Fix the issue',
      queueTtlSeconds: 3600,
      ref: 'refs/heads/main',
      repositoryId: 'repo-filaments',
      requiredLabels: ['filaments'],
      source: 'webhook',
      target: { providerId: 'prov-cursor' },
      timeout: 6300,
    })
    const outputs = readFileSync(output, 'utf8')
    expect(outputs).toContain(`session-id=${sessionId}\n`)
    expect(outputs).toContain(`session-url=${sessionUrl}\n`)
    expect(outputs).toContain('created=true\n')
    const summaryText = readFileSync(summary, 'utf8')
    expect(summaryText).toContain(sessionUrl)
    expect(summaryText).toMatch(/prov-cursor.*prov-grok.*prov-codex/su)
    expect(summaryText).not.toContain('hns_secret')
    expect(summaryText).not.toContain('Fix the issue')
  })

  it('reports a deduplicated create without a provider route', async () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const api = sessionApi(false)

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, GITHUB_STEP_SUMMARY: summary },
        api.fetchImplementation,
      ),
    ).resolves.toEqual({ created: false, id: sessionId, url: sessionUrl })

    const summaryText = readFileSync(summary, 'utf8')
    expect(summaryText).toContain(sessionUrl)
    expect(summaryText).not.toContain('prov-cursor')
  })

  it.each([
    ['a disabled dispatch', { HARNESS_DISPATCH_ENABLED: 'false' }, 'DISPATCH_DISABLED'],
    ['a missing HARNESS_URL', { HARNESS_URL: undefined }, 'MISSING_ENVIRONMENT_VALUE'],
    [
      'a HARNESS_URL with a path',
      { HARNESS_URL: 'https://harness.example.com/base' },
      'INVALID_HARNESS_URL',
    ],
    ['an oversized prompt', { HARNESS_PROMPT: 'x'.repeat(65_537) }, 'PROMPT_TOO_LARGE'],
    ['a blank concurrency id', { HARNESS_CONCURRENCY_ID: '   ' }, 'INVALID_CONCURRENCY_ID'],
    ['a missing HARNESS_TARGET', { HARNESS_TARGET: undefined }, 'MISSING_ENVIRONMENT_VALUE'],
    ['a malformed HARNESS_TARGET', { HARNESS_TARGET: '{"providerId":1}' }, 'INVALID_TARGET'],
    ['a non-array HARNESS_FALLBACKS', { HARNESS_FALLBACKS: '{}' }, 'INVALID_FALLBACKS'],
    ['a non-JSON HARNESS_METADATA', { HARNESS_METADATA: '{' }, 'INVALID_METADATA'],
    [
      'a HARNESS_QUEUE_TTL_SECONDS above the cap',
      { HARNESS_QUEUE_TTL_SECONDS: String(30 * 24 * 60 * 60 + 1) },
      'INVALID_QUEUE_TTL_SECONDS',
    ],
    [
      'a missing HARNESS_REPOSITORY_ID',
      { HARNESS_REPOSITORY_ID: undefined },
      'MISSING_ENVIRONMENT_VALUE',
    ],
  ])('fails closed before transport for %s', async (_name, override, code) => {
    const fetchImplementation = vi.fn<typeof fetch>()

    await expect(
      dispatchHarnessSession({ ...baseEnvironment, ...override }, fetchImplementation),
    ).rejects.toMatchObject({ code })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})

describe('resume', () => {
  afterEach(() => vi.restoreAllMocks())

  const resumeEnvironment: HarnessDispatchEnvironment = {
    HARNESS_API_KEY: 'hns_secret',
    HARNESS_CONCURRENCY_ID: 'filaments-fix-123',
    HARNESS_DISPATCH_ENABLED: 'true',
    HARNESS_PRIORITY: '20',
    HARNESS_PROMPT: 'Continue the fix',
    HARNESS_REPOSITORY_ID: 'repo-filaments',
    HARNESS_RESUME_SESSION_ID: sessionId,
    HARNESS_TIMEOUT: '6300',
    HARNESS_URL: 'https://harness.example.com',
  }

  it('resumes the named session instead of creating one and reports the resumed result', async () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const api = sessionApi(false)

    await expect(
      dispatchHarnessSession(
        { ...resumeEnvironment, GITHUB_STEP_SUMMARY: summary },
        api.fetchImplementation,
      ),
    ).resolves.toEqual({ created: false, id: sessionId, url: sessionUrl })

    expect(api.routes()).not.toContain('POST /api/v1/sessions')
    expect(api.bodyFor(`POST /api/v1/sessions/${sessionId}/resume`)).toMatchObject({
      concurrencyId: 'filaments-fix-123',
      priority: 20,
      prompt: 'Continue the fix',
      timeout: 6300,
    })
    expect(readFileSync(summary, 'utf8')).toContain(sessionUrl)
  })

  it('takes the create path when HARNESS_RESUME_SESSION_ID is empty', async () => {
    const api = sessionApi(true)

    await dispatchHarnessSession(
      { ...baseEnvironment, HARNESS_RESUME_SESSION_ID: '' },
      api.fetchImplementation,
    )

    expect(api.routes()).toContain('POST /api/v1/sessions')
    expect(api.routes().filter(route => route.endsWith('/resume'))).toEqual([])
  })

  it('fails closed for a malformed resume session id before transport', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()

    await expect(
      dispatchHarnessSession(
        { ...resumeEnvironment, HARNESS_RESUME_SESSION_ID: 'sess-123' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESUME_SESSION_ID' })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})
