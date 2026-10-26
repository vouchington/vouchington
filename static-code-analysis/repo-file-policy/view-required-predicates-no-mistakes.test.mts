import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  rule: string
  scope: string
  severity: string
  options: {
    importSpecifier: string
    executorFactoryNames: string[]
    executorTypeNames: string[]
    include: string[]
    exclude: string[]
    unanalyzableSql: string
    relations?: { table: string; requireColumns: string[] }[]
  }
}
type ViewRule = Rule & {
  options: Rule['options'] & { relations: NonNullable<Rule['options']['relations']> }
}

describe('view lookup predicate configuration', () => {
  it('keeps the view keys configured for production queries at error severity', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rule = config.rules.find(
      (rule): rule is ViewRule =>
        rule.rule === 'postgres-required-predicates' &&
        (rule.options.relations?.some(
          relation => relation.table === 'view_publicly_projected_image_placements',
        ) ??
          false),
    )
    if (!rule) throw new Error('view lookup predicate rule is missing')

    expect(rule).toMatchObject({
      rule: 'postgres-required-predicates',
      scope: 'repository',
      severity: 'error',
      options: {
        importSpecifier: '@data-stores/psql',
        executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
        executorTypeNames: ['TransactionQuery', 'QueryExecutor', 'OwnedTransaction'],
        include: ['backend/**/*.{ts,mts,js}'],
        exclude: ['**/*.test.*', '**/__tests__/**', '**/test-helpers/**', 'backend/scripts/**'],
        unanalyzableSql: 'ignore',
      },
    })
    expect(rule.options.relations).toEqual([
      { table: 'view_community_list_items', requireColumns: ['community_id'] },
      { table: 'view_community_metrics', requireColumns: ['id'] },
      { table: 'view_current_paid_memberships', requireColumns: ['membership_id'] },
      { table: 'view_embedded_topics', requireColumns: ['id'] },
      { table: 'view_embedded_users', requireColumns: ['id'] },
      {
        table: 'view_media_delivery_registry_current_records',
        requireColumns: ['media_delivery_registry_record_id'],
      },
      { table: 'view_memberships', requireColumns: ['id'] },
      { table: 'view_oauth_authorization_current_records', requireColumns: ['id'] },
      { table: 'view_post_clearance_status', requireColumns: ['post_id'] },
      { table: 'view_posts', requireColumns: ['id'] },
      { table: 'view_public_post_eligibility', requireColumns: ['post_id'] },
      {
        table: 'view_publicly_projected_image_placements',
        requireColumns: ['placement_id', 'placement_revision', 'image_id'],
      },
      { table: 'view_rss_feed_current_states', requireColumns: ['rss_feed_id'] },
      { table: 'view_rss_feed_items', requireColumns: ['id'] },
      { table: 'view_rss_feeds', requireColumns: ['id'] },
      { table: 'view_topic_metrics', requireColumns: ['id'] },
      { table: 'view_topics', requireColumns: ['id'] },
      { table: 'view_url_hostnames', requireColumns: ['id'] },
      { table: 'view_urls', requireColumns: ['id'] },
      { table: 'view_user_list_items', requireColumns: ['list_id'] },
      { table: 'view_user_metrics', requireColumns: ['id'] },
      { table: 'view_users_private', requireColumns: ['id'] },
      { table: 'view_users_public', requireColumns: ['id'] },
    ])
  })
})
