import { describe, expect, it } from 'vitest'

import {
  SYNCED_MODERATION_POLICY_MATRIX_DOC,
  setupRepoFilePolicyTest,
} from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackSyncedModerationDocs } = setupRepoFilePolicyTest()

  it('rejects missing moderation policy sync docs when only some required docs exist', async () => {
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
    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'backend/services/moderation-reports/README.md: required moderation policy/report doc is missing',
      ),
    })
  })

  it('rejects deleting all moderation policy sync docs in a real repo', async () => {
    const dir = await makeRepo()
    await track(dir, 'ts-shared/utils/moderation-policy.mts', 'export {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md: required moderation policy/report doc is missing',
      ),
    })
  })

  it('rejects stale moderation report doc values and missing post-only wording', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '## Derived Lists',
        '| `old_policy` | Old policy |\n## Derived Lists',
      ),
    )
    const staleReportDoc =
      'Entities: rss_feed_item post comment user url_hostname old_entity. Reasons: spam harassment misinformation illegal_content vote_manipulation other bad_reason.\n'
    await track(dir, 'docs/requirements/moderation/REPORTING.md', staleReportDoc)
    await track(dir, 'docs/requirements/moderation/MODERATION-FLOWS.md', staleReportDoc)
    await track(dir, 'backend/api/v1/reports/README.md', staleReportDoc)
    await track(
      dir,
      'backend/services/moderation-reports/README.md',
      staleReportDoc.concat(
        '| Target FK | uuid | Exactly one of `post_id`, `reported_user_id`, or `rss_feed_item_id` |\n',
      ),
    )
    await track(
      dir,
      'docs/requirements/moderation/REPORT-JUDGEMENTS.md',
      'Reason rank is `illegal_content` > `harassment` / `vote_manipulation` > `misinformation` > `spam` > `other` > `bad_reason`.\n',
    )

    let failure: unknown
    try {
      await run(dir)
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 1 })
    expect((failure as { stdout: string }).stdout).toContain(
      'stale moderation policy key old_policy is documented',
    )
    expect((failure as { stdout: string }).stdout).toContain(
      'stale moderation report entity type old_entity is documented',
    )
    expect((failure as { stdout: string }).stdout).toContain(
      'stale moderation report reason bad_reason is documented',
    )
    expect((failure as { stdout: string }).stdout).toContain(
      'vote_manipulation must be documented as post-only',
    )
    expect((failure as { stdout: string }).stdout).toContain(
      'service README moderation report target FK hostname_id is missing',
    )
    expect((failure as { stdout: string }).stdout).toContain(
      'report judgement reason rank order must be illegal_content > harassment > vote_manipulation > misinformation > spam > other',
    )
  })

  it('rejects stale moderation policy matrix metadata cells', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '| vote_manipulation | Vote manipulation | ✓ | — | post | medium | ✓ | escalate |',
        '| vote_manipulation | Vote manipulation | ✓ | — | all | low | ✓ | no_action |',
      ),
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

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'moderation policy row vote_manipulation must be vote_manipulation | Vote manipulation | ✓ | — | post | medium | ✓ | escalate',
      ),
    })
  })

  it('rejects malformed moderation policy matrix rows', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md',
      SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '| vote_manipulation | Vote manipulation | ✓ | — | post | medium | ✓ | escalate |',
        '| vote_manipulation | Vote manipulation |',
      ),
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

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'moderation policy row vote_manipulation is missing or malformed',
      ),
    })
  })

  it('rejects invalid moderation policy matrix boolean cells', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, {
      policy: SYNCED_MODERATION_POLICY_MATRIX_DOC.replace(
        '| hate_speech | Hate speech | — | ✓ | all | high | ✓ | remove |',
        '| hate_speech | Hate speech | N/A | ✓ | all | high | ✓ | remove |',
      ),
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('moderation policy row hate_speech is missing or malformed'),
    })
  })
})
