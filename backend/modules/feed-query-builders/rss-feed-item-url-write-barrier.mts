/** Actual old/new rows, including generated publication dates, determine the URL write set. */
export const RSS_ITEM_URL_WRITE_RETURNING = `
  RETURNING WITH (OLD AS prior_item, NEW AS written_item)
    written_item.id, written_item.url_id, written_item.story_id,
    (written_item.bedrock_nova_multimodal_v1_embedding IS NOT NULL) AS has_embedding,
    written_item.published_at, prior_item.id AS prior_id,
    prior_item.url_id AS prior_url_id, prior_item.published_at AS prior_published_at
`

/** Consume the sorted union before either event-specific AFTER statement trigger can write. */
export const RSS_ITEM_URL_WRITE_LOCKS = `
  /* deadlock-safe: actual returned URL write ids are locked in url.id order;
     the outer COUNT consumes this set before either statement AFTER trigger. */
  locked_item_urls AS MATERIALIZED (
    SELECT url.id FROM urls url
    WHERE url.id = ANY((
      SELECT array_agg(DISTINCT affected.url_id) FROM written_rss_feed_items item
      CROSS JOIN LATERAL (VALUES (item.prior_url_id), (item.url_id)) affected(url_id)
      WHERE affected.url_id IS NOT NULL
        AND (item.prior_id, item.prior_url_id, item.prior_published_at)
          IS DISTINCT FROM (item.id, item.url_id, item.published_at)
    )::uuid[])
    ORDER BY url.id FOR NO KEY UPDATE OF url
  )
`

// A referenced aggregate fully consumes the lock CTE even when a caller returns only item rows.
export const RSS_ITEM_URL_WRITE_BARRIER = '(SELECT COUNT(*) FROM locked_item_urls) >= 0'
