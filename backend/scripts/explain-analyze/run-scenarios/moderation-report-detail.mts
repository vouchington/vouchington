import assert from 'node:assert/strict'
import { getModerationReportDetail } from '@services/moderation-reports/detail'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanupModerationReportDetailFixture,
  DETAIL_HISTORY_PER_KIND,
  seedModerationReportDetailFixture,
} from '../seed-data/moderation-report-detail.mts'

const JUDGEMENT_INDEX_BY_KIND = {
  post: 'idx_moderation_report_judgements__post_id',
  user: 'idx_moderation_report_judgements__user_id',
  url_hostname: 'idx_moderation_report_judgements__hostname_id',
  rss_feed_item: 'idx_moderation_report_judgements__rss_id',
} as const

const TARGET_RELATIONS = ['posts', 'users', 'url_hostnames', 'rss_feed_items'] as const

/** One report PK probe plus one latest judgement index probe, even with dense history. */
export async function runModerationReportDetailScenarios(): Promise<void> {
  const fixture = await seedModerationReportDetailFixture()
  try {
    for (const target of fixture.cases) {
      const reportId = `moderation-report-detail-${target.entityType}-report`
      registerScenarioContract(reportId, {
        seededRows: { moderation_report_judgements: DETAIL_HISTORY_PER_KIND * 4 },
        expectations: [
          { kind: 'usesIndexes', indexes: ['moderation_reports_pkey'], noSort: true },
          { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
          ...TARGET_RELATIONS.map(relation => ({
            kind: 'maxProcessedRows' as const,
            relation,
            max: 1,
          })),
        ],
        forbidSequentialScans: ['moderation_reports'],
      })
      // no-mistakes-disable-next-line query-reached-per-item: four fixed FK kinds each need their real keyed report probe.
      await runAndCapture(
        reportId,
        async () => {
          const detail = await getModerationReportDetail(target.reportId)
          assert(detail)
          assert.equal(detail.report.id, target.reportId)
          assert.equal(detail.report.entity_id, target.entityId)
          assert.ok(detail.judgement?.id)
        },
        undefined,
        'getModerationReportDetail:report',
      )

      const judgementId = `moderation-report-detail-${target.entityType}-judgement`
      registerScenarioContract(judgementId, {
        seededRows: { moderation_report_judgements: DETAIL_HISTORY_PER_KIND * 4 },
        expectations: [
          {
            kind: 'usesIndexes',
            indexes: [JUDGEMENT_INDEX_BY_KIND[target.entityType]],
            noSort: true,
          },
          { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: 1 },
        ],
        forbidSequentialScans: ['moderation_report_judgements'],
      })
      // no-mistakes-disable-next-line query-reached-per-item: four fixed FK kinds each need their actual latest-judgement probe.
      await runAndCapture(
        judgementId,
        async () => {
          const detail = await getModerationReportDetail(target.reportId)
          assert.ok(detail?.judgement?.id)
        },
        undefined,
        'getModerationReportDetail:judgement',
      )
    }

    registerScenarioContract('moderation-report-detail-missing-report', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'usesIndexes', indexes: ['moderation_reports_pkey'], noSort: true },
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
      ],
      forbidSequentialScans: ['moderation_reports'],
    })
    await runAndCapture(
      'moderation-report-detail-missing-report',
      async () => {
        assert.equal(await getModerationReportDetail('019e0000-ffff-7000-8000-000000000001'), null)
      },
      undefined,
      'getModerationReportDetail:report',
    )

    registerScenarioContract('moderation-report-detail-no-judgement', {
      allowEmptyResult: true,
      seededRows: { moderation_report_judgements: DETAIL_HISTORY_PER_KIND * 4 },
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [JUDGEMENT_INDEX_BY_KIND.post],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: 1 },
      ],
      forbidSequentialScans: ['moderation_report_judgements'],
    })
    await runAndCapture(
      'moderation-report-detail-no-judgement',
      async () => {
        const detail = await getModerationReportDetail(fixture.noJudgementCase.reportId)
        assert(detail)
        assert.equal(detail.report.id, fixture.noJudgementCase.reportId)
        assert.equal(detail.judgement, null)
      },
      undefined,
      'getModerationReportDetail:judgement',
    )
  } finally {
    await cleanupModerationReportDetailFixture(fixture.insertedJudgementIds)
  }
}
