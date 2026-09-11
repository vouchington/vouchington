import { decodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { nativeModerationAppealApiFixtureCases } from './native-moderation-appeal-cases.mts'
import {
  nativeModerationApiFixtureCases,
  nativeModerationFlatReportId,
  nativeModerationMemberOwnerId,
} from './native-moderation-cases.mts'
import { responseBody } from './static-response-bodies.mts'

const UUID_V7_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('native moderation fixtures', () => {
  it('composes the focused report and appeal fixture modules without duplicate IDs', () => {
    const appealStart = nativeModerationApiFixtureCases.findIndex(
      fixture => fixture.id === nativeModerationAppealApiFixtureCases[0]!.id,
    )
    expect(appealStart).toBeGreaterThanOrEqual(0)
    expect(
      nativeModerationApiFixtureCases.slice(
        appealStart,
        appealStart + nativeModerationAppealApiFixtureCases.length,
      ),
    ).toEqual(nativeModerationAppealApiFixtureCases)
    expect(new Set(nativeModerationApiFixtureCases.map(fixture => fixture.id)).size).toBe(
      nativeModerationApiFixtureCases.length,
    )
  })

  it('keeps clustered triage detail, page shape, and duplicate totals internally consistent', () => {
    const body = responseBody('native.moderation.reports.clustered.default') as {
      results: Array<{
        entity_id: string
        entity_type: string
        reports: Array<Record<string, unknown>>
        target_user_id: string | null
      }>
      duplicate_clusters: Array<{
        id: string
        post_count: number
        report_count: number
        reason_breakdown: Array<{ count: number }>
        clusters: Array<{
          entity_id: string
          report_count: number
          target_user_id: string | null
        }>
      }>
      page_info: Record<string, unknown>
    }
    const userCluster = body.results.find(cluster => cluster.entity_type === 'user')!

    expect(body).not.toHaveProperty('clusters')
    expect(Object.keys(body.page_info).sort()).toEqual([
      'end_cursor',
      'has_next_page',
      'has_previous_page',
      'start_cursor',
    ])
    expect(body.results).toHaveLength(4)
    expect(body.results.flatMap(cluster => cluster.reports)).toHaveLength(5)
    expect(userCluster.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-7000-8100-000000000201',
          is_system_generated: false,
        }),
        expect.objectContaining({
          id: '00000000-0000-7000-8100-000000000202',
          is_system_generated: true,
          community_ban_evasion: expect.objectContaining({
            community_id: '00000000-0000-7000-8500-000000000101',
            source_user_id: '00000000-0000-7000-8600-000000000101',
          }),
        }),
      ]),
    )
    expect(JSON.stringify(body)).not.toContain('cursor_')

    const duplicate = body.duplicate_clusters[0]!
    expect(duplicate.id).toBe(
      'content-hash:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    expect(duplicate.clusters.map(cluster => cluster.entity_id).toSorted()).toEqual([
      '00000000-0000-7000-8000-000000000101',
      '00000000-0000-7000-8000-000000000102',
      '00000000-0000-7000-8000-000000000103',
    ])
    expect(duplicate.clusters).toHaveLength(duplicate.post_count)
    expect(sum(duplicate.clusters.map(cluster => cluster.report_count))).toBe(
      duplicate.report_count,
    )
    expect(sum(duplicate.reason_breakdown.map(reason => reason.count))).toBe(duplicate.report_count)

    for (const report of body.results.flatMap(cluster => cluster.reports)) {
      expect(report).toMatchObject({
        id: expect.stringMatching(UUID_V7_SHAPED),
        case_id: expect.stringMatching(UUID_V7_SHAPED),
        reporter_user_id: expect.stringMatching(UUID_V7_SHAPED),
      })
    }
    const targetUserIds = [...body.results, ...duplicate.clusters]
      .map(cluster => cluster.target_user_id)
      .filter((id): id is string => id !== null)
    expect(targetUserIds).not.toHaveLength(0)
    expect(targetUserIds.every(id => UUID_V7_SHAPED.test(id))).toBe(true)
  })

  it('keeps staff detail while member reports stay redacted', () => {
    const staffReport = fixtureBody('native.moderation.reports.default').results[0]!
    expect(staffReport).toEqual(
      expect.objectContaining({
        reporter_user_id: 'user-1',
        note: 'Looks automated.',
        is_system_generated: false,
        judgement: expect.any(Object),
      }),
    )

    const memberReport = fixtureBody('native.moderation.reports.member.default').results[0]!
    for (const field of [
      'reporter_user_id',
      'note',
      'is_system_generated',
      'community_ban_evasion',
      'judgement',
    ]) {
      expect(memberReport).not.toHaveProperty(field)
    }
  })
  it('uses one canonical UUID for flat report rows and linked moderation actions', () => {
    for (const fixtureId of [
      'native.moderation.reports.default',
      'native.moderation.reports.member.default',
    ]) {
      const body = fixtureBody(fixtureId) as FixtureBody & {
        page_info: { start_cursor: string }
      }
      expect(body.results[0]!.id).toBe(nativeModerationFlatReportId)
      expect((decodeCursor(body.page_info.start_cursor) as { id: string }).id).toBe(
        nativeModerationFlatReportId,
      )
    }

    const judgement = fixtureCase('native.moderation.report-judgement.default')
    const resolution = fixtureCase('native.moderation.report-resolution.reviewed')
    const warning = fixtureCase('native.moderation.admin-warning.report')
    expect(judgement.path).toBe(`/api/v1/reports/${nativeModerationFlatReportId}/judgements`)
    expect(judgement.route!.pathParams).toMatchObject({ reportId: nativeModerationFlatReportId })
    expect(resolution.path).toBe(`/api/v1/reports/${nativeModerationFlatReportId}`)
    expect(resolution.route!.pathParams).toMatchObject({ id: nativeModerationFlatReportId })
    expect((resolution.body as { report: { id: string } }).report.id).toBe(
      nativeModerationFlatReportId,
    )
    expect(warning.requestBody).toMatchObject({ reportId: nativeModerationFlatReportId })
    expect((warning.body as { warning: { report_id: string } }).warning.report_id).toBe(
      nativeModerationFlatReportId,
    )
  })
})

