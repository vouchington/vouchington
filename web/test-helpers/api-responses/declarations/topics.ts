import topicsShowDefault from '../../../../api-fixtures/v1/responses/web.topics.show.default.json'
import type { TopicResponseBody } from '@/types/api-responses'
import type { ImagePlacementTuple } from '@/types/user'
import type { Topic } from '@/types/topics'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

type TopicWithHeroPlacement = Omit<Topic, 'hero_image_placement'> & {
  hero_image_placement: ImagePlacementTuple | null
}
type TopicDetailFixture = Omit<TopicResponseBody, 'topic'> & { topic: TopicWithHeroPlacement }

export const TOPIC_DECLARATIONS = [
  defineWebApiFixture<TopicDetailFixture>()(
    'web.topics.show.default',
    topicsShowDefault,
    async context => {
      await context.server.topics.getTopic('test-topic')
      return null
    },
    [
      async context => {
        await context.client.topics.fetchTopic('test-topic')
        return null
      },
    ],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
