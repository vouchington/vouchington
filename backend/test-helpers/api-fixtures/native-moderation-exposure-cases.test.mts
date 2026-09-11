import { describe, expect, it } from 'vitest'
import { nativeModerationExposureApiFixtureCases } from './native-moderation-exposure-cases.mts'

describe('native moderation exposure fixtures', () => {
  it('covers primary hydration and reveal recording contracts', () => {
    expect(
      nativeModerationExposureApiFixtureCases.map(fixture => ({
        id: fixture.id,
        method: fixture.method,
        response: fixture.backendResponseContractKey,
      })),
    ).toEqual([
      {
        id: 'native.moderation.exposure.default',
        method: 'GET',
        response: 'GET:/api/v1/moderation/exposure',
      },
      {
        id: 'native.moderation.reveals.default',
        method: 'POST',
        response: 'POST:/api/v1/moderation/reveals',
      },
    ])
  })

  it('keeps optional IDs optional in the reveal fixture', () => {
    const reveal = nativeModerationExposureApiFixtureCases[1]!
    expect(reveal.requestBody).toEqual({
      postId: '00000000-0000-7000-8000-000000000301',
      surface: 'review_queue',
    })
    expect(reveal.requestBody).not.toHaveProperty('reportId')
  })
})
