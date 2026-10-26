import assert from 'node:assert/strict'
import {
  listLiveScopePostPage,
  type LiveScopePostKind,
} from '@services/post-publication/live-scope-post-pages'
import {
  FIRST_CATEGORY_OWNER_CURSOR,
  listLiveTopicMergeCategoryOwnersPage,
} from '@services/post-publication/live-topic-merge-category-pages'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import { listLiveTopicMergedSourcesPage } from '@services/post-publication/live-topic-merged-source-pages'
import { write, refreshMaterializedView } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  PUBLICATION_SCOPE_SEED as seed,
  seedPublicationScopePages,
} from '../seed-data/publication-scope-pages.mts'
import { cleanupPublicationScopePages } from '../seed-data/publication-scope-cleanup.mts'
import { preparePublicationScopePlans } from '../seed-data/publication-scope-maintenance.mts'
import { runAnalyze } from '../seed-data/maintenance.mts'
import { refreshExplainMaterializedViews } from '../seed-data/materialized-view-maintenance.mts'

export async function runPublicationScopePageScenarios(): Promise<void> {
  try {
    await cleanupPublicationScopePages()
    await seedPublicationScopePages()
    await preparePublicationScopePlans()
    await capturePublicationScopePages()
  } finally {
    await cleanupPublicationScopePages()
    await runAnalyze()
    await refreshExplainMaterializedViews(refreshMaterializedView, statement => write(statement))
  }
}

async function capturePublicationScopePages(): Promise<void> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const scopes: Array<[string, LiveScopePostKind, string, string, string]> = [
    ['author', 'author_posts', seed.author, 'posts', 'posts__default_created_by_id_id_idx'],
    ['community', 'community_posts', seed.community, 'posts', 'posts__default_community_id_id_idx'],
    ['descendant', 'post_descendants', seed.root, 'posts', 'posts__default_parent_post_id_id_idx'],
    [
      'alias-relations',
      'alias_post_relations',
      seed.alias,
      'relation__post__category__topic_alias',
      'relation__post__category__topic_alias__object_id_subject_id_idx',
    ],
    [
      'alias-sources',
      'alias_post_sources',
      seed.alias,
      'post_topic_alias_sources',
      'idx_post_topic_alias_sources__topic_alias_id',
    ],
  ]
  for (const [name, kind, subject, relation, index] of scopes) {
    const id = `publication-${name}-page`
    registerScenarioContract(id, {
      seededRows: {
        [relation]:
          kind === 'alias_post_sources'
            ? seed.count * 6
            : kind === 'alias_post_relations'
              ? seed.count * 2
              : seed.count,
      },
      expectations: [
        { kind: 'maxProcessedRows', relation, max: limit },
        { kind: 'usesIndexes', indexes: [index], noSort: true },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed scenario cases need separate captures and owning plan contracts, as in the existing EXPLAIN harness.
    await runAndCapture(id, async () => {
      const page = await listLiveScopePostPage(kind, subject, null)
      if (kind === 'alias_post_relations') assert.equal(page.ids.length, 0)
      assert.ok(
        page.cursor,
        'Hot owner requires continuation, including an all-inactive relation page',
      )
    })
  }
  registerScenarioContract('publication-merged-topic-sources-page', {
    seededRows: { topics: seed.count },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topics', max: limit },
      { kind: 'usesIndexes', indexes: ['idx_topics__merged_into_topic_id'], noSort: true },
    ],
  })
  await runAndCapture('publication-merged-topic-sources-page', async () => {
    const page = await listLiveTopicMergedSourcesPage(seed.topic, null)
    assert.equal(page.ids.length, limit)
    assert.ok(page.cursor)
  })
  for (const kind of ['feed', 'item'] as const) {
    const relation = kind === 'feed' ? 'rss_feed_categories' : 'rss_feed_item_categories'
    const index =
      kind === 'feed'
        ? 'idx_rss_feed_categories__topic_id'
        : 'idx_rss_feed_item_categories__topic_id'
    const id = `publication-merge-${kind}-categories-page`
    registerScenarioContract(id, {
      seededRows: { [relation]: seed.count * 2 },
      expectations: [
        { kind: 'maxProcessedRows', relation, max: limit },
        {
          kind: 'usesIndexes',
          indexes: [index],
          queryContains:
            kind === 'feed'
              ? 'listLiveTopicMergeFeedCategoryOwnersPage'
              : 'listLiveTopicMergeItemCategoryOwnersPage',
          noSort: true,
        },
        ...(kind === 'feed'
          ? [{ kind: 'maxProcessedRows' as const, relation: 'rss_feeds', max: limit }]
          : []),
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed owner kinds require separate raw-category captures and plan gates.
    await runAndCapture(id, async () => {
      const page = await listLiveTopicMergeCategoryOwnersPage(
        kind,
        seed.topic,
        FIRST_CATEGORY_OWNER_CURSOR,
      )
      assert.equal(page.ids.length, 1, 'The first page contains duplicates of one owner')
      assert.ok(page.cursor, 'Duplicate owners cannot imply end of raw input')
    })
  }
}
