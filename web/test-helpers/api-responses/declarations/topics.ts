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
      const response = await context.server.topics.getTopic('test-topic')
      const topic = response?.topic
      if (!topic) return null
      if (
        !Object.hasOwn(topic, 'hero_image_placement') ||
        topic.hero_image_placement === undefined
      ) {
        throw new Error('Topic detail response is missing hero_image_placement')
      }
      return {
        ...response,
        topic: {
          ...topic,
          hero_image_placement: topic.hero_image_placement,
        },
      }
    },
    [
      async context => {
        await context.client.topics.fetchTopic('test-topic')
        return null
      },
    ],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
