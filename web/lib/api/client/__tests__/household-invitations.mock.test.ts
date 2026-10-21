import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientApi } from '../instance'
import {
  acceptHouseholdInvitation,
  createHouseholdInvitation,
  declineHouseholdInvitation,
  getHouseholdInvitationsClient,
  getMyHouseholdInvitationsClient,
  revokeHouseholdInvitation,
} from '../household-invitations'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import {
  makeHouseholdInvitation,
  makeHouseholdInvitationList,
} from '@/test-helpers/api-responses/household-invitations'
import { makeMembership } from '@/test-helpers/components/my/household-manager'

type ClientApi = typeof import('../instance').clientApi
vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<ClientApi['get']>(),
        post: vi.fn<ClientApi['post']>(),
        delete: vi.fn<ClientApi['delete']>(),
      },
    }) as unknown as typeof import('../instance'),
)

describe('household invitation client contracts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('encodes household IDs and forwards the owner list cursor', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.get),
      response: makeHouseholdInvitationList(),
      call: () => getHouseholdInvitationsClient('household ?#', { after: 'cursor', limit: 25 }),
      expectedArgs: [
        '/api/v1/households/household%20%3F%23/invitations',
        { searchParams: { after: 'cursor', limit: 25 } },
      ],
    })
  })
  it('forwards the invitee list cursor', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.get),
      response: makeHouseholdInvitationList(),
      call: () => getMyHouseholdInvitationsClient({ after: 'next', limit: 25 }),
      expectedArgs: [
        '/api/v1/my/household-invitations',
        { searchParams: { after: 'next', limit: 25 } },
      ],
    })
  })
  it('sends the selected user and relationship', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: { invitation: makeHouseholdInvitation() },
      call: () => createHouseholdInvitation('household', { user: 'alex', relationship: 'Family' }),
      expectedArgs: [
        '/api/v1/households/household/invitations',
        { user: 'alex', relationship: 'Family' },
      ],
    })
  })
  it('encodes revoke IDs and handles the empty response', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.delete),
      response: undefined,
      call: () => revokeHouseholdInvitation('household ?', 'invitation #'),
      expectedArgs: ['/api/v1/households/household%20%3F/invitations/invitation%20%23'],
    })
  })
  it('returns the acceptance membership', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: { membership: makeMembership() },
      call: () => acceptHouseholdInvitation('invitation ?'),
      expectedArgs: ['/api/v1/my/household-invitations/invitation%20%3F/acceptance', {}],
    })
  })
  it('handles the empty decline response', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: undefined,
      call: () => declineHouseholdInvitation('invitation #'),
      expectedArgs: ['/api/v1/my/household-invitations/invitation%20%23/decline', {}],
    })
  })
  it.each(['.', '..', String.raw`bad\segment`])('rejects unsafe invitation ID %s', id => {
    expect(() => acceptHouseholdInvitation(id)).toThrow('Invalid identifier')
    expect(() => declineHouseholdInvitation(id)).toThrow('Invalid identifier')
    expect(() => revokeHouseholdInvitation('household', id)).toThrow('Invalid identifier')
    expect(clientApi.post).not.toHaveBeenCalled()
    expect(clientApi.delete).not.toHaveBeenCalled()
  })
})
