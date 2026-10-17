import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it } from 'vitest'
import {
  sdkMergedSuccessNames,
  expectSdkSuccessNames,
} from '@voucha/test-helpers/mcp-sdk-success-names'
import { createTestDirectConversation, createTestUser } from '@voucha/test-helpers'
import {
  callAndValidateSdkTool,
  connectSdkCatalog,
  sdkCatalogCases,
} from '@voucha/test-helpers/mcp-sdk-catalog'

describe('direct-message tools through the MCP SDK — real DB', () => {
  it('advertises and executes both read and write merged tools', async () => {
    const observed = new Set<string>()
    const owner = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await createTestDirectConversation({
      user1Id: owner.id,
      user2Id: recipient.id,
    })
    const client = await connectSdkCatalog(sdkCatalogCases[0]!, owner, async (url, fetch) => {
      const sdk = new Client({ name: 'voucha-dm-contract-test', version: '1.0.0' })
      await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
      return sdk
    })
    try {
      const names = (await client.listTools()).tools.map(tool => tool.name)
      expect(names).toContain('read_my_messages')
      expect(names).toContain('manage_my_messages')

      const read = await callAndValidateSdkTool(client, 'read_my_messages', 'get', {
        conversation_id: conversation.id,
      })
      observed.add('read_my_messages')
      expect(read).toMatchObject({ conversation: { id: conversation.id } })

      const write = await callAndValidateSdkTool(client, 'manage_my_messages', 'send', {
        conversation_id: conversation.id,
        text: 'Message through SDK',
      })
      observed.add('manage_my_messages')
      expect(write).toMatchObject({
        message: {
          conversation_id: conversation.id,
          created_by_id: owner.id,
          body_text: expect.stringContaining('Message through SDK'),
        },
      })
      expectSdkSuccessNames(observed, sdkMergedSuccessNames.messagesFixture)
    } finally {
      await client.close()
    }
  })
})
