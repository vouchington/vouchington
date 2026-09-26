import sql, { type SQLStatement } from 'sql-template-strings'

/** Reads old receipts SQL-side during expansion; JSON never crosses the application boundary. */
export function publicationReceiptIdentityRowsSql(postId: SQLStatement): SQLStatement {
  const statement = sql`WITH receipt AS (SELECT * FROM post_publication_projection_receipts WHERE post_id = `
  statement.append(postId).append(sql`)
    SELECT key.kind, key.uuid_value, key.text_value, key.post_type, key.day
    FROM receipt JOIN post_publication_identity_snapshot_keys key ON key.snapshot_id = receipt.applied_snapshot_id
    UNION SELECT 'topic', value::text::uuid, NULL::text, NULL::post_types, NULL::date
      FROM receipt CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(applied_identity->'topicIds', '[]'::jsonb)) value
      WHERE applied_snapshot_id IS NULL
    UNION SELECT CASE WHEN value->>'kind' = 'author' AND NOT (value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN 'author_username' ELSE value->>'kind' END,
      CASE WHEN value->>'kind' IN ('community','rss_feed') OR (value->>'kind' = 'author' AND value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN (value->>'value')::uuid ELSE NULL END,
      CASE WHEN value->>'kind' IN ('community_slug','post_slug') OR (value->>'kind' = 'author' AND NOT (value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) THEN value->>'value' ELSE NULL END,
      NULL, NULL FROM receipt CROSS JOIN LATERAL jsonb_array_elements(COALESCE(applied_identity->'identityKeys', '[]'::jsonb)) value WHERE applied_snapshot_id IS NULL
    UNION SELECT 'sitemap_target', NULL, NULL, (value->>'postType')::post_types, (value->>'day')::date
      FROM receipt CROSS JOIN LATERAL jsonb_array_elements(COALESCE(applied_identity->'sitemapTargets', '[]'::jsonb)) value WHERE applied_snapshot_id IS NULL`)
  return statement
}
