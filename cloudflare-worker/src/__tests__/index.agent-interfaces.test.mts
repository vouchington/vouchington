import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { removeAdvertisedAgentInterfaceUrls } from '@ts-shared/route-classification'

import worker from '../index.mts'

import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'

import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
  SITE_ORIGIN: 'https://voucha.ai',
  WEB_ORIGIN: 'https://web.example.com',
}

const DISCOVERY_DOCUMENT_PATHS = [
  '/llms.txt',
  '/llms-full.txt',
  '/.well-known/api-catalog',
  '/.well-known/agent-card.json',
  '/.well-known/agent-skills.json',
] as const

async function fetchDocument(path: string, env: Env = baseEnv): Promise<string> {
  const url = new URL(path, env.SITE_ORIGIN)
  const response = await worker.fetch(new Request(url), env, createContext(env))
  expect(response.status).toBe(200)
  return response.text()
}

describe('worker fetch handler - agent interface discovery', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each(['/llms.txt', '/llms-full.txt'])(
    'steers agents from %s to the user MCP server',
    async path => {
      const body = await fetchDocument(path)

      expect(body).toContain('## Agent Access (MCP)')
      expect(body).toContain('- Endpoint: https://voucha.ai/api/v1/mcp\n')
      expect(body).toContain('`Authorization: Bearer <user MCP API key>`')
      expect(body).toContain('MCP key at https://voucha.ai/my/api-keys\n')
      expect(body).toContain('`Content-Type: application/json`')
      expect(body).toContain('`Accept: application/json, text/event-stream`')
      expect(body).toContain('`tools/list`')
      expect(body).toContain('instead of automating the website')
      expect(body).toContain('Never put an API key in a URL')
      expect(body).toContain('do not restrict authenticated MCP requests')
    },
  )

  it('anchors a separate API catalog context at the user MCP endpoint', async () => {
    const catalog = JSON.parse(await fetchDocument('/.well-known/api-catalog'))

    expect(catalog.linkset[0].anchor).toBe('https://voucha.ai')
    expect(catalog.linkset[1]).toEqual({
      anchor: 'https://voucha.ai/api/v1/mcp',
      'service-doc': [
        {
          href: 'https://voucha.ai/llms.txt',
          type: 'text/markdown',
          title: 'Agent access (MCP) guide',
        },
      ],
    })
  })

  it.each(DISCOVERY_DOCUMENT_PATHS)(
    'names the user MCP endpoint and no other private path in %s',
    async path => {
      const body = await fetchDocument(path)
      const unadvertised = removeAdvertisedAgentInterfaceUrls(body, 'https://voucha.ai')

      expect(body).toContain('https://voucha.ai/api/v1/mcp')
      expect(body).not.toContain('/api/v1/admin/mcp')
      for (const privateString of ['/api/', '/admin/', '/auth/', '/my/', '/feed/', 'apikey=']) {
        expect(unadvertised).not.toContain(privateString)
      }
    },
  )

  it.each(DISCOVERY_DOCUMENT_PATHS)(
    'builds agent interface URLs in %s from the configured site origin',
    async path => {
      const env = { ...baseEnv, SITE_ORIGIN: 'https://staging.voucha.ai/' }
      const body = await fetchDocument(path, env)

      expect(body).toContain('https://staging.voucha.ai/api/v1/mcp')
      expect(body).not.toContain('https://voucha.ai/api/v1/mcp')
      expect(body).not.toContain('//api/v1/mcp')
    },
  )
})
