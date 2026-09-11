import nativeImportExportRssFeedsStatusPartial from '../../../../api-fixtures/v1/responses/native.import-export.rss-feeds.status.partial.json'
import nativeImportExportRssFeedsStatusRetrying from '../../../../api-fixtures/v1/responses/native.import-export.rss-feeds.status.retrying.json'
import nativeImportExportRssFeedsSubmitDefault from '../../../../api-fixtures/v1/responses/native.import-export.rss-feeds.submit.default.json'
import nativeImportExportTopicsExportDefault from '../../../../api-fixtures/v1/responses/native.import-export.topics.export.default.json'
import nativeImportExportTopicsExportDownload from '../../../../api-fixtures/v1/responses/native.import-export.topics.export.download.json'
import nativeImportExportTopicsImportOutcomes from '../../../../api-fixtures/v1/responses/native.import-export.topics.import.outcomes.json'
import type {
  ExportTopic,
  RssFeedImportStatus,
  RssFeedImportSubmission,
  TopicImportResult,
} from '@/lib/api/client/import-export'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'
import { clientFetch } from '@/lib/api/client/raw-fetch'

const importId = '70000000-0000-7000-8000-000000000001'

export const IMPORT_EXPORT_DECLARATIONS = [
  defineWebApiFixture<RssFeedImportStatus>()(
    'native.import-export.rss-feeds.status.partial',
    nativeImportExportRssFeedsStatusPartial,
    context => context.client.importExport.getRssFeedImport(importId),
  ),
  defineWebApiFixture<RssFeedImportStatus>()(
    'native.import-export.rss-feeds.status.retrying',
    nativeImportExportRssFeedsStatusRetrying,
    context => context.client.importExport.getRssFeedImport(importId),
  ),
  defineWebApiFixture<RssFeedImportSubmission>()(
    'native.import-export.rss-feeds.submit.default',
    nativeImportExportRssFeedsSubmitDefault,
    context =>
      context.client.importExport.importRssFeeds({
        follow: true,
        urls: ['https://example.test/feed.xml', 'https://invalid.example.test/feed.xml'],
      }),
  ),
  defineWebApiFixture<{ results: ExportTopic[] }>()(
    'native.import-export.topics.export.default',
    nativeImportExportTopicsExportDefault,
    async context => {
      const response = await clientFetch('/api/v1/my/export/topics')
      if (!response.ok) throw new Error(`Topic fixture export failed: ${response.status}`)
      return response.json() as Promise<{ results: ExportTopic[] }>
    },
  ),
  defineWebApiFixture<ExportTopic[]>()(
    'native.import-export.topics.export.download',
    nativeImportExportTopicsExportDownload,
    async context => {
      const response = await clientFetch(context.client.importExport.exportTopics())
      if (!response.ok) throw new Error(`Topic fixture download failed: ${response.status}`)
      return response.json() as Promise<ExportTopic[]>
    },
  ),
  defineWebApiFixture<{ results: TopicImportResult[] }>()(
    'native.import-export.topics.import.outcomes',
    nativeImportExportTopicsImportOutcomes,
    context =>
      context.client.importExport.importTopics({
        names: ['Travel', 'Local News', 'Travel', '!!!'],
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
