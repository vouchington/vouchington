import myTopicClaimsPage from '../../../../api-fixtures/v1/responses/native.my-topic-claims.page.json'
import topicClaimsPage from '../../../../api-fixtures/v1/responses/native.topic-claims.page.json'
import type { PageInfo } from '@voucha/types/pagination'
import type { TopicClaim, TopicClaimState } from '@/types/topic-claims'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

type TopicClaimPage = {
  results: (TopicClaim & { state?: TopicClaimState })[]
  page_info: PageInfo
}

const topicId = '00000000-0000-7000-8000-000000000301'

export const TOPIC_CLAIMS_DECLARATIONS = [
  defineWebApiFixture<TopicClaimPage>()('native.my-topic-claims.page', myTopicClaimsPage, context =>
    context.server.topicClaims.getMyTopicClaims(undefined, undefined, undefined, 1),
  ),
  defineWebApiFixture<TopicClaimPage>()('native.topic-claims.page', topicClaimsPage, context =>
    context.server.topicClaims.getTopicClaims(topicId, true, true, 1),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
