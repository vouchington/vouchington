import { afterEach, describe, it, vi } from 'vitest'
import issuedKey from '../../../../api-fixtures/v1/responses/native.my.api-keys.create.json'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('./instance'),
)

import { clientApi } from './instance'
import { createApiKey, rotateApiKey } from './api-keys'

describe('API key lifetime mutation wrappers', () => {
  afterEach(() => vi.clearAllMocks())
  it('sends the selected lifetime at creation', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: issuedKey,
      call: () => createApiKey('Reader', 'rss', ['rss:read'], null),
      expectedArgs: [
        '/api/v1/my/api-keys',
        { label: 'Reader', type: 'rss', permissions: ['rss:read'], lifetime_days: null },
      ],
    })
  })
  it('uses the owner rotation subresource', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: issuedKey,
      call: () => rotateApiKey(issuedKey.api_key.id),
      expectedArgs: [`/api/v1/my/api-keys/${issuedKey.api_key.id}/rotate`],
    })
  })
})
