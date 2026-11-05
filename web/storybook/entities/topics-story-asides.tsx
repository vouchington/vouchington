import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { TopicActionsAside } from '@/components/topics/topic-actions-aside'
import { TopicDescriptionAside } from '@/components/topics/topic-description-aside'
import { TopicSourcesAside } from '@/components/topics/topic-sources-aside'
import { AsideStack } from './entity-story-frame'
import { hostnamesResponse, rssFeeds, topics } from './entity-fixtures'

const t = createTranslator('en', await loadJsonMessages('en'))

const storyContentUpdate = {
  updated_at: '2026-05-05T00:00:00.000Z',
  updated_by: { account_type: null, id: 'user-0', username: 'jong', display_account: null },
}

export function TopicAsides() {
  return (
    <AsideStack>
      <TopicActionsAside
        topicId={topics[1]!.id}
        topicType={topics[1]!.topic_type}
        topicSlug={topics[1]!.slug}
        isMuted={false}
      />
      <TopicDescriptionAside
        t={t}
        topicName={topics[1]!.name}
        html='<p>A production aside showing the topic summary rendered from sanitized markdown.</p>'
        contentUpdate={storyContentUpdate}
      />
      <TopicSourcesAside
        t={t}
        rssFeeds={{
          results: rssFeeds.slice(0, 3),
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
          topic_elections: {},
          hostname_elections: {},
        }}
        hostnames={hostnamesResponse}
      />
    </AsideStack>
  )
}
