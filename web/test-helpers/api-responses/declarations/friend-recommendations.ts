import nativeFriendRecommendationsDefault from '../../../../api-fixtures/v1/responses/native.friend-recommendations.default.json'
import nativeFriendRecommendationsEmpty from '../../../../api-fixtures/v1/responses/native.friend-recommendations.empty.json'
import nativeFriendRecommendationsSecondPage from '../../../../api-fixtures/v1/responses/native.friend-recommendations.second-page.json'
import type { FriendRecommendationsResponseBody } from '@/types/api-responses'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const secondCursor =
  'eyJpZCI6IjAxOWZhZmMxLTMwOGQtN2RiNS1iODM0LTZiYmY2NDFiZjBlNyIsInNjb3BlIjoie1wicmVzb3VyY2VcIjpcIm15LWZyaWVuZC1yZWNvbW1lbmRhdGlvbnNcIixcIm93bmVyX2lkXCI6XCJmaXh0dXJlLXVzZXJcIixcIm9yZGVyXCI6XCJpZC1hc2NcIn0ifQ'
const firstCursor =
  'eyJpZCI6InVzZXItMSIsInNjb3BlIjoie1wicmVzb3VyY2VcIjpcIm15LWZyaWVuZC1yZWNvbW1lbmRhdGlvbnNcIixcIm93bmVyX2lkXCI6XCJmaXh0dXJlLXVzZXJcIixcIm9yZGVyXCI6XCJpZC1hc2NcIn0ifQ'

export const FRIEND_RECOMMENDATIONS_DECLARATIONS = [
  defineWebApiFixture<FriendRecommendationsResponseBody>()(
    'native.friend-recommendations.default',
    nativeFriendRecommendationsDefault,
    context => context.client.friendRecommendations.getFriendRecommendations({ limit: 25 }),
    [context => context.server.my.getMyFriendRecommendations({ limit: 25 })],
  ),
  defineWebApiFixture<FriendRecommendationsResponseBody>()(
    'native.friend-recommendations.empty',
    nativeFriendRecommendationsEmpty,
    context =>
      context.client.friendRecommendations.getFriendRecommendations({
        limit: 25,
        after: secondCursor,
      }),
    [context => context.server.my.getMyFriendRecommendations({ limit: 25, after: secondCursor })],
  ),
  defineWebApiFixture<FriendRecommendationsResponseBody>()(
    'native.friend-recommendations.second-page',
    nativeFriendRecommendationsSecondPage,
    context =>
      context.client.friendRecommendations.getFriendRecommendations({
        limit: 25,
        after: firstCursor,
      }),
    [context => context.server.my.getMyFriendRecommendations({ limit: 25, after: firstCursor })],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
