import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { sdkCatalogCases as cases, connectSdkCatalog } from '@voucha/test-helpers/mcp-sdk-catalog'

async function connect(
  testCase: Parameters<typeof connectSdkCatalog>[0],
  account?: Parameters<typeof connectSdkCatalog>[1],
) {
  return connectSdkCatalog(testCase, account, async (url, fetch) => {
    const client = new Client({ name: 'voucha-registered-catalog-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(url, { fetch }))
    return client
  })
}

describe('registered catalog SDK', () => {
  it.each([
    { testCase: cases[0]!, name: 'read_reference_data', option: 'countries', args: {} },
    { testCase: cases[3]!, name: 'read_admin_metrics', option: 'growth', args: { range: 'today' } },
  ])(
    'rejects unknown options and extra arguments through $testCase.server.serverName',
    async row => {
      const client = await connect(row.testCase)
      try {
        for (const argumentsValue of [
          { option: 'not_an_option', arguments: row.args },
          { option: row.option, arguments: row.args, unexpected: true },
          { option: row.option, arguments: { ...row.args, unexpected: true } },
        ]) {
          await expect(
            client.callTool({ name: row.name, arguments: argumentsValue }),
          ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
        }
      } finally {
        await client.close()
      }
    },
  )
})
