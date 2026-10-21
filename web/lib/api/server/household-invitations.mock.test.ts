import { beforeEach, describe, it, vi } from 'vitest'
import { serverApi } from './instance'
import { getHouseholdInvitations, getMyHouseholdInvitations } from './household-invitations'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import { makeHouseholdInvitationList } from '@/test-helpers/api-responses/household-invitations'

type ServerApi = typeof import('./instance').serverApi
vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: { get: vi.fn<ServerApi['get']>() },
    }) as unknown as typeof import('./instance'),
)

describe('household invitation server contracts', () => {
  beforeEach(() => vi.clearAllMocks())
  it('fetches the owner first page with an encoded household ID', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(serverApi.get),
      response: makeHouseholdInvitationList(),
      call: () => getHouseholdInvitations('household ?', { limit: 25 }),
      expectedArgs: [
        '/api/v1/households/household%20%3F/invitations',
        { searchParams: { limit: 25 } },
      ],
    })
  })
  it('forwards invitee pagination options', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(serverApi.get),
      response: makeHouseholdInvitationList(),
      call: () => getMyHouseholdInvitations({ after: 'next', limit: 25 }),
      expectedArgs: [
        '/api/v1/my/household-invitations',
        { searchParams: { after: 'next', limit: 25 } },
      ],
    })
  })
})
