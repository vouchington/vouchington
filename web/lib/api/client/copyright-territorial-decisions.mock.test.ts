import { afterEach, describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('./instance'),
)

import { clientApi } from './instance'
import {
  decideCopyrightTerritorialNotice,
  recordCopyrightTerritorialAcknowledgmentFailure,
} from './copyright-territorial-decisions'

const mockPost = vi.mocked(clientApi.post)

describe('territorial copyright staff API wrappers', () => {
  afterEach(() => vi.clearAllMocks())

  it('posts an EU restriction with the required post-image discriminator', async () => {
    const targets = [
      {
        surface: 'post-image' as const,
        post_id: 'post-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/discussion/post-1',
      },
    ]
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () =>
        decideCopyrightTerritorialNotice('eu_dsa', 'notice-1', {
          text: 'Internal rationale',
          publicExplanation: 'Public explanation',
          outcome: 'restrict',
          targets,
        }),
      expectedArgs: [
        '/api/v1/copyright-eu-notices/notice-1/statements-of-reasons',
        {
          statement: 'Internal rationale',
          public_explanation: 'Public explanation',
          outcome: 'restrict',
          targets,
        },
      ],
    })
  })

  it('posts a UK no-action review without targets', async () => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () =>
        decideCopyrightTerritorialNotice('uk', 'notice-2', {
          text: 'Internal rationale',
          publicExplanation: 'Public explanation',
          outcome: 'no_action',
        }),
      expectedArgs: [
        '/api/v1/copyright-uk-notices/notice-2/reviews',
        {
          rationale: 'Internal rationale',
          public_explanation: 'Public explanation',
          outcome: 'no_action',
        },
      ],
    })
  })

  it.each([
    ['eu_dsa', 'copyright-eu-notices'],
    ['uk', 'copyright-uk-notices'],
  ] as const)('records a %s failed acknowledgment on its own route', async (jurisdiction, base) => {
    await expectApiWrapperCall({
      mock: mockPost,
      response: undefined,
      call: () => recordCopyrightTerritorialAcknowledgmentFailure(jurisdiction, 'notice-3'),
      expectedArgs: [`/api/v1/${base}/notice-3/acknowledgment-failures`],
    })
  })
})
