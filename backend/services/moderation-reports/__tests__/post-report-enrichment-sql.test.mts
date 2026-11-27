import { describe, expect, it } from 'vitest'
import { postReportEnrichmentJoinsSql } from '../post-report-enrichment-sql.mts'

describe('postReportEnrichmentJoinsSql', () => {
  it('counts distinct reporters on post_id only for pending queue reports', () => {
    const query = postReportEnrichmentJoinsSql({
      status: 'pending',
      countMode: 'distinct_reporters',
    })

    expect(query.text).toContain('COUNT(DISTINCT rc.reporter_user_id)::integer AS report_count')
    expect(query.text).toContain('WHERE rc.post_id = r.post_id')
    expect(query.text).toContain('AND rc.reviewed_at IS NULL')
    expect(query.text).toContain('WHERE mj.post_id = r.post_id')
    expect(query.text).not.toContain('reported_user_id')
    expect(query.text).not.toContain('hostname_id')
    expect(query.text).not.toContain('rss_feed_item_id')
    expect(query.values).toEqual([])
  })

  it('counts pending rows directly when countMode is rows', () => {
    const query = postReportEnrichmentJoinsSql({ status: 'pending', countMode: 'rows' })

    expect(query.text).toContain('COUNT(*)::integer AS report_count')
    expect(query.text).toContain('WHERE rc.post_id = r.post_id')
    expect(query.text).toContain('WHERE mj.post_id = r.post_id')
    expect(query.values).toEqual([])
  })

  it('binds resolved status predicates for non-pending report queues', () => {
    const query = postReportEnrichmentJoinsSql({
      status: 'dismissed',
      countMode: 'distinct_reporters',
    })

    expect(query.text).toContain(
      'AND rc.reviewed_at IS NOT NULL AND rc.resolution_action = $1::moderation_report_resolution_actions',
    )
    expect(query.values).toEqual(['dismissed'])
  })
})
