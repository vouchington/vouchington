import { endpoint, type ManifestEndpoint } from './endpoint-registry'

const conversationId = '0198ffff-0000-7000-8000-000000000001'
const turnEndpoint = {
  method: 'POST',
  path: `/api/v1/conversations/${conversationId}/client-generated-chat`,
  requestBody: {
    user_message_id: '0198ffff-0001-7000-8000-000000000001',
    assistant_message_id: '0198ffff-0001-7000-8000-000000000002',
    message: 'Hello',
    assistant_content: 'Hi',
    model_provider: 'apple_foundation',
  },
} satisfies ManifestEndpoint
const historyPath = `/api/v1/my/conversations/${conversationId}/messages`

// Native-only contract fixtures have no production web chat wrapper.
export const nativeChatEndpointRegistry = {
  'native.chat.completed': turnEndpoint,
  'native.chat.duplicate': turnEndpoint,
  'native.chat.retry': turnEndpoint,
  'native.chat.unauthorized': turnEndpoint,
  'native.chat.forbidden': turnEndpoint,
  'native.chat.identity-conflict': turnEndpoint,
  'native.chat.page-1': endpoint(historyPath, { limit: '1' }),
  'native.chat.page-2': endpoint(historyPath, {
    limit: '1',
    after: 'eyJpZCI6IjAxOThmZmZmLTAwMDEtNzAwMC04MDAwLTAwMDAwMDAwMDAwMiJ9',
  }),
  'native.chat.incomplete': endpoint(historyPath, { limit: '1' }),
  'native.chat.conversations': endpoint('/api/v1/my/conversations'),
} satisfies Record<string, ManifestEndpoint>
