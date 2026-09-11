import { describe, expect, it } from 'vitest'

import { ROBOTS_DISALLOW_PREFIXES } from '@ts-shared/route-classification'

import { AI_CRAWLERS, generateRobotsTxt } from './robots-txt.mts'

const SITE_ORIGIN = 'https://voucha.ai'

describe('generateRobotsTxt', () => {
  const output = generateRobotsTxt(SITE_ORIGIN)

  it('starts with wildcard user-agent block', () => {
    expect(output.startsWith('User-agent: *\n')).toBe(true)
  })

  it('wildcard block has Allow: / and no Crawl-delay', () => {
    const wildcardBlock = output.split('\n\n')[0]
    expect(wildcardBlock).toContain('Allow: /')
    expect(wildcardBlock).not.toContain('Crawl-delay')
  })

  it('wildcard block disallows all ROBOTS_DISALLOW_PREFIXES', () => {
    const wildcardBlock = output.split('\n\n')[0]
    for (const path of ROBOTS_DISALLOW_PREFIXES) {
      expect(wildcardBlock).toContain(`Disallow: ${path}`)
    }
    expect(wildcardBlock).not.toContain('Disallow: /md/')
  })

  it('contains a block for every AI crawler', () => {
    for (const crawler of AI_CRAWLERS) {
      expect(output).toContain(`User-agent: ${crawler}`)
    }
  })

  it('AI crawler blocks have Allow: / and all ROBOTS_DISALLOW_PREFIXES', () => {
    for (const crawler of AI_CRAWLERS) {
      const blockStart = output.indexOf(`User-agent: ${crawler}`)
      const blockEnd = output.indexOf('\n\n', blockStart)
      const block = output.slice(blockStart, blockEnd)

      expect(block).toContain('Allow: /')
      for (const path of ROBOTS_DISALLOW_PREFIXES) {
        expect(block).toContain(`Disallow: ${path}`)
      }
    }
  })

  it('ends with Sitemap and Host using siteOrigin', () => {
    expect(output).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
    expect(output).toContain(`Host: ${SITE_ORIGIN}`)
  })

  it('uses custom siteOrigin when provided', () => {
    const custom = generateRobotsTxt('https://example.com')
    expect(custom).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(custom).toContain('Host: https://example.com')
  })

  it('disallows every path and omits sitemap discovery when noIndex is enabled', () => {
    const noIndexOutput = generateRobotsTxt(SITE_ORIGIN, { noIndex: true })

    expect(noIndexOutput).toBe('User-agent: *\nDisallow: /\n')
    expect(noIndexOutput).not.toContain('Sitemap:')
    expect(noIndexOutput).not.toContain('Allow: /')
  })

  it('output has no Crawl-delay directive', () => {
    expect(output).not.toContain('Crawl-delay')
  })

  it('new AI bots each have Allow: / in output', () => {
    const newBots = [
      'ClaudeBot',
      'OAI-SearchBot',
      'Amazonbot',
      'CCBot',
      'Meta-ExternalAgent',
      'DuckAssistBot',
      'Google-CloudVertexBot',
      'Bytespider',
    ]
    for (const bot of newBots) {
      const blockStart = output.indexOf(`User-agent: ${bot}`)
      expect(blockStart).toBeGreaterThan(-1)
      const blockEnd = output.indexOf('\n\n', blockStart)
      const block = output.slice(blockStart, blockEnd)
      expect(block).toContain('Allow: /')
    }
  })

  it('has no duplicate User-agent lines', () => {
    const uaLines = output.split('\n').filter(line => line.startsWith('User-agent:'))
    const unique = new Set(uaLines)
    expect(uaLines.length).toBe(unique.size)
  })
})
