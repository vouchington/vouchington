import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const exposure = {
  count: 1,
  threshold: 10,
  in_cooldown: false,
  cooldown_ends_at: null,
}

export const nativeModerationExposureApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.exposure.default',
    backendResponseContractKey: 'GET:/api/v1/moderation/exposure',
    method: 'GET',
    path: '/api/v1/moderation/exposure',
    route: { routeTemplate: '/api/v1/moderation/exposure' },
    body: { exposure },
    migratedFrom: ['backend/api/v1/moderation-exposure.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.reveals.default',
    backendResponseContractKey: 'POST:/api/v1/moderation/reveals',
    method: 'POST',
    path: '/api/v1/moderation/reveals',
    requestBody: {
      postId: '00000000-0000-7000-8000-000000000301',
      surface: 'review_queue',
    },
    route: { routeTemplate: '/api/v1/moderation/reveals' },
    body: { exposure },
    migratedFrom: ['backend/api/v1/moderation-exposure.mts'],
  }),
]
