import { describe, expect, it } from 'vitest'

import { renderPartitionInventory } from '../partition-inventory-doc.mts'

import {
  SYNCED_MODERATION_POLICY_MATRIX_DOC,
  setupRepoFilePolicyTest,
} from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackSyncedModerationDocs } = setupRepoFilePolicyTest()

  it('allows real-shaped moderation report documentation lists', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC,
    )
    await track(
      dir,
      'docs/requirements/moderation/REPORTING.md',
      [
        '## Reportable entities',
        '| Entity type | Example surface |',
        '| --- | --- |',
        '| `rss_feed_item` | News |',
        '| `post` | Post |',
        '| `comment` | Comment |',
        '| `user` | User |',
        '| `url_hostname` | Domain |',
        '## Report reasons',
        '| Value | Label |',
        '| --- | --- |',
        '| `spam` | Spam |',
        '| `harassment` | Harassment |',
        '| `misinformation` | Misinformation |',
        '| `illegal_content` | Illegal content |',
        "| `vote_manipulation` | Vote manipulation — only valid when `entity_type = 'post'` |",
        '| `other` | Other |',
        '### Adding a report reason',
      ].join('\n'),
    )
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-FLOWS.md',
      [
        '**Reportable entities:** `rss_feed_item`, `post`, `comment`, `user`, `url_hostname`',
        "**Reasons:** `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`. `vote_manipulation` is valid only when `entityType = 'post'`.",
        '**Flow:**',
      ].join('\n'),
    )
    await track(
      dir,
      'backend/api/v1/reports/README.md',
      [
        'Canonical `entityType` values are `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`.',
        '## Endpoints',
        '```json',
        '{',
        '  "entityType": "rss_feed_item" | "post" | "comment" | "user" | "url_hostname",',
        '  "reason": "spam" | "harassment" | "misinformation" | "illegal_content" | "vote_manipulation" | "other"',
        '}',
        '```',
        '`vote_manipulation` is valid only when `entityType` is `post`.',
      ].join('\n'),
    )
    await track(
      dir,
      'backend/services/moderation-reports/README.md',
      [
        'Canonical entity types are `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`.',
        '## Data Model',
        '| Column | Type | Notes |',
        '| --- | --- | --- |',
        '| Target FK | uuid | Exactly one of `post_id`, `reported_user_id`, `hostname_id`, or `rss_feed_item_id` |',
        '| `reason` | text | One of `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other` |',
        '`vote_manipulation` is valid only for `post` reports.',
      ].join('\n'),
    )
    await track(
      dir,
      'docs/requirements/moderation/REPORT-JUDGEMENTS.md',
      'Reason rank is `illegal_content` > `harassment` / `vote_manipulation` > `misinformation` > `spam` > `other`.\nIf the latest judgement changes, refresh it.\n',
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: 'All checks passed.',
    })
  })

  it('allows moderation report docs synced with current policy constants', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC,
    )
    const syncedReportDoc =
      'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n'
    await track(dir, 'docs/requirements/moderation/REPORTING.md', syncedReportDoc)
    await track(dir, 'docs/requirements/moderation/MODERATION-FLOWS.md', syncedReportDoc)
    await track(dir, 'backend/api/v1/reports/README.md', syncedReportDoc)
    await track(dir, 'backend/services/moderation-reports/README.md', syncedReportDoc)
    await track(
      dir,
      'docs/requirements/moderation/REPORT-JUDGEMENTS.md',
      'Reason rank is `illegal_content` > `harassment` / `vote_manipulation` > `misinformation` > `spam` > `other`.\n',
    )

    await expect(run(dir)).resolves.toMatchObject({
      stdout: 'All checks passed.',
    })
  })

  it('rejects stale repeated policy matrix all-entity prose', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Derived Lists',
        '"all" means all `MODERATION_REPORT_ENTITY_TYPES`: `old_entity`.\n## Derived Lists',
      ),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'stale policy matrix all entity type old_entity is documented',
      ),
    })
  })

  it('rejects stale moderation policy derived-list prose after canonical bullets', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '- **AI content-policy categories (List B)**',
        '`old_reason` remains invalid.\n- **AI content-policy categories (List B)**',
      ).replace('## Action Enums', '`old_category` remains invalid.\n## Action Enums'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringMatching(
        /stale derived moderation report reason old_reason is documented[\s\S]*stale derived moderation AI category old_category is documented/,
      ),
    })
  })

  it('allows synced unfenced REPORTING schema examples', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      reporting: [
        'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
        'CREATE TABLE moderation_reports (',
        '  post_id uuid,',
        '  reported_user_id uuid,',
        '  hostname_id uuid,',
        '  rss_feed_item_id uuid,',
        "  reason text CHECK (reason IN ('spam','harassment','misinformation','illegal_content','vote_manipulation','other'))",
        ')',
        '## Review Queue',
      ].join('\n'),
    })

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })

  it('rejects stale ACTIONS report rows after the first parsed table', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      actions: [
        '### Report',
        'The Report action is available on `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`.',
        '| Action | Surface |',
        '| --- | --- |',
        '| Report (rss_feed_item) | Feed item |',
        '| Report (post) | Post |',
        '| Report (comment) | Comment |',
        '| Report (user) | User |',
        '| Report (url_hostname) | Domain |',
        '',
        '| Report (old_entity) | Old |',
        'Clicking any Report trigger opens `ReportDialog` with `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, and `other`. vote_manipulation is valid only for post reports.',
      ].join('\n'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'stale ACTIONS report table entity type old_entity is documented',
      ),
    })
  })

  it('rejects stale RSS feed item partition comments', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/services/rss-feed-items/get.mts',
      '// Queries across all 8 hash partitions via idx_rss_feed_items__id index.\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('rss_feed_items is not hash-partitioned'),
    })
  })

  it(
    'rejects partition docs missing migration-defined partitioned tables',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/migrations/9999-partitions.sql',
        [
          'CREATE TABLE IF NOT EXISTS audit_events (',
          '  id uuid PRIMARY KEY DEFAULT uuidv7()',
          ') PARTITION BY RANGE (id);',
        ].join('\n'),
      )
      const noAudit = 'No audit inventory.\n'
      await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', noAudit)
      await track(dir, 'docs/overview/architecture/partitioning-strategy.md', noAudit)

      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('partitioned table audit_events is missing'),
      })
    },
  )

  it(
    'allows partition docs listing migration-defined partitioned tables',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/migrations/9999-partitions.sql',
        [
          'CREATE TABLE IF NOT EXISTS audit_events (',
          '  id uuid PRIMARY KEY DEFAULT uuidv7()',
          ') PARTITION BY RANGE (id);',
        ].join('\n'),
      )
      await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', '`audit_events`\n')
      await track(
        dir,
        'docs/overview/architecture/partitioning-strategy.md',
        `\`audit_events\`\n${renderPartitionInventory(['audit_events'])}\n`,
      )

      await expect(run(dir)).resolves.toMatchObject({
        stdout: 'All checks passed.',
      })
    },
  )

  it('rejects HASH partition declarations', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/9999-partitions.sql',
      'CREATE TABLE audit_events (id UUID DEFAULT uuidv7()) PARTITION BY HASH (id);',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('HASH partitioning is not allowed'),
    })
  })

  it('rejects stale partition strategy inventory rows', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/9999-partitions.sql',
      'CREATE TABLE audit_events (id UUID DEFAULT uuidv7()) PARTITION BY RANGE (id);',
    )
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        '<!-- schema-growth-registry:start -->',
        '| `old_events` | RANGE |',
        '<!-- schema-growth-registry:end -->',
      ].join('\n'),
    )
    await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', '`audit_events`\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('generated schema-growth inventory is stale'),
    })
  })
})