type FixtureBody = {
  results: Array<Record<string, unknown>>
}

function fixtureBody(id: string): FixtureBody {
  return fixtureCase(id).body as FixtureBody
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

describe('native moderation list cursor fixtures', () => {
  it.each([
    ['native.moderation.reports.default', false, 'severity'],
    ['native.moderation.reports.clustered.default', true, 'created_at_desc'],
    ['native.moderation.reports.clustered.page-2', true, 'created_at_desc'],
  ] as const)('binds %s to the staff report scope', (fixtureId, cluster, sort) => {
    const body = responseBody(fixtureId) as {
      page_info: { start_cursor: string }
    }
    const cursor = decodeCursor(body.page_info.start_cursor) as Record<string, unknown>

    expect(cursor).toMatchObject({ cluster, sort, status: 'pending' })
    expect(cursor.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(Object.hasOwn(cursor, 'created_at')).toBe(cluster)
    expect(JSON.parse(cursor.scope as string)).toEqual({ audience: 'staff', ownerId: null })
  })

  it('binds the member fixture cursor to its member owner scope', () => {
    const body = fixtureBody('native.moderation.reports.member.default') as FixtureBody & {
      page_info: { start_cursor: string }
    }
    const cursor = decodeCursor(body.page_info.start_cursor) as Record<string, unknown>

    expect(cursor).toMatchObject({ cluster: false, sort: 'created_at_desc', status: 'pending' })
    expect(JSON.parse(cursor.scope as string)).toEqual({
      audience: 'member',
      ownerId: nativeModerationMemberOwnerId,
    })
  })

  it('keeps clustered pages ordered and cursor-connected across the boundary', () => {
    const firstCase = fixtureCase('native.moderation.reports.clustered.default')
    const secondCase = fixtureCase('native.moderation.reports.clustered.page-2')
    const firstBody = clusteredBody('native.moderation.reports.clustered.default')
    const secondBody = clusteredBody('native.moderation.reports.clustered.page-2')
    const startCursor = decodeCursor(firstBody.page_info.start_cursor) as { id: string }
    const endCursor = decodeCursor(firstBody.page_info.end_cursor!) as { id: string }

    expect(firstBody.results.length).toBeLessThanOrEqual(Number(firstCase.query!.limit))
    expect(secondBody.results.length).toBeLessThanOrEqual(Number(secondCase.query!.limit))
    expect(startCursor.id).toBe(firstBody.results[0]!.entity_id)
    expect(endCursor.id).toBe(firstBody.results.at(-1)!.entity_id)
    expect(secondCase.query!.after).toBe(firstBody.page_info.end_cursor)
    expect(firstBody.results.map(cluster => cluster.last_reported_at)).toEqual(
      firstBody.results
        .map(cluster => cluster.last_reported_at)
        .toSorted()
        .toReversed(),
    )
    expect(secondBody.results.map(cluster => cluster.last_reported_at)).toEqual(
      secondBody.results
        .map(cluster => cluster.last_reported_at)
        .toSorted()
        .toReversed(),
    )
    expect(Date.parse(firstBody.results.at(-1)!.last_reported_at)).toBeGreaterThan(
      Date.parse(secondBody.results[0]!.last_reported_at),
    )

    const targetUserIds = [firstBody, secondBody].flatMap(body =>
      [...body.results, ...body.duplicate_clusters.flatMap(duplicate => duplicate.clusters)]
        .map(cluster => cluster.target_user_id)
        .filter((id): id is string => id !== null),
    )
    expect(targetUserIds).not.toHaveLength(0)
    expect(targetUserIds.every(id => UUID_V7_SHAPED.test(id))).toBe(true)

    for (const cluster of firstBody.results) {
      const reportTimes = cluster.reports.map(report => report.created_at).toSorted()
      expect(cluster.first_reported_at).toBe(reportTimes[0])
      expect(cluster.last_reported_at).toBe(reportTimes.at(-1))
    }
  })
})

function fixtureCase(id: string) {
  return nativeModerationApiFixtureCases.find(item => item.id === id)!
}

function clusteredBody(id: string) {
  return responseBody(id) as {
    results: Array<{
      entity_id: string
      first_reported_at: string
      last_reported_at: string
      reports: Array<{ created_at: string }>
      target_user_id: string | null
    }>
    duplicate_clusters: Array<{
      clusters: Array<{ target_user_id: string | null }>
    }>
    page_info: { start_cursor: string; end_cursor: string | null }
  }
}
