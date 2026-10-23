import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { financialMcpResultCases } from '@voucha/test-helpers/native-mcp-result-cases'
import { optionMcpResultCases } from '@voucha/test-helpers/native-mcp-option-result-cases'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import type { Tool } from '@services/openai-agents/tool-types'
import getMyFinancialProfileTool from '../mcp/get-my-financial-profile.mts'
import { buildMcpCatalog } from '@services/mcp-tools/catalog/build-mcp-catalog'
import { runCatalogGeneration } from './mcp-catalog-generation.mts'
import { buildMcpResultFixtures } from './mcp-result-fixtures.mts'

describe('MCP result catalog generation', () => {
  const catalog = buildMcpCatalog([getMyFinancialProfileTool as unknown as Tool])

  it('validates every member option fixture against its selected contract', () => {
    const complete = buildMcpCatalog(ALL_TOOLS)
    expect(buildMcpResultFixtures(complete, optionMcpResultCases).cases).toEqual(
      optionMcpResultCases,
    )
    const bio = optionMcpResultCases.find(fixture => fixture.id.endsWith('read-my-profile.bio'))!
    const links = optionMcpResultCases.find(fixture =>
      fixture.id.endsWith('read-my-profile.links'),
    )!
    expect(() =>
      buildMcpResultFixtures(complete, [{ ...bio, structuredContent: links.structuredContent }]),
    ).toThrow('structuredContent')
    const datedFeed = structuredClone(
      optionMcpResultCases.find(fixture => fixture.id.endsWith('read-feed.posts'))!,
    )
    const results = datedFeed.structuredContent['results'] as Record<string, unknown>[]
    results[0]!['shared_at'] = 'not-a-date'
    expect(() => buildMcpResultFixtures(complete, [datedFeed])).toThrow('structuredContent')
  })

  it.each(['wrong option', 'wrong type', 'missing setting', 'unknown setting'])(
    'rejects a general preferences fixture with %s',
    invalid => {
      const complete = buildMcpCatalog(ALL_TOOLS)
      const general = structuredClone(
        optionMcpResultCases.find(
          fixture => fixture.id === 'native.mcp.read-my-preferences.general',
        ),
      )
      expect(general).toBeDefined()
      if (!general) throw new Error('Missing canonical general preferences fixture')
      const settings = general.structuredContent['settings'] as Record<string, unknown>
      switch (invalid) {
        case 'wrong option':
          general.arguments['option'] = 'email'
          break
        case 'wrong type':
          settings['should_import_hacker_news_discussions'] = 'false'
          break
        case 'missing setting':
          delete settings['country']
          break
        case 'unknown setting':
          settings['username'] = 'must-not-be-exposed'
          break
      }
      expect(() => buildMcpResultFixtures(complete, [general])).toThrow('structuredContent')
    },
  )

  it('rejects a case for a tool absent from the exported catalog', () => {
    expect(() =>
      buildMcpResultFixtures(catalog, [{ ...financialMcpResultCases[0]!, tool: 'missing_tool' }]),
    ).toThrow('no cataloged output schema')
  })

  it('rejects arguments that violate the real financial tool input schema', () => {
    expect(() =>
      buildMcpResultFixtures(catalog, [
        { ...financialMcpResultCases[0]!, arguments: { unexpected: true } },
      ]),
    ).toThrow('arguments:')
  })

  it('rejects a result outside the real tool schema before writing any catalog artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-result-case-'))
    try {
      const markdown = join(root, 'docs/overview/architecture/mcp/catalog.md')
      await mkdir(join(root, 'api-fixtures/v1'), { recursive: true })
      await mkdir(join(root, 'docs/overview/architecture/mcp'), { recursive: true })
      await writeFile(markdown, '<!-- BEGIN GENERATED -->\n\n<!-- END GENERATED -->\n')
      await expect(
        runCatalogGeneration([], {
          root,
          tools: [getMyFinancialProfileTool as unknown as Tool],
          cases: [
            {
              id: 'native.mcp.invalid-financial-result',
              tool: 'get_my_financial_profile',
              arguments: {},
              structuredContent: { success: true, result: {} },
            },
          ],
          ready: Promise.resolve(),
          closeResources: [],
        }),
      ).rejects.toThrow('structuredContent')
      await expect(readFile(join(root, 'api-fixtures/v1/mcp.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(
        readFile(join(root, 'api-fixtures/v1/mcp-results.json'), 'utf8'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
