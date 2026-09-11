import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestPost } from './posts.mts'
import { insertTestRssFeed } from './rss-feeds.mts'
import { insertTestTopic } from './topics/core.mts'
import { insertTestUrlDirect } from './urls.mts'

export async function insertTestLinkPostWithAudio(data: {
  createdById: string
  title?: string
}): Promise<{ postId: string; slug: string; urlId: string }> {
  const { randomUUID } = await import('node:crypto')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const href = `https://example-${suffix}.com/podcast`
  const url = await insertTestUrlDirect(null, href, { content_type: 'text/html' })
  if (!url) throw new Error('insertTestLinkPostWithAudio: insertTestUrlDirect returned null')
  const urlId = url.id
  const sha256 = `\\x${'0'.repeat(64)}`
  const guid = `pw-audio-${suffix}`
  const enclosureUrl = `https://example-${suffix}.com/episode.mp3`

  await write(sql`/* insertTestLinkPostWithAudio */
    WITH identity AS (
      INSERT INTO rss_feed_item_ids (url_hostname_id, guid)
      VALUES (${url.hostname.id}, ${guid})
      ON CONFLICT (url_hostname_id, guid) DO UPDATE SET guid = EXCLUDED.guid
      RETURNING id
    )
    INSERT INTO rss_feed_items (
      id,
      url_id,
      data,
      media_type,
      enclosure_url,
      bedrock_nova_multimodal_v1_content_sha256
    )
    SELECT
      identity.id,
      ${urlId},
      '{}'::jsonb,
      'audio'::rss_feed_item_media_types,
      ${enclosureUrl},
      ${sha256}
    FROM identity
    ON CONFLICT (id) DO UPDATE SET
      url_id = EXCLUDED.url_id,
      data = EXCLUDED.data,
      media_type = EXCLUDED.media_type,
      enclosure_url = EXCLUDED.enclosure_url,
      bedrock_nova_multimodal_v1_content_sha256 =
        EXCLUDED.bedrock_nova_multimodal_v1_content_sha256
  `)

  const slug = `test-audio-link-post-${suffix}`
  const postId = await insertTestPost({
    title: data.title ?? `Test Audio Link Post ${suffix}`,
    slug,
    createdById: data.createdById,
    markdown: '',
    postType: 'link',
    urlId,
  })
  return { postId, slug, urlId }
}

export async function insertTestLinkPostWithPodcastEpisode(data: {
  createdById: string
  title?: string
}): Promise<{ postId: string; slug: string; urlId: string }> {
  const { randomUUID } = await import('node:crypto')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const href = `https://example-${suffix}.com/podcast-ep`
  const url = await insertTestUrlDirect(null, href, { content_type: 'text/html' })
  if (!url)
    throw new Error('insertTestLinkPostWithPodcastEpisode: insertTestUrlDirect returned null')
  const topicId = await insertTestTopic({
    name: `PW Podcast Show ${suffix}`,
    slug: `pw-podcast-${suffix}`,
    createdById: data.createdById,
    topicType: 'rss_feed',
  })
  const feedId = await insertTestRssFeed({
    topicId,
    title: `PW Podcast ${suffix}`,
    feedType: 'podcast',
  })
  const guid = `pw-pod-ep-${suffix}`
  const enclosureUrl = `https://example-${suffix}.com/ep.mp3`
  const sha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write(sql`/* insertTestLinkPostWithPodcastEpisode */
    WITH identity AS (
      INSERT INTO rss_feed_item_ids (url_hostname_id, guid)
      VALUES (${url.hostname.id}, ${guid})
      ON CONFLICT (url_hostname_id, guid) DO UPDATE SET guid = EXCLUDED.guid
      RETURNING id
    )
    INSERT INTO rss_feed_items (
      id, url_id, data, media_type, enclosure_url,
      bedrock_nova_multimodal_v1_content_sha256
    )
    SELECT
      identity.id, ${url.id}, '{}'::jsonb,
      'audio'::rss_feed_item_media_types, ${enclosureUrl}, ${sha256}
    FROM identity
    ON CONFLICT (id) DO UPDATE SET
      url_id = EXCLUDED.url_id,
      data = EXCLUDED.data,
      media_type = EXCLUDED.media_type,
      enclosure_url = EXCLUDED.enclosure_url,
      bedrock_nova_multimodal_v1_content_sha256 =
        EXCLUDED.bedrock_nova_multimodal_v1_content_sha256
    RETURNING id
  `)
  const itemId = rows[0].id as string
  const { rowCount: sourceRowCount } = await write(sql`/* insertTestPodcastLinkRssSource */
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    VALUES (
      ${feedId},
      ${itemId},
      (SELECT published_at FROM rss_feed_items WHERE id = ${itemId})
    )`)
  if (sourceRowCount !== 1) {
    throw new Error(
      `insertTestLinkPostWithPodcastEpisode: expected one RSS source insert, got ${sourceRowCount}`,
    )
  }
  const slug = `test-podcast-link-${suffix}`
  const postId = await insertTestPost({
    title: data.title ?? `Test Podcast Link ${suffix}`,
    slug,
    createdById: data.createdById,
    markdown: '',
    postType: 'link',
    urlId: url.id,
  })
  return { postId, slug, urlId: url.id }
}
