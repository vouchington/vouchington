import { describe, expect, it } from 'vitest'
import { writePool } from '@data-stores/psql'
import { runConfigDrivenStatementsInTransaction } from '../migration-runner/config-driven-statements.mts'
import generateElectionSchema from '../config-driven/0000-00-00-entity-elections.mts'
import { generateLegacySentimentZeroVoteRepairSql } from '../config-driven/utils/legacy-sentiment-zero-vote-repair.mts'
import { write } from '../setup.mts'

const LEGACY_SENTIMENT_VOTE_TABLES = [
  ['post_votes', 'post_id', 'posts'],
  ['topic_votes', 'topic_id', 'topics'],
  ['hostname_votes', 'hostname_id', 'url_hostnames'],
  ['rss_feed_item_votes', 'rss_feed_item_id', 'rss_feed_items'],
  ['user_vouch_votes', 'target_user_id', 'users'],
] as const

describe('legacy sentiment zero vote migration', () => {
  it('uses a null-safe Neutral provenance check in create and repair SQL', () => {
    const schemaSql = generateElectionSchema()
    expect(
      schemaSql.match(/CHECK \(NOT score_is_neutral OR score IS NOT DISTINCT FROM 0\)/g),
    ).toHaveLength(LEGACY_SENTIMENT_VOTE_TABLES.length * 2)
    expect(schemaSql).toContain("POSITION('IS NOT DISTINCT FROM 0' IN pg_get_constraintdef")
    expect(schemaSql).toContain("migration_entity.post_type NOT IN ('topic_recommendation')")
    expect(schemaSql).toContain('topic_vote_signals.score_is_semantic THEN 2')
    expect(schemaSql).toContain(
      "uuidv7(uuid_extract_timestamp(current_votes.id) + INTERVAL '1 millisecond' - clock_timestamp())",
    )
  })
  it('preserves historical rows, retains current legacy zero Clear ballots, and converges', async () => {
    const setupVoteTables = LEGACY_SENTIMENT_VOTE_TABLES.map(
      ([table, entityIdColumn]) => `CREATE TEMP TABLE ${table} (
  user_id UUID NOT NULL,
  ${entityIdColumn} UUID NOT NULL,
  ${table === 'post_votes' ? 'outbound_ap_like_activity_id UUID,' : ''}
  id UUID NOT NULL DEFAULT uuidv7(),
  score SMALLINT,
  score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE,
  score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE
) ON COMMIT DROP;`,
    ).join('\n')
    const setupEntityTables = LEGACY_SENTIMENT_VOTE_TABLES.filter(
      ([, , entityTable]) => entityTable !== 'users',
    )
      .map(
        ([, , entityTable]) => `CREATE TEMP TABLE ${entityTable} (
  id UUID PRIMARY KEY,
  ${entityTable === 'posts' ? "post_type TEXT NOT NULL DEFAULT 'discussion'," : ''}
  ${entityTable === 'posts' ? 'created_by_id UUID, deleted_at TIMESTAMPTZ, archived_at TIMESTAMPTZ,' : ''}
  votes_score_up DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_score_none DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_score_down DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_count_up INTEGER NOT NULL DEFAULT 9,
  votes_count_none INTEGER NOT NULL DEFAULT 9,
  votes_count_down INTEGER NOT NULL DEFAULT 9
) ON COMMIT DROP;`,
      )
      .join('\n')
    const setupTables = `CREATE TEMP TABLE users (
  id UUID PRIMARY KEY,
  vote_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  votes_score_up DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_score_none DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_score_down DOUBLE PRECISION NOT NULL DEFAULT 9,
  votes_count_up INTEGER NOT NULL DEFAULT 9,
  votes_count_none INTEGER NOT NULL DEFAULT 9,
  votes_count_down INTEGER NOT NULL DEFAULT 9
) ON COMMIT DROP;
${setupVoteTables}
${setupEntityTables}
CREATE TEMP TABLE post_review_topic_ratings (
  post_id UUID NOT NULL,
  topic_id UUID NOT NULL,
  rating SMALLINT NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE topic_metrics (
  topic_id UUID PRIMARY KEY,
  ratings__score__1 DOUBLE PRECISION NOT NULL DEFAULT 9,
  ratings__score__2 DOUBLE PRECISION NOT NULL DEFAULT 9,
  ratings__score__3 DOUBLE PRECISION NOT NULL DEFAULT 9,
  ratings__score__4 DOUBLE PRECISION NOT NULL DEFAULT 9,
  ratings__score__5 DOUBLE PRECISION NOT NULL DEFAULT 9,
  ratings__count__1 INTEGER NOT NULL DEFAULT 9,
  ratings__count__2 INTEGER NOT NULL DEFAULT 9,
  ratings__count__3 INTEGER NOT NULL DEFAULT 9,
  ratings__count__4 INTEGER NOT NULL DEFAULT 9,
  ratings__count__5 INTEGER NOT NULL DEFAULT 9,
  ratings__updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) ON COMMIT DROP;`
    expect(setupTables.match(/ON COMMIT DROP/g)).toHaveLength(
      LEGACY_SENTIMENT_VOTE_TABLES.length * 2 + 2,
    )
    const legacyRows = LEGACY_SENTIMENT_VOTE_TABLES.map(
      ([table, entityIdColumn, entityTable]) => `
INSERT INTO ${entityTable} (id)
VALUES
  ('00000000-0000-7000-8000-000000000011'),
  ('00000000-0000-7000-8000-000000000012'),
  ('00000000-0000-7000-8000-000000000013');
INSERT INTO ${table} (user_id, ${entityIdColumn}, score)
VALUES
  ('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000011', 1),
  ('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-000000000011', 0),
  ('00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000012', 0),
  ('00000000-0000-7000-8000-000000000002', '00000000-0000-7000-8000-000000000012', 1),
  ('00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000013', -1);`,
    ).join('\n')
    const postActivityPubLikeFixture = `
UPDATE post_votes
SET outbound_ap_like_activity_id = '00000000-0000-7000-8000-000000000101'
WHERE user_id = '00000000-0000-7000-8000-000000000002'
  AND post_id = '00000000-0000-7000-8000-000000000012'
  AND score = 1;`
    const deletedVoterTopicFixture = `
INSERT INTO users (id, deleted_at)
VALUES ('00000000-0000-7000-8000-000000000004', CURRENT_TIMESTAMP);
INSERT INTO topics (id)
VALUES ('00000000-0000-7000-8000-000000000014');
INSERT INTO topic_votes (user_id, topic_id, score)
VALUES ('00000000-0000-7000-8000-000000000004', '00000000-0000-7000-8000-000000000014', 1);`
    const assertions = LEGACY_SENTIMENT_VOTE_TABLES.map(
      ([table, entityIdColumn, entityTable]) => `
  IF (SELECT count(*) FROM ${table}) <> ${table === 'topic_votes' ? 9 : 7} THEN
    RAISE EXCEPTION '${table} did not preserve history while appending only repaired sentiment votes';
  END IF;
  IF (
    SELECT score FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000001'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000011'
    ORDER BY id DESC LIMIT 1
  ) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '${table} current legacy zero was not retained as Clear';
  END IF;
  IF (
    SELECT score FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000002'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000012'
    ORDER BY id DESC LIMIT 1
  ) <> 2 THEN
    RAISE EXCEPTION '${table} current historic Vouch was not repaired to its weight';
  END IF;
  ${
    table === 'post_votes'
      ? `IF (
    SELECT outbound_ap_like_activity_id FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000002'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000012'
    ORDER BY id DESC LIMIT 1
  ) <> '00000000-0000-7000-8000-000000000101'::uuid THEN
    RAISE EXCEPTION '${table} current historic Vouch lost its outbound Like activity identity';
  END IF;`
      : ''
  }
  IF NOT EXISTS (
    SELECT 1
    FROM ${entityTable}
    WHERE id = '00000000-0000-7000-8000-000000000011'
      AND votes_score_up = 0 AND votes_score_none = 0 AND votes_score_down = 0
      AND votes_count_up = 0 AND votes_count_none = 0 AND votes_count_down = 0
  ) THEN
    RAISE EXCEPTION '${table} cleared aggregate was not reconciled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM ${entityTable}
    WHERE id = '00000000-0000-7000-8000-000000000012'
      AND votes_score_up = 2 AND votes_score_none = 0 AND votes_score_down = 0
      AND votes_count_up = 1 AND votes_count_none = 0 AND votes_count_down = 0
  ) THEN
    RAISE EXCEPTION '${table} historic Vouch aggregate was not reconciled';
  END IF;
  IF (
    SELECT score FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000003'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000013'
    ORDER BY id DESC LIMIT 1
  ) <> -2 THEN
    RAISE EXCEPTION '${table} current historic Disavow was not repaired to its weight';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM ${entityTable}
    WHERE id = '00000000-0000-7000-8000-000000000013'
      AND votes_score_up = 0 AND votes_score_none = 0 AND votes_score_down = 2
      AND votes_count_up = 0 AND votes_count_none = 0 AND votes_count_down = 1
  ) THEN
    RAISE EXCEPTION '${table} historic Disavow aggregate was not reconciled';
  END IF;`,
    ).join('\n')
    const topicMetricAssertions = `
  IF NOT EXISTS (
    SELECT 1 FROM topic_metrics
    WHERE topic_id = '00000000-0000-7000-8000-000000000011'
      AND ratings__score__1 = 0 AND ratings__score__2 = 0 AND ratings__score__3 = 0
      AND ratings__score__4 = 0 AND ratings__score__5 = 0
      AND ratings__count__1 = 0 AND ratings__count__2 = 0 AND ratings__count__3 = 0
      AND ratings__count__4 = 0 AND ratings__count__5 = 0
  ) THEN
    RAISE EXCEPTION 'topic legacy Clear rating metrics were not reset';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM topic_metrics
    WHERE topic_id = '00000000-0000-7000-8000-000000000012'
      AND ratings__score__1 = 0 AND ratings__score__2 = 0 AND ratings__score__3 = 0
      AND ratings__score__4 = 0 AND ratings__score__5 = 1
      AND ratings__count__1 = 0 AND ratings__count__2 = 0 AND ratings__count__3 = 0
      AND ratings__count__4 = 0 AND ratings__count__5 = 0
  ) THEN
    RAISE EXCEPTION 'topic historic Vouch rating metrics were not recomputed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM topic_metrics
    WHERE topic_id = '00000000-0000-7000-8000-000000000013'
      AND ratings__score__1 = 1 AND ratings__score__2 = 0 AND ratings__score__3 = 0
      AND ratings__score__4 = 0 AND ratings__score__5 = 0
      AND ratings__count__1 = 0 AND ratings__count__2 = 0 AND ratings__count__3 = 0
      AND ratings__count__4 = 0 AND ratings__count__5 = 0
  ) THEN
    RAISE EXCEPTION 'topic historic Disavow rating metrics were not recomputed';
  END IF;`
    const deletedUserMetricAssertion = `
  IF NOT EXISTS (
    SELECT 1 FROM topic_metrics
    WHERE topic_id = '00000000-0000-7000-8000-000000000014'
      AND ratings__score__1 = 0 AND ratings__score__2 = 0 AND ratings__score__3 = 0
      AND ratings__score__4 = 0 AND ratings__score__5 = 0
      AND ratings__count__1 = 0 AND ratings__count__2 = 0 AND ratings__count__3 = 0
      AND ratings__count__4 = 0 AND ratings__count__5 = 0
  ) THEN
    RAISE EXCEPTION 'deleted voter contributed to rebuilt topic rating metrics';
  END IF;`
    const newNeutralRows = LEGACY_SENTIMENT_VOTE_TABLES.map(
      ([table, entityIdColumn]) => `
INSERT INTO ${table} (user_id, ${entityIdColumn}, score, score_is_neutral, score_is_semantic)
VALUES ('00000000-0000-7000-8000-000000000003', '00000000-0000-7000-8000-000000000013', 0, TRUE, TRUE);`,
    ).join('\n')
    const neutralAssertions = LEGACY_SENTIMENT_VOTE_TABLES.map(
      ([table, entityIdColumn]) => `
  IF (
    SELECT score FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000003'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000013'
    ORDER BY id DESC LIMIT 1
  ) <> 0 THEN
    RAISE EXCEPTION '${table} new Neutral vote was changed';
  END IF;
  IF NOT (
    SELECT score_is_neutral AND score_is_semantic FROM ${table}
    WHERE user_id = '00000000-0000-7000-8000-000000000003'
      AND ${entityIdColumn} = '00000000-0000-7000-8000-000000000013'
    ORDER BY id DESC LIMIT 1
  ) THEN
    RAISE EXCEPTION '${table} new Neutral provenance was changed';
  END IF;`,
    ).join('\n')

    const migrationSql = generateLegacySentimentZeroVoteRepairSql()
    const migrationClient = await writePool.connect()
    try {
      await runConfigDrivenStatementsInTransaction(
        `${setupTables}
CREATE TEMP TABLE election_vote_migration_claims (
  migration_id TEXT PRIMARY KEY,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) ON COMMIT DROP;
INSERT INTO users (id) VALUES
  ('00000000-0000-7000-8000-000000000001'),
  ('00000000-0000-7000-8000-000000000002'),
  ('00000000-0000-7000-8000-000000000003');
${legacyRows}
${postActivityPubLikeFixture}
${deletedVoterTopicFixture}
${migrationSql}
DO $$ BEGIN
${assertions}
${topicMetricAssertions}
${deletedUserMetricAssertion}
END $$;
${newNeutralRows}
${migrationSql}
DO $$ BEGIN
${neutralAssertions}
${topicMetricAssertions}
${deletedUserMetricAssertion}
END $$;`,
        (query, values) => write(query, values, { client: migrationClient }),
      )

      await expect(
        migrationClient.query('SELECT score_is_neutral, score_is_semantic FROM post_votes LIMIT 0'),
      ).resolves.toBeDefined()
    } finally {
      migrationClient.release()
    }
    expect(LEGACY_SENTIMENT_VOTE_TABLES).toHaveLength(5)
    expect(generateElectionSchema().indexOf(migrationSql)).toBeGreaterThan(
      generateElectionSchema().indexOf('CREATE TABLE IF NOT EXISTS user_vouch_votes'),
    )
  })
})
