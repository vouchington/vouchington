import { pageInfo, timestamp, topic, user } from './data.mts'
import { publicNativeUrlEmbed } from './native-domain-url-data.mts'

const swiftPodcastEpisodeId = 'episode-1'
const swiftPodcastEpisodeChaptersUrl = 'https://example.com/podcast-ep-1/chapters.json'

export const swiftPodcastEpisodeChaptersBody = {
  chapters: [
    {
      start_seconds: 0,
      end_seconds: 60,
      title: 'Intro',
      url: 'https://example.com/podcast-ep-1#intro',
      image_url: 'https://images.example.com/sideload/podcast-ep-1-chapter-intro.jpg?w=400',
      is_visible: true,
    },
    {
      start_seconds: 60,
      end_seconds: null,
      title: 'Main Segment',
      url: 'https://example.com/podcast-ep-1#main',
      image_url: 'https://images.example.com/sideload/podcast-ep-1-chapter-main.jpg?w=400',
      is_visible: false,
    },
  ],
}

export const swiftPodcastEpisodeBody = {
  results: [
    {
      __entity_type: 'rss_feed_item',
      id: swiftPodcastEpisodeId,
      entity_id: swiftPodcastEpisodeId,
      published_at: timestamp,
      story_id: null,
    },
  ],
  page_info: pageInfo,
  rss_feed_items: {
    [swiftPodcastEpisodeId]: {
      __entity_type: 'rss_feed_item',
      id: swiftPodcastEpisodeId,
      published_at: timestamp,
      media_type: 'audio',
      lingua_rs_detected_language: null,
      data: {
        chapters_type: 'application/json+chapters',
        chapters_url: swiftPodcastEpisodeChaptersUrl,
        contentSnippet: 'A short podcast snippet',
        enclosure_length: 50000000,
        enclosure_type: 'audio/mpeg',
        enclosure_url: 'https://example.com/podcast-ep-1.mp3',
        guid: swiftPodcastEpisodeId,
        link: 'https://example.com/podcast-ep-1',
        media_type: 'audio',
        thumbnail_url: 'https://images.example.com/sideload/episode-1-thumbnail.jpg?w=400',
        title: 'Test Podcast Episode 1',
      },
      url: { id: 'url-episode-1', url: 'https://example.com/podcast-ep-1', canonical_url_id: null },
      rss_feed: {
        __entity_type: 'rss_feed',
        id: 'feed-podcast-1',
        title: 'Example Podcast Feed',
        is_enabled: true,
        is_discoverable: true,
        last_fetched_at: timestamp,
        feed_type: 'podcast',
        publisher_type: {
          id: 'publisher-type-blog',
          name: 'Blog',
          slug: 'blog',
          topic_type: 'publisher_type',
        },
        podcast_show: {
          cover_art_url: 'https://images.example.com/sideload/show-podcast-1-cover.jpg?w=400',
          description: null,
          itunes_author: 'Test Host',
          itunes_owner_name: 'Test Network',
          itunes_type: 'episodic',
          is_explicit: false,
        },
        topic,
      },
      rss_feed_sources: [],
      categories: [
        {
          id: 'category-1',
          category_text: 'Travel',
          hashtag: null,
          topic: {
            id: 'topic-1',
            name: 'Tech',
            slug: 'tech',
            topic_type: 'topic',
          },
          votes_score_net: 3,
        },
      ],
      media_content: {
        url: 'https://example.com/podcast-ep-1.mp3',
        type: 'audio/mpeg',
        medium: 'audio',
        duration: 1830,
      },
    },
  },
  rss_feed_item_elections: {
    [swiftPodcastEpisodeId]: {
      __entity_type: 'rss_feed_item_election',
      id: swiftPodcastEpisodeId,
      votes_count_down: 2,
      votes_count_up: 7,
      votes_score_net: 5,
    },
  },
  election_votes: {
    [swiftPodcastEpisodeId]: {
      __entity_type: 'election_vote',
      created_at: timestamp,
      entity_id: swiftPodcastEpisodeId,
      choice: 'like',
      user_id: user.id,
    },
  },
  rss_feed_item_thumbnail_url: {
    [swiftPodcastEpisodeId]: 'https://images.example.com/sideload/episode-1-thumbnail.jpg?w=400',
  },
  rss_feed_item_embeds: {
    [swiftPodcastEpisodeId]: {
      ...publicNativeUrlEmbed,
      rss_feed_item_id: swiftPodcastEpisodeId,
      source_url: 'https://example.com/podcast-ep-1',
      media_type: 'audio',
      video_id: null,
      video_platform: null,
      player_url: null,
      player_width: null,
      player_height: null,
      enclosure_url: 'https://example.com/podcast-ep-1.mp3',
      enclosure_type: 'audio/mpeg',
      duration_seconds: 1830,
      thumbnail_url: 'https://images.example.com/sideload/episode-1-thumbnail.jpg?w=640',
      title: 'Test Podcast Episode 1',
      show_id: 'feed-podcast-1',
      show_title: 'Example Podcast Feed',
      show_topic_slug: topic.slug,
      show_topic_type: topic.topic_type,
      embed_metadata: null,
      meta_tags: null,
      embed_oembed_url: null,
      embed_oembed_resolved_at: null,
    },
  },
}
