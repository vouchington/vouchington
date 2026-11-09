import type { ApiFixtureCase } from './types.mts'

export function withStaffReportLabels(fixture: ApiFixtureCase): ApiFixtureCase {
  if (fixture.id === 'native.moderation.reports.default') {
    const body = fixture.body as { results: Array<Record<string, unknown>> }
    return {
      ...fixture,
      body: {
        ...body,
        results: body.results.map(report => ({
          ...report,
          reporter_display_name: null,
          resolver_username: null,
          resolver_display_name: null,
        })),
      },
    }
  }
  if (!fixture.id.startsWith('native.moderation.reports.clustered.')) return fixture
  const body = fixture.body as {
    results: Array<Record<string, unknown>>
    duplicate_clusters: Array<Record<string, unknown>>
  }
  const addLabels = (report: Record<string, unknown>) => ({
    ...report,
    reporter_display_name: null,
    resolver_username: null,
    resolver_display_name: null,
  })
  return {
    ...fixture,
    body: {
      ...body,
      results: body.results.map(cluster => ({
        ...cluster,
        reports: (cluster.reports as Array<Record<string, unknown>>).map(addLabels),
      })),
      duplicate_clusters: body.duplicate_clusters.map(duplicate => ({
        ...duplicate,
        clusters: (duplicate.clusters as Array<Record<string, unknown>>).map(cluster => ({
          ...cluster,
          reports: (cluster.reports as Array<Record<string, unknown>>).map(addLabels),
        })),
      })),
    },
  }
}
