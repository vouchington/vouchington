/**
 * seed-source — deterministic QA source seeder
 *
 * Inserts a test RSS source + topic into the local database without needing
 * live crawl workers or network access. Unblocks the S2 "source submit"
 * QA gap that the live crawl/DNS path can't exercise.
 *
 * Idempotent: re-running finds the existing fixture and reports it instead
 * of creating a duplicate. Uses a stable slug (`qa-seed-source`) so the row
 * survives across dev-session restarts (DB persists; Valkey can be flushed).
 *
 * After running, the seeded source appears at /sources on the local stack.
 *
 * Usage:
 *   node backend/scripts/seed-source/run.mts
 *   pnpm run seed-source
 *
 * Local development only — refused on staging/production.
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { getTopicBySlug } from '@services/topics/get'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'
import {
  ensureTestRssFeedEnabled,
  insertTestRssFeed,
} from '@voucha/test-helpers/entities/rss-feeds'
import { normalizeKey } from '@ts-shared/utils/strings'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB_PROTOCOL =
  existsSync(resolve(REPO_ROOT, 'dev/certs/localhost.pem')) &&
  existsSync(resolve(REPO_ROOT, 'dev/certs/localhost-key.pem'))
    ? 'https'
    : 'http'

const QA_SEED_SLUG = 'qa-seed-source'
const QA_SEED_TITLE = 'QA Seeded Source'

/** Refuse to run in staging or production; exits process on violation. */
function assertDevOnly(env: string | undefined): void {
  if (env === 'production' || env === 'staging') {
    console.error(`seed-source must not run in ${env}.`)
    process.exit(1)
  }
}

async function main() {
  assertDevOnly(process.env['NODE_ENV'])

  const workerPort = process.env['WORKER_PORT']
  if (!workerPort) throw new Error('WORKER_PORT is not set — run: source .env')

  // Idempotency: reuse the existing fixture if it already exists.
  const existingTopic = await getTopicBySlug(QA_SEED_SLUG)
  if (existingTopic) {
    // Ensure the topic is findable via the entity cache bloom filter even if it was created
    // via createTestTopic (which bypasses finalizeCreatedTopic and the bloom update).
    await entityCacheBloomFilters.topics.add([
      normalizeKey(existingTopic.id),
      normalizeKey(existingTopic.slug),
    ])
    const existingFeed = await getRssFeedByTopicId(existingTopic.id)
    if (existingFeed) {
      // Re-enable in case an admin or settings test disabled the feed; idempotent.
      await ensureTestRssFeedEnabled(existingFeed.id)
      console.log(`QA source already seeded (existing fixture):`)
      console.log(`  Feed ID:  ${existingFeed.id}`)
      console.log(`  Topic:    ${existingTopic.name} (id: ${existingTopic.id})`)
      console.log()
      console.log(`Browse at: ${WEB_PROTOCOL}://localhost:${workerPort}/sources`)
      return
    }
    // Topic exists but feed is missing (e.g. interrupted first run or admin deleted it).
    console.log('QA topic exists but RSS feed is missing — recreating feed...')
    const recoveredFeedId = await insertTestRssFeed({
      topicId: existingTopic.id,
      title: QA_SEED_TITLE,
    })
    console.log(`Recovered RSS feed:`)
    console.log(`  Feed ID:  ${recoveredFeedId}`)
    console.log(`  Topic:    ${existingTopic.name} (id: ${existingTopic.id})`)
    console.log()
    console.log(`Browse at: ${WEB_PROTOCOL}://localhost:${workerPort}/sources`)
    return
  }

  console.log('Seeding QA source...')
  const topic = await createTestTopic({
    topic_type: 'rss_feed',
    slug: QA_SEED_SLUG,
    name: QA_SEED_TITLE,
  })
  // createTestTopic bypasses finalizeCreatedTopic, so populate the bloom filter manually.
  void entityCacheBloomFilters.topics.add([normalizeKey(topic.id), normalizeKey(topic.slug)])
  const feedId = await insertTestRssFeed({
    topicId: topic.id,
    title: QA_SEED_TITLE,
  })

  console.log(`Created RSS feed:`)
  console.log(`  Feed ID:  ${feedId}`)
  console.log(`  Topic:    ${topic.name} (id: ${topic.id})`)
  console.log()
  console.log(`Browse at: ${WEB_PROTOCOL}://localhost:${workerPort}/sources`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void gracefulShutdown()
      .catch(console.error)
      .then(() => {
        setTimeout(() => process.exit(process.exitCode ?? 0), 250).unref()
      })
  })
