import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { financialMcpResultCases } from '@voucha/test-helpers/native-mcp-result-cases'
import type { Tool } from '@services/openai-agents/tool-types'
import getMyFinancialProfileTool from '../../../mcp/get-my-financial-profile.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'
import { runCatalogGeneration } from './generate-catalog.mts'
import { buildMcpResultFixtures } from './mcp-result-cases.mts'

describe('MCP result catalog generation', () => {
  const catalog = buildMcpCatalog([getMyFinancialProfileTool as unknown as Tool])

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
