import { describe, expect, it } from 'vitest'
import { removeAdvertisedAgentInterfaceUrls } from './advertised-agent-interface-urls.mts'

const SITE_ORIGIN = 'https://voucha.ai'

describe('removeAdvertisedAgentInterfaceUrls', () => {
  it.each([
    ['plain text', 'Endpoint: https://voucha.ai/api/v1/mcp (POST)', 'Endpoint:  (POST)'],
    ['query string', 'https://voucha.ai/api/v1/mcp?apikey=x', '?apikey=x'],
    ['markdown link', '[keys](https://voucha.ai/my/api-keys)', '[keys]()'],
    ['JSON string', '{"url":"https://voucha.ai/api/v1/mcp"}', '{"url":""}'],
    ['end of document', 'https://voucha.ai/my/api-keys', ''],
  ])('removes an exact URL in %s', (_case, document, expected) => {
    expect(removeAdvertisedAgentInterfaceUrls(document, SITE_ORIGIN)).toBe(expected)
  })

  it.each([
    'https://voucha.ai/api/v1/mcpx',
    'https://voucha.ai/api/v1/mcp/admin',
    'https://voucha.ai/api/v1/mcp-tools',
    'https://voucha.ai/api/v1/mcp.json',
    'https://voucha.ai/my/api-keys/new',
    'https://voucha.ai/api/v1/admin/mcp',
    'https://evil.example/api/v1/mcp',
  ])('keeps near-miss URL %s so leak scans still see it', url => {
    expect(removeAdvertisedAgentInterfaceUrls(url, SITE_ORIGIN)).toBe(url)
  })

  it('treats the site origin literally rather than as a pattern', () => {
    const lookalike = 'https://vouchaxai/api/v1/mcp'
    expect(removeAdvertisedAgentInterfaceUrls(lookalike, SITE_ORIGIN)).toBe(lookalike)
  })
})
