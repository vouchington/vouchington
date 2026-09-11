import { SYNCED_MODERATION_POLICY_MATRIX_DOC } from './repo-file-policy-test-sources.mts'

export type ModerationDocsOverrides = Partial<
  Record<'policy' | 'reporting' | 'flows' | 'api' | 'service' | 'actions' | 'judgements', string>
>

type TrackFixture = (repoRoot: string, path: string, content: string) => Promise<void>

const SYNCED_MODERATION_REPORT_DOC =
  'Entities: rss_feed_item post comment user url_hostname. Reasons: spam harassment misinformation illegal_content vote_manipulation other.\nvote_manipulation is valid only for post reports.\n'
const SYNCED_MODERATION_JUDGEMENT_DOC =
  'Reason rank is `illegal_content` > `harassment` / `vote_manipulation` > `misinformation` > `spam` > `other`.\n'

export async function trackModerationDocs(
  repoRoot: string,
  track: TrackFixture,
  overrides: ModerationDocsOverrides = {},
): Promise<void> {
  const docs = {
    'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md':
      overrides.policy ?? SYNCED_MODERATION_POLICY_MATRIX_DOC,
    'docs/requirements/moderation/REPORTING.md':
      overrides.reporting ?? SYNCED_MODERATION_REPORT_DOC,
    'docs/requirements/moderation/MODERATION-FLOWS.md':
      overrides.flows ?? SYNCED_MODERATION_REPORT_DOC,
    'backend/api/v1/reports/README.md': overrides.api ?? SYNCED_MODERATION_REPORT_DOC,
    'backend/services/moderation-reports/README.md':
      overrides.service ?? SYNCED_MODERATION_REPORT_DOC,
    'docs/requirements/navigation/ACTIONS.md': overrides.actions,
    'docs/requirements/moderation/REPORT-JUDGEMENTS.md':
      overrides.judgements ?? SYNCED_MODERATION_JUDGEMENT_DOC,
  }
  for (const [docPath, content] of Object.entries(docs)) {
    if (content !== undefined) await track(repoRoot, docPath, content)
  }
}
