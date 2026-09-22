import webCopyrightNoticesDefault from '../../../../api-fixtures/v1/responses/web.copyright.notices.default.json'
import webCopyrightStaffQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.staff-queue.default.json'
import type { CopyrightNoticesPage, CopyrightStaffQueuePage } from '@/types/copyright-notices'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const COPYRIGHT_DECLARATIONS = [
  defineWebApiFixture<CopyrightNoticesPage>()(
    'web.copyright.notices.default',
    webCopyrightNoticesDefault,
    context => context.server.copyrightNotices.getCopyrightNotices(),
    [context => context.client.copyrightNotices.listCopyrightNotices()],
  ),
  defineWebApiFixture<CopyrightStaffQueuePage>()(
    'web.copyright.staff-queue.default',
    webCopyrightStaffQueueDefault,
    context => context.server.copyrightNotices.getCopyrightReviewQueue(),
    [context => context.client.copyrightNotices.listCopyrightReviewQueue()],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
