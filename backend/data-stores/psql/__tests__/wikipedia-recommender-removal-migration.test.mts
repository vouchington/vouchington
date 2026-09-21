import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { beginTransaction, read } from '../index.mts'

const migrationSql = readFileSync(
  new URL('../migrations/0720-00-00-remove-wikipedia-recommendation.sql', import.meta.url),
  'utf8',
)

describe('Wikipedia recommender removal migration', () => {
  it('targets only posts and agent state owned by the retired system user', () => {
    expect(migrationSql).toContain("WHERE username = 'wikipedia-recommender'")
    expect(migrationSql).toContain("posts.post_type = 'topic_recommendation'")
    expect(migrationSql).toContain("agents.agent_type = 'recommender'")
    expect(migrationSql).not.toMatch(/DELETE FROM post_topic_recommendations\s*;/u)
    expect(migrationSql).not.toMatch(/DELETE FROM users\b/u)
  })

  it('removes retired records while preserving a generic recommendation fixture', async () => {
    const schema = `wikipedia_removal_${randomUUID().replaceAll('-', '')}`
    const transaction = await beginTransaction()

    try {
      await transaction.client.query(`/* prepareWikipediaRecommenderRemovalFixture */
        CREATE SCHEMA "${schema}";
        SET LOCAL search_path TO "${schema}";
        CREATE TYPE agent_types AS ENUM ('moderator', 'autotagger', 'storyteller', 'recommender');
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT,
          is_system BOOLEAN NOT NULL,
          deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE posts (
          id TEXT PRIMARY KEY,
          created_by_id TEXT NOT NULL REFERENCES users(id),
          post_type TEXT NOT NULL
        );
        CREATE TABLE post_topic_recommendations (
          post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
          topic_wikipedia_pageid TEXT,
          topic_title TEXT NOT NULL
        );
        CREATE TABLE agents (
          system_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          agent_type agent_types NOT NULL
        );
        CREATE VIEW view_posts AS SELECT id, post_type FROM posts;
        INSERT INTO users (id, username, is_system) VALUES
          ('retired-user', 'wikipedia-recommender', TRUE),
          ('generic-user', 'generic-user', FALSE);
        INSERT INTO posts (id, created_by_id, post_type) VALUES
          ('retired-post', 'retired-user', 'topic_recommendation'),
          ('generic-post', 'generic-user', 'topic_recommendation');
        INSERT INTO post_topic_recommendations (post_id, topic_wikipedia_pageid, topic_title) VALUES
          ('retired-post', '101', 'Retired'),
          ('generic-post', NULL, 'Generic');
        INSERT INTO agents (system_user_id, agent_type)
        VALUES ('retired-user', 'recommender');`)

      await transaction.client.query(migrationSql)

      const { rows } = await transaction<{
        agent_count: string
        generic_count: string
        recommender_type_count: string
        retired_count: string
        retired_user_anonymized: boolean
        wikipedia_column_count: string
      }>(`/* inspectWikipediaRecommenderRemovalFixture */
        SELECT
          (SELECT COUNT(*) FROM posts WHERE id = 'generic-post') AS generic_count,
          (SELECT COUNT(*) FROM posts WHERE id = 'retired-post') AS retired_count,
          (SELECT COUNT(*) FROM agents WHERE system_user_id = 'retired-user') AS agent_count,
          (SELECT username IS NULL AND deleted_at IS NOT NULL FROM users WHERE id = 'retired-user')
            AS retired_user_anonymized,
          (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = '${schema}'
              AND table_name = 'post_topic_recommendations'
              AND column_name = 'topic_wikipedia_pageid') AS wikipedia_column_count,
          (SELECT COUNT(*) FROM pg_enum
            JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
            JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
            WHERE pg_namespace.nspname = '${schema}'
              AND pg_type.typname = 'agent_types'
              AND pg_enum.enumlabel = 'recommender') AS recommender_type_count`)

      expect(rows).toEqual([
        {
          agent_count: '0',
          generic_count: '1',
          recommender_type_count: '0',
          retired_count: '0',
          retired_user_anonymized: true,
          wikipedia_column_count: '0',
        },
      ])
    } finally {
      await transaction.rollback()
    }
  })

  it('preserves generic recommendation storage and removes only the Wikipedia field and type', async () => {
    const { rows } = await read<{
      generic_tables_present: boolean
      recommender_type_present: boolean
      wikipedia_column_present: boolean
    }>(`/* verifyWikipediaRecommenderRemoval */
      SELECT
        to_regclass('post_topic_recommendations') IS NOT NULL
          AND to_regclass('post_topic_recommendations_hostnames') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM pg_type
            WHERE pg_type.typname = 'post_topic_recommendation_topic_types'
          )
          AS generic_tables_present,
        EXISTS (
          SELECT 1
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'agent_types'
            AND pg_enum.enumlabel = 'recommender'
        ) AS recommender_type_present,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'post_topic_recommendations'
            AND column_name = 'topic_wikipedia_pageid'
        ) AS wikipedia_column_present`)

    expect(rows).toEqual([
      {
        generic_tables_present: true,
        recommender_type_present: false,
        wikipedia_column_present: false,
      },
    ])
  })
})
