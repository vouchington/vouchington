import topicsShowDefault from '../../../../api-fixtures/v1/responses/web.topics.show.default.json'
import type { TopicResponseBody } from '@/types/api-responses'
import type { ImagePlacementTuple } from '@/types/user'
import type { Topic } from '@/types/topics'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

type TopicWithHeroPlacement = Omit<Topic, 'hero_image_placement'> & {
  hero_image_placement: ImagePlacementTuple | null
}
type TopicDetailFixture = Omit<TopicResponseBody, 'topic'> & { topic: TopicWithHeroPlacement }

function requireHeroPlacement(topic: Topic): TopicWithHeroPlacement {
  if (!Object.hasOwn(topic, 'hero_image_placement')) {
    throw new Error('Topic detail response omitted hero_image_placement')
  }
  return topic as TopicWithHeroPlacement
}

export const TOPIC_DECLARATIONS = [
  defineWebApiFixture<TopicDetailFixture>()(
    'web.topics.show.default',
    topicsShowDefault,
    async context => {
      const response = await context.server.topics.getTopic('test-topic')
      return response ? { ...response, topic: requireHeroPlacement(response.topic) } : null
    },
    [
      async context => {
        const topic = await context.client.topics.fetchTopic('test-topic')
        if (topic) requireHeroPlacement(topic)
        return null
      },
    ],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
