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
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: true, id: sessionId, url: sessionUrl }, 201))

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
        fetchImplementation,
      ),
    ).resolves.toEqual({ created: true, id: sessionId, url: sessionUrl })

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://harness.example.com/api/v1/sessions',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
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
    expect(readFileSync(output, 'utf8')).toBe(
      `session-id=${sessionId}\nsession-url=${sessionUrl}\ncreated=true\n`,
    )
    const summaryText = readFileSync(summary, 'utf8')
    expect(summaryText).toContain(`[${sessionId}](${sessionUrl})`)
    expect(summaryText).toContain('`prov-cursor` → `prov-grok` → `prov-codex`')
    expect(summaryText).not.toContain('hns_secret')
    expect(summaryText).not.toContain('Fix the issue')
  })

  it('resolves name-based targets through catalog fetches and formats every route kind', async () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'prov-claude-1', name: 'claude' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 'cmd-codex-print-1', name: 'codex-print' }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ created: true, id: sessionId, url: sessionUrl }, 201))

    await dispatchHarnessSession(
      {
        ...baseEnvironment,
        GITHUB_STEP_SUMMARY: summary,
        HARNESS_FALLBACKS: '[{"commandName":"codex-print"},{"commandId":"cmd-existing"}]',
        HARNESS_TARGET: '{"providerName":"claude"}',
      },
      fetchImplementation,
    )

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://harness.example.com/api/v1/providers',
      expect.anything(),
    )
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://harness.example.com/api/v1/commands',
      expect.anything(),
    )
    const body = JSON.parse(String(fetchImplementation.mock.calls[2]?.[1]?.body))
    expect(body.target).toEqual({ providerId: 'prov-claude-1' })
    expect(body.fallbacks).toEqual([
      { commandId: 'cmd-codex-print-1' },
      { commandId: 'cmd-existing' },
    ])
    expect(readFileSync(summary, 'utf8')).toContain('`claude` → `codex-print` → `cmd-existing`')
  })

  it('fails closed when a provider or command name resolves to more than one entry', async () => {
    const ambiguousProviderFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: 'prov-claude-1', name: 'claude' },
          { id: 'prov-claude-2', name: 'claude' },
        ],
      }),
    )

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, HARNESS_TARGET: '{"providerName":"claude"}' },
        ambiguousProviderFetch,
      ),
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_PROVIDER_NAME' })

    const ambiguousCommandFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        items: [
          { id: 'cmd-codex-print-1', name: 'codex-print' },
          { id: 'cmd-codex-print-2', name: 'codex-print' },
        ],
      }),
    )

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, HARNESS_TARGET: '{"commandName":"codex-print"}' },
        ambiguousCommandFetch,
      ),
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_COMMAND_NAME' })
  })

  it('omits the fallbacks field and route entry when none are configured', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: true, id: sessionId, url: sessionUrl }, 201))

    await dispatchHarnessSession(
      { ...baseEnvironment, HARNESS_FALLBACKS: undefined },
      fetchImplementation,
    )

    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))
    expect(body.fallbacks).toEqual([])
  })

  it('reports a deduplicated create without a provider route', async () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: false, id: sessionId, url: sessionUrl }, 200))

    await expect(
      dispatchHarnessSession(
        { ...baseEnvironment, GITHUB_STEP_SUMMARY: summary },
        fetchImplementation,
      ),
    ).resolves.toEqual({ created: false, id: sessionId, url: sessionUrl })

    const summaryText = readFileSync(summary, 'utf8')
    expect(summaryText).toContain('- Created: no')
    expect(summaryText).toContain('retained from the existing session')
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

  it('resumes without a dedupe pre-check and reports the resumed result', async () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'harness-summary-')), 'summary')
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: false, id: sessionId, url: sessionUrl }, 200))

    await expect(
      dispatchHarnessSession(
        { ...resumeEnvironment, GITHUB_STEP_SUMMARY: summary },
        fetchImplementation,
      ),
    ).resolves.toEqual({ created: false, id: sessionId, url: sessionUrl })

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(fetchImplementation).toHaveBeenCalledWith(
      `https://harness.example.com/api/v1/sessions/${sessionId}/resume`,
      expect.objectContaining({ method: 'POST' }),
    )
    const resumeBody = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))
    expect(resumeBody).toEqual({
      concurrencyId: 'filaments-fix-123',
      priority: 20,
      prompt: 'Continue the fix',
      timeout: 6300,
    })
    expect(readFileSync(summary, 'utf8')).toContain('retained from the existing session')
  })

  it('takes the create path when HARNESS_RESUME_SESSION_ID is empty', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ created: true, id: sessionId, url: sessionUrl }, 201))

    await dispatchHarnessSession(
      { ...baseEnvironment, HARNESS_RESUME_SESSION_ID: '' },
      fetchImplementation,
    )

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://harness.example.com/api/v1/sessions',
      expect.objectContaining({ method: 'POST' }),
    )
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
