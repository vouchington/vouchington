import { describe, expect, it } from 'vitest'

import {
  SYNCED_MODERATION_POLICY_MATRIX_DOC,
  setupRepoFilePolicyTest,
} from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  for (const lifecycleScenarioContract of ['missing', 'untracked'] as const) {
    it(`lets lifecycle-specific fixtures use an ${lifecycleScenarioContract} scenario contract`, async () => {
      const dir = await makeRepo({ lifecycleScenarioContract })

      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('lifecycle-scenarios.json: file must be tracked'),
      })
    })
  }

  it('rejects legacy reporting schema examples in docs', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-FLOWS.md',
      [
        '```sql',
        'CREATE TABLE moderation_reports (',
        '  id uuid DEFAULT gen_random_uuid(),',
        '  entity_type text NOT NULL,',
        '  entity_id uuid NOT NULL,',
        '  created_at timestamptz DEFAULT now(),',
        '  status text NOT NULL',
        ');',
        '```',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('legacy polymorphic entity_type/entity_id'),
    })
  })

  it(
    'rejects multiline legacy reporting schema examples in docs',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'docs/requirements/moderation/REPORTING.md',
        [
          '```sql',
          'CREATE TABLE moderation_reports (',
          '  created_at',
          '    timestamptz NOT NULL',
          '    DEFAULT now(),',
          '  status',
          '    moderation_report_status NOT NULL',
          ');',
          '```',
        ].join('\n'),
      )

      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('legacy mutable created_at DEFAULT now()'),
      })
    },
  )

  it('allows canonical reporting schema examples in docs', { timeout: 30_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/REPORTING.md',
      [
        '```sql',
        'CREATE TABLE moderation_reports (',
        '  id uuid PRIMARY KEY DEFAULT uuidv7(),',
        '  post_id uuid REFERENCES posts(id),',
        '  reported_user_id uuid REFERENCES users(id),',
        '  hostname_id uuid REFERENCES url_hostnames(id),',
        '  rss_feed_item_id uuid REFERENCES rss_feed_items(id),',
        "  reason text NOT NULL CHECK (reason IN ('spam','harassment','misinformation','illegal_content','vote_manipulation','other')),",
        '  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,',
        '  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1)',
        ');',
        '```',
        'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.',
      ].join('\n'),
    )
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC,
    )
    const syncedReportDoc =
      'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n'
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

  it('rejects moderation report docs missing current entity and reason constants', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC,
    )
    await track(
      dir,
      'docs/requirements/moderation/REPORTING.md',
      'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n',
    )
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-FLOWS.md',
      'Entities: rss_feed_item post comment user. Reasons: spam harassment misinformation illegal_content other.\n',
    )
    await track(
      dir,
      'backend/api/v1/reports/README.md',
      'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n',
    )
    await track(
      dir,
      'backend/services/moderation-reports/README.md',
      'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('url_hostname is missing from report docs'),
    })
  })
})
