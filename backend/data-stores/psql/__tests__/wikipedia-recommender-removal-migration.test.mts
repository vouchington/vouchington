import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { read } from '../index.mts'

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
