import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { moderationAiConfig } from '@services/moderation-ai-config'
import { listModerationReports } from '../get.mts'
import { listClusteredModerationReports } from '../clustered.mts'
import { listRedactedModerationReports } from '../redaction.mts'

describe('automatic report judgement eligibility', () => {
  it('reports current community AI eligibility in both staff lists without exposing it to members', async () => {
    const owner = await createTestUser()
    const reporter = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const communityPostId = await insertTestPost({
      createdById: owner.id,
      communityId: community.id,
      title: `Community AI ${crypto.randomUUID()}`,
      slug: `community-ai-${crypto.randomUUID()}`,
      markdown: 'Community post',
    })
    const platformPostId = await insertTestPost({
      createdById: owner.id,
      title: `Platform AI ${crypto.randomUUID()}`,
      slug: `platform-ai-${crypto.randomUUID()}`,
      markdown: 'Platform post',
    })
    const communityReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: communityPostId,
      createdAt: new Date(Date.now() + 60_000),
    })
    const platformReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: platformPostId,
      createdAt: new Date(Date.now() + 60_000),
    })
    const listFlat = () => listModerationReports({ limit: 100, sort: 'created_at_desc' })
    const listClustered = () =>
      listClusteredModerationReports({
        limit: 100,
        sort: 'created_at_desc',
        cursorScope: crypto.randomUUID(),
      })
    const restore = overrideDynamicConfigFieldsForTest(moderationAiConfig, {
      community_judgement_enabled: false,
    })
    try {
      const flatDisabled = await listFlat()
      expect(flatDisabled.reports.find(report => report.id === communityReportId)).toMatchObject({
        automatic_judgement_enabled: false,
      })
      expect(flatDisabled.reports.find(report => report.id === platformReportId)).toMatchObject({
        automatic_judgement_enabled: true,
      })
      const clusteredDisabled = await listClustered()
      expect(
        clusteredDisabled.results
          .flatMap(cluster => cluster.reports)
          .find(report => report.id === communityReportId),
      ).toMatchObject({ automatic_judgement_enabled: false })

      const restoreEnabled = overrideDynamicConfigFieldsForTest(moderationAiConfig, {
        community_judgement_enabled: true,
      })
      try {
        const flatEnabled = await listFlat()
        expect(flatEnabled.reports.find(report => report.id === communityReportId)).toMatchObject({
          automatic_judgement_enabled: true,
        })
        const clusteredEnabled = await listClustered()
        expect(
          clusteredEnabled.results
            .flatMap(cluster => cluster.reports)
            .find(report => report.id === communityReportId),
        ).toMatchObject({ automatic_judgement_enabled: true })

        const redacted = await listRedactedModerationReports({
          limit: 100,
          sort: 'created_at_desc',
        })
        expect(redacted.reports.find(report => report.id === communityReportId)).not.toHaveProperty(
          'automatic_judgement_enabled',
        )
      } finally {
        restoreEnabled()
      }
    } finally {
      restore()
    }
  })
})
