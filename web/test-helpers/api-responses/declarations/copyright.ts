import webCopyrightNoticesDefault from '../../../../api-fixtures/v1/responses/web.copyright.notices.default.json'
import type { CopyrightNoticesPage } from '@/types/copyright-notices'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const COPYRIGHT_DECLARATIONS = [
  defineWebApiFixture<CopyrightNoticesPage>()(
    'web.copyright.notices.default',
    webCopyrightNoticesDefault,
    context => context.server.copyrightNotices.getCopyrightNotices(),
    [context => context.client.copyrightNotices.listCopyrightNotices()],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
