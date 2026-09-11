#!/usr/bin/env bash
# Source this file to use detect_stale_schema_reason.
# Schema-drift detectors print one reset reason when they detect stale local
# state, and print nothing for healthy or not-yet-applicable schemas.

detect_recently_viewed_schema_drift() {
  local database_url=$1 stale_recently_viewed_schema

  stale_recently_viewed_schema=$(psql "$database_url" -Atqc "
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM migrations
          WHERE id = '0060-00-00-recently-viewed.sql'
        )
        AND (
          to_regclass('recently_viewed_topics') IS NULL
          OR to_regclass('recently_viewed_posts') IS NULL
          OR to_regclass('recently_viewed_rss_feed_items') IS NULL
          OR to_regclass('recently_viewed_users') IS NULL
          OR (
            EXISTS (
              SELECT 1
              FROM migrations
              WHERE id = '0170-00-05-recently-viewed-landing-pages.sql'
            )
            AND to_regclass('recently_viewed_landing_pages') IS NULL
          )
        )
        THEN 't'
        ELSE 'f'
      END
  ")

  if [ "$stale_recently_viewed_schema" = "t" ]; then
    printf '%s\n' "applied recently-viewed migrations are missing local tables"
  fi
}

detect_community_auto_tagger_schema_drift() {
  local database_url=$1 stale_community_auto_tagger_schema

  stale_community_auto_tagger_schema=$(psql "$database_url" -Atqc "
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM migrations
          WHERE id = '0140-00-00-communities-publications.sql'
        )
        AND to_regclass('community_auto_tagger_agents') IS NULL
        THEN 't'
        ELSE 'f'
      END
  ")

  if [ "$stale_community_auto_tagger_schema" = "t" ]; then
    printf '%s\n' "applied communities migration is missing community_auto_tagger_agents"
  fi
}

detect_posts_language_schema_drift() {
  local database_url=$1 stale_posts_language_schema

  stale_posts_language_schema=$(psql "$database_url" -Atqc "
      -- Keep in sync with dev/check-db-backed-test-setup/schema-probe.mts.
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM migrations
          WHERE id = '0070-00-00-posts-feed-content.sql'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'posts'
            AND column_name IN ('declared_language', 'lingua_rs_detected_language')
          HAVING COUNT(*) = 2
        )
        THEN 'applied posts migration is missing language columns used by view_posts'
        WHEN EXISTS (
          SELECT 1
          FROM migrations
          WHERE id = '0070-00-00-posts-feed-content.sql'
        )
        AND to_regclass('view_posts') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'view_posts'
            AND column_name IN ('declared_language', 'lingua_rs_detected_language')
          HAVING COUNT(*) = 2
        )
        THEN 'existing view_posts is missing posts language columns'
        ELSE ''
      END
  ")

  if [ -n "$stale_posts_language_schema" ]; then
    printf '%s\n' "$stale_posts_language_schema"
  fi
}

readonly -a SCHEMA_DRIFT_DETECTORS=(
  detect_recently_viewed_schema_drift
  detect_community_auto_tagger_schema_drift
  detect_posts_language_schema_drift
)

detect_stale_schema_reason() {
  local database_url=$1 detector stale_schema_reason

  for detector in "${SCHEMA_DRIFT_DETECTORS[@]}"; do
    stale_schema_reason=$("$detector" "$database_url")
    if [ -n "$stale_schema_reason" ]; then
      printf '%s\n' "$stale_schema_reason"
      return 0
    fi
  done
}
