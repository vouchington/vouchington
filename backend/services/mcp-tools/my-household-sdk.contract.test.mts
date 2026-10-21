import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import {
  callAndValidateSdkTool,
  connectSdkCatalog,
  sdkCatalogCases,
} from '@voucha/test-helpers/mcp-sdk-catalog'

describe('household tools through the MCP SDK — real DB', () => {
  it('advertises and executes both merged tools with schema-validated output', async () => {
    const observed = new Set<string>()
    const owner = await createTestUser()
    const client = await connectSdkCatalog(sdkCatalogCases[0]!, owner, async (url, fetch) => {
      const sdk = new Client({ name: 'voucha-household-contract-test', version: '1.0.0' })
      await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
      return sdk
    })
    try {
      const names = (await client.listTools()).tools.map(tool => tool.name)
      expect(names).toContain('read_my_households')
      expect(names).toContain('manage_my_households')
      const created = await callAndValidateSdkTool(client, 'manage_my_households', 'create', {})
      observed.add('manage_my_households')
      const household_id = (created as { household: { id: string } }).household.id
      expect(created).toMatchObject({ household: { id: household_id, owner_user_id: owner.id } })
      expect(
        await callAndValidateSdkTool(client, 'read_my_households', 'get', { household_id }),
      ).toMatchObject({ household: { id: household_id } })
      observed.add('read_my_households')
      expectSdkSuccessNames(observed, sdkMergedSuccessNames.householdsFixture)
    } finally {
      await client.close()
    }
  })
})
