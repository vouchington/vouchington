import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { NOTIFICATION_VISIBILITY_SEED as s } from '../seed-data/notification-visibility.mts'

// A real high-key continuation cohort stays above unrelated shared-test subscribers.
const cursorUserId = '01ff0000-fd00-7000-8000-000000000000'
const recipientId = '01ff0000-fe00-7000-8000-000000000000'
const setupName = 'createNotificationReconcileTempTables'

/** Capture the real INSERTs against the two session-local recipient tables. */
export async function runNotificationPopulationScenarios(): Promise<void> {
  await cleanupRecipient()
  try {
    await seedRecipient()
    registerScenarioContract('notification-post-recipient-population', {
      allowEmptyResult: true, // INSERT without RETURNING has zero root Actual Rows.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'relation__user__subscribe__user', max: 4 },
        { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 4 },
        { kind: 'maxProcessedRows', relation: 'relation__user__subscribe_posts__topic', max: 4 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 20 },
        { kind: 'maxProcessedRows', relation: 'users', max: 5 },
      ],
    })
    await runAndCapture(
      'notification-post-recipient-population',
      async () => {
        const result = await reconcileNotificationsForPost(s.posts[0]!, {
          afterUserId: cursorUserId,
          pageSize: 1,
          batchSize: 1,
        })
        assert.equal(result.created, 1)
      },
      undefined,
      'populatePostNotificationRecipients',
      {
        captureRawPoolQueryNames: [setupName, 'populatePostNotificationRecipients'],
        setupQueryNames: [setupName],
        expectedSetupQueryCount: 2,
      },
    )

    registerScenarioContract('notification-rss-recipient-population', {
      allowEmptyResult: true, // INSERT without RETURNING has zero root Actual Rows.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'relation__user__subscribe__rss_feed', max: 4 },
        { kind: 'maxProcessedRows', relation: 'relation__rss_feed_item__category__topic', max: 4 },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__user__subscribe_rss_feed_items__topic',
          max: 4,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 4 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 20 },
        { kind: 'maxProcessedRows', relation: 'users', max: 5 },
      ],
    })
    await runAndCapture(
      'notification-rss-recipient-population',
      async () => {
        const result = await reconcileNotificationsForRssFeedItem(s.items[0]!, {
          afterUserId: cursorUserId,
          pageSize: 1,
          batchSize: 1,
        })
        assert.equal(result.created, 1)
      },
      undefined,
      'populateRssFeedItemNotificationRecipients',
      {
        captureRawPoolQueryNames: [setupName, 'populateRssFeedItemNotificationRecipients'],
        setupQueryNames: [setupName],
        expectedSetupQueryCount: 2,
      },
    )
  } finally {
    await cleanupRecipient()
  }
}

async function seedRecipient(): Promise<void> {
  await write(
    `/* seedNotificationPopulation:users */ INSERT INTO users (id, username)
      VALUES ($1, 'seed-notification-population-cursor'),
        ($2, 'seed-notification-population-recipient')`,
    [cursorUserId, recipientId],
  )
  await write(
    `/* seedNotificationPopulation:postSubscription */
      INSERT INTO relation__user__subscribe__user (subject_id, object_id, created_at)
      VALUES ($1, $2, TIMESTAMPTZ '2020-01-01')`,
    [recipientId, s.user],
  )
  await write(
    `/* seedNotificationPopulation:rssSubscription */
      INSERT INTO relation__user__subscribe__rss_feed (subject_id, object_id, created_at)
      VALUES ($1, $2, TIMESTAMPTZ '2020-01-01')`,
    [recipientId, s.feed],
  )
  await write(
    `/* seedNotificationPopulation:postTopic */
      INSERT INTO relation__post__category__topic
        (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
      VALUES ($1, $2, $3, 1, 1)`,
    [s.posts[0], s.topic, s.user],
  )
  await write(
    `/* seedNotificationPopulation:itemTopic */
      INSERT INTO relation__rss_feed_item__category__topic
        (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
      VALUES ($1, $2, $3, 1, 1)`,
    [s.items[0], s.topic, s.user],
  )
  await write(
    `/* seedNotificationPopulation:postTopicSubscription */
      INSERT INTO relation__user__subscribe_posts__topic (subject_id, object_id, created_at)
      VALUES ($1, $2, TIMESTAMPTZ '2020-01-01')`,
    [recipientId, s.topic],
  )
  await write(
    `/* seedNotificationPopulation:itemTopicSubscription */
      INSERT INTO relation__user__subscribe_rss_feed_items__topic (subject_id, object_id, created_at)
      VALUES ($1, $2, TIMESTAMPTZ '2020-01-01')`,
    [recipientId, s.topic],
  )
}

async function cleanupRecipient(): Promise<void> {
  await write(
    '/* cleanupNotificationPopulation:notifications */ DELETE FROM notifications WHERE user_id = $1',
    [recipientId],
  )
  await write(
    '/* cleanupNotificationPopulation:postSubscription */ DELETE FROM relation__user__subscribe__user WHERE subject_id = $1 AND object_id = $2',
    [recipientId, s.user],
  )
  await write(
    '/* cleanupNotificationPopulation:rssSubscription */ DELETE FROM relation__user__subscribe__rss_feed WHERE subject_id = $1 AND object_id = $2',
    [recipientId, s.feed],
  )
  await write(
    '/* cleanupNotificationPopulation:postTopicSubscription */ DELETE FROM relation__user__subscribe_posts__topic WHERE subject_id = $1 AND object_id = $2',
    [recipientId, s.topic],
  )
  await write(
    '/* cleanupNotificationPopulation:itemTopicSubscription */ DELETE FROM relation__user__subscribe_rss_feed_items__topic WHERE subject_id = $1 AND object_id = $2',
    [recipientId, s.topic],
  )
  await write(
    '/* cleanupNotificationPopulation:postTopic */ DELETE FROM relation__post__category__topic WHERE subject_id = $1 AND object_id = $2',
    [s.posts[0], s.topic],
  )
  await write(
    '/* cleanupNotificationPopulation:itemTopic */ DELETE FROM relation__rss_feed_item__category__topic WHERE subject_id = $1 AND object_id = $2',
    [s.items[0], s.topic],
  )
  await write(
    '/* cleanupNotificationPopulation:users */ DELETE FROM users WHERE id = ANY($1::uuid[])',
    [[cursorUserId, recipientId]],
  )
  await write(
    '/* cleanupNotificationPopulation:identities */ DELETE FROM retained_user_identities WHERE id = ANY($1::uuid[])',
    [[cursorUserId, recipientId]],
  )
}
