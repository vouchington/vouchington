import { describe, expect, it } from 'vitest'

import {
  SYNCED_MODERATION_POLICY_MATRIX_DOC,
  setupRepoFilePolicyTest,
} from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackSyncedModerationDocs } = setupRepoFilePolicyTest()

  it('rejects stale moderation policy matrix all-entity shorthand', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(', `user`, `url_hostname`.', ', `user`.'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('policy matrix all entity type url_hostname is missing'),
    })
  })

  it('rejects stale moderation policy derived lists', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`',
        '`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`',
      ).replace('`accept`, `deny`, `reduce`', '`accept`, `deny`'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('derived moderation report reason other is missing'),
    })
  })

  it('ignores literal derived-lists prose before the policy table', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Policy Entries',
        '## Policy Entries\nThe phrase `## Derived Lists` appears here in prose and must not end the policy table section early.',
      ),
    })

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })

  it('ignores literal action-enums prose inside derived lists', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Derived Lists',
        '## Derived Lists\nThe phrase `## Action Enums` appears here in prose and must not end derived-list extraction early.',
      ),
    })

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })

  it('rejects duplicate moderation policy matrix rows', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Derived Lists',
        '\n| vote_manipulation | Vote manipulation |\n## Derived Lists',
      ),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringMatching(
        /moderation policy row vote_manipulation is missing or malformed[\s\S]*duplicate moderation policy row vote_manipulation is documented/,
      ),
    })
  })

  it('rejects stale complete moderation policy rows outside the parsed table', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Derived Lists',
        '\n| old_policy | Old policy | ✓ | ✓ | all | low | ✓ | remove |\n## Derived Lists',
      ),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('stale moderation policy key old_policy is documented'),
    })
  })

  it('rejects stale REPORTING schema examples', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      reporting: [
        'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
        'CREATE TABLE moderation_reports (',
        '  post_id uuid,',
        '  reported_user_id uuid,',
        '  hostname_id uuid,',
        "  reason text CHECK (reason IN ('spam','harassment','misinformation','illegal_content','vote_manipulation'))",
        ')',
        '## Review Queue',
      ].join('\n'),
    })

    let failure: unknown
    try {
      await run(dir)
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 1 })
    expect((failure as { stdout: string }).stdout).toContain(
      'REPORTING schema moderation report reason other is missing',
    )
  })

  it('rejects stale REPORTING schema values in later code blocks', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      reporting: [
        'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
        '```sql',
        'CREATE TABLE moderation_reports (',
        '  post_id uuid,',
        '  reported_user_id uuid,',
        '  hostname_id uuid,',
        '  rss_feed_item_id uuid,',
        "  reason text CHECK (reason IN ('spam','harassment','misinformation','illegal_content','vote_manipulation','other'))",
        ')',
        '```',
        '```sql',
        'CREATE TABLE moderation_reports (',
        "  reason text CHECK (reason IN ('bad_reason'))",
        ')',
        '```',
        '## Review Queue',
      ].join('\n'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'stale REPORTING schema moderation report reason bad_reason is documented',
      ),
    })
  })

  it('rejects stale first-column rows outside parsed moderation doc tables', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Runbooks',
        '\n| obsolete | Obsolete |\n## Runbooks',
      ),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('stale policy matrix severity obsolete is documented'),
    })
  })

  it('rejects stale API README canonical entity sentence values', async () => {
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
    await track(
      dir,
      'backend/api/v1/reports/README.md',
      [
        'Canonical `entityType` values are `rss_feed_item`, `post`, `comment`, `user`, `url_hostname`, and `old_entity`.',
        '## Endpoints',
        '  "entityType": "rss_feed_item" | "post" | "comment" | "user" | "url_hostname",',
        'Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
      ].join('\n'),
    )
    await track(dir, 'backend/services/moderation-reports/README.md', syncedReportDoc)
    await track(
      dir,
      'docs/requirements/moderation/REPORT-JUDGEMENTS.md',
      'Reason rank is `illegal_content` > `harassment` / `vote_manipulation` > `misinformation` > `spam` > `other`.\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'stale moderation report entity type old_entity is documented',
      ),
    })
  })

  it('rejects API README request and canonical entity lists independently', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      api: [
        'Canonical `entityType` values are `rss_feed_item`, `post`, `comment`, and `user`.',
        '## Endpoints',
        '  "entityType": "rss_feed_item" | "post" | "comment" | "user" | "url_hostname",',
        'Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
      ].join('\n'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'API canonical moderation report entity type url_hostname is missing',
      ),
    })
  })

  it('rejects stale ACTIONS report lists when ACTIONS.md is present', async () => {
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
        'Clicking any Report trigger opens `ReportDialog` with `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, and `other`. vote_manipulation is valid only for post reports.',
      ].join('\n'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'docs/requirements/navigation/ACTIONS.md: ACTIONS report table entity type url_hostname is missing',
      ),
    })
  })

  it('rejects malformed moderation service README table rows without crashing', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      service: [
        'Canonical entity types are `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`.',
        '## Data Model',
        '| Field | Type | Notes |',
        '| --- | --- | --- |',
        '| Target FK | uuid | Exactly one of `post_id`, `reported_user_id`, `hostname_id`, or `rss_feed_item_id` |',
        '| reason | text |',
        '## Usage',
      ].join('\n'),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('moderation report reason spam is missing'),
    })
  })
})
