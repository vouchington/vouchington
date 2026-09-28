import { afterEach, describe, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
  submitCopyrightGuestFiling,
} from '../copyright-guest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const mockPost = vi.mocked(clientApi.post)
const noticeId = '00000000-0000-7000-8000-000000000830'
const capabilityId = '00000000-0000-7000-8000-000000000831'

describe('copyright guest client', () => {
  afterEach(() => vi.clearAllMocks())

  it('issues a case capability', async () => {
    const response = {
      copyright_guest_capability: {
        id: capabilityId,
        expires_at: '2099-07-03T12:00:00.000Z',
        token: 'fixture-guest-capability-token',
      },
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => issueCopyrightGuestCapability(noticeId, '2099-07-03T12:00:00.000Z'),
      expectedArgs: [
        `/api/v1/copyright-notices/${noticeId}/guest-capabilities`,
        { expires_at: '2099-07-03T12:00:00.000Z' },
      ],
    })
  })

  it('sends the capability token only as a header', async () => {
    const response = {
      copyright_submission: {
        id: '00000000-0000-7000-8000-000000000832',
        kind: 'supplement' as const,
        received_at: '2026-07-02T15:00:00.000Z',
      },
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () =>
        submitCopyrightGuestFiling({
          noticeId,
          token: 'fixture-guest-capability-token',
          kind: 'supplement',
          statement: 'Corrected work description.',
          cf_turnstile_response: 'fixture-turnstile-token',
        }),
      expectedArgs: [
        `/api/v1/copyright-notices/${noticeId}/guest-filings`,
        {
          kind: 'supplement',
          statement: 'Corrected work description.',
          cf_turnstile_response: 'fixture-turnstile-token',
        },
        { headers: { 'Copyright-Guest-Capability': 'fixture-guest-capability-token' } },
      ],
    })
  })

  it('records an information request', async () => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: { copyright_correspondence: { id: '00000000-0000-7000-8000-000000000833' } },
      call: () =>
        requestCopyrightGuestInformation(noticeId, capabilityId, 'Send the registration number.'),
      expectedArgs: [
        `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/information-requests`,
        { statement: 'Send the registration number.' },
      ],
    })
  })

  it('revokes a case capability', async () => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: {
        copyright_guest_capability: { id: capabilityId, revoked_at: '2026-07-02T12:00:00.000Z' },
      },
      call: () => revokeCopyrightGuestCapability(noticeId, capabilityId),
      expectedArgs: [
        `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/revocation`,
      ],
    })
  })
})
