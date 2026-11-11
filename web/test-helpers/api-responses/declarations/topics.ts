import topicsLinkCountDefault from '../../../../api-fixtures/v1/responses/web.topics.link-count.default.json'
import topicsViewerLowerBound from '../../../../api-fixtures/v1/responses/web.topics.show.viewer-lower-bound.json'
import topicsShowDefault from '../../../../api-fixtures/v1/responses/web.topics.show.default.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { TopicResponseBody } from '@/types/api-responses'
import type { ImagePlacementTuple } from '@/types/user'
import type { Topic } from '@/types/topics'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

type TopicWithImagePlacements = Omit<Topic, 'logo_image_placement' | 'hero_image_placement'> & {
  logo_image_placement: ImagePlacementTuple | null
  hero_image_placement: ImagePlacementTuple | null
}
type TopicDetailFixture = Omit<TopicResponseBody, 'topic'> & { topic: TopicWithImagePlacements }

function assertTopicImagePlacements(topic: Topic): asserts topic is TopicWithImagePlacements {
  for (const field of ['logo_image_placement', 'hero_image_placement'] as const) {
    if (!Object.hasOwn(topic, field) || topic[field] === undefined) {
      throw new Error(`Topic detail response is missing ${field}`)
    }
  }
}

export const TOPIC_DECLARATIONS = [
  defineWebApiFixture<TopicResponseBody>()(
    'web.topics.show.viewer-lower-bound',
    topicsViewerLowerBound,
    context => context.server.topics.getTopic('test-topic'),
  ),
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'web.topics.link-count.default',
    topicsLinkCountDefault,
    context =>
      context.server.topics.getTopics({
        searchParams: { sort: 'link_count', limit: 5 },
      }),
  ),
  defineWebApiFixture<TopicDetailFixture>()(
    'web.topics.show.default',
    topicsShowDefault,
    async context => {
      const response = await context.server.topics.getTopic('test-topic')
      const topic = response?.topic
      if (!topic) return null
      assertTopicImagePlacements(topic)
      return {
        ...response,
        topic: {
          ...topic,
          logo_image_placement: topic.logo_image_placement,
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
