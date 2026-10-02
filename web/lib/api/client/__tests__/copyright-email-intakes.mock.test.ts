import { afterEach, describe, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>(), post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  admitCopyrightEmailCorrespondence,
  approveCopyrightEmailIntake,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailCorrespondence,
  rejectCopyrightEmailIntake,
  replayCopyrightEmailIntakeReply,
  requestCopyrightEmailIntakeInformation,
} from '../copyright-email-intakes'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import {
  makeCopyrightEmailQueueItem,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('copyright email intake client', () => {
  afterEach(() => vi.clearAllMocks())

  it('lists and loads staff email intakes', async () => {
    mockGet.mockClear()
    await expectApiWrapperCall({
      mock: mockGet,
      response: makeCopyrightEmailQueuePage(),
      call: () => listCopyrightEmailIntakes(),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/review-queue',
        { searchParams: { after: undefined, limit: undefined } },
      ],
    })
    mockGet.mockClear()
    await expectApiWrapperCall({
      mock: mockGet,
      response: makeCopyrightEmailQueuePage([makeCopyrightEmailQueueItem()], {
        has_next_page: true,
        start_cursor: 'first',
        end_cursor: 'following',
      }),
      call: () => listCopyrightEmailIntakes({ after: 'next', limit: 25 }),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/review-queue',
        { searchParams: { after: 'next', limit: 25 } },
      ],
    })
    mockGet.mockClear()
    await expectApiWrapperCall({
      mock: mockGet,
      response: { copyright_email_intake: { id: 'intake-1' } },
      call: () => getCopyrightEmailIntake('intake-1'),
      expectedArgs: ['/api/v1/copyright-email-intakes/intake-1'],
    })
  })

  it('posts intake and correspondence decisions', async () => {
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: { reply_queued: false },
      call: () =>
        rejectCopyrightEmailIntake('intake-1', 'Unrelated.', null, 'No recommendation.', null),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/intake-1/rejections',
        {
          rationale: 'Unrelated.',
          recommendation_id: null,
          manual_fallback_reason: 'No recommendation.',
          reply_email: null,
        },
      ],
    })
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: { reply_queued: true },
      call: () =>
        rejectCopyrightEmailIntake(
          'intake-1',
          'Unrelated.',
          null,
          'No recommendation.',
          'reporter@example.test',
        ),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/intake-1/rejections',
        {
          rationale: 'Unrelated.',
          recommendation_id: null,
          manual_fallback_reason: 'No recommendation.',
          reply_email: 'reporter@example.test',
        },
      ],
    })
    const informationRequest = {
      rationale: 'The notice names no URLs.',
      recommendation_id: null,
      manual_fallback_reason: 'No recommendation.',
      reply_email: 'reporter@example.test',
      response_message: 'Please list each allegedly infringing URL.',
    }
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: { reply_queued: true },
      call: () => requestCopyrightEmailIntakeInformation('intake-1', informationRequest),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/intake-1/rejections',
        { ...informationRequest, response_kind: 'needs_information' },
      ],
    })
    const approval = {
      rationale: 'Complete notice.',
      recommendation_id: null,
      manual_fallback_reason: 'No recommendation.',
    }
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => approveCopyrightEmailIntake('intake-1', approval),
      expectedArgs: ['/api/v1/copyright-email-intakes/intake-1/approvals', approval],
    })
    const correspondence = {
      kind: 'supplement' as const,
      rationale: 'Additional material.',
      recommendation_id: null,
      manual_fallback_reason: 'No recommendation.',
    }
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => admitCopyrightEmailCorrespondence('intake-1', correspondence),
      expectedArgs: ['/api/v1/copyright-email-intakes/intake-1/correspondence', correspondence],
    })
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => rejectCopyrightEmailCorrespondence('intake-1', correspondence),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/intake-1/correspondence-rejections',
        correspondence,
      ],
    })
  })

  it('replays the failed reply to a declined intake', async () => {
    mockPost.mockClear()
    await expectApiWrapperCall({
      mock: mockPost,
      response: { replayed: true },
      call: () => replayCopyrightEmailIntakeReply('intake-1'),
      expectedArgs: ['/api/v1/copyright-email-intakes/intake-1/reply/replays', {}],
    })
  })
})
