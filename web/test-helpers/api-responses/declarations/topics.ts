import topicsShowDefault from '../../../../api-fixtures/v1/responses/web.topics.show.default.json'
import type { TopicResponseBody } from '@/types/api-responses'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const TOPIC_DECLARATIONS = [
  defineWebApiFixture<TopicResponseBody>()(
    'web.topics.show.default',
    topicsShowDefault,
    context => context.server.topics.getTopic('test-topic'),
    [
      async context => {
        await context.client.topics.fetchTopic('test-topic')
        return null
      },
    ],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
