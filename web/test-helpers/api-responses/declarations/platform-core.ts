import oauthAuthorizationCompleteAcknowledged from '../../../../api-fixtures/v1/responses/web.oauth.authorization.complete.acknowledged.json'
import sharedCurrenciesListDefault from '../../../../api-fixtures/v1/responses/shared.currencies.list.default.json'
import webMySupportThreadsCreateDefault from '../../../../api-fixtures/v1/responses/web.my.support-threads.create.default.json'
import type { CurrenciesResponseBody } from '@/lib/api/client/currencies'
import type { SupportThreadCreateResponseBody } from '@/types/support'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const PLATFORM_CORE_DECLARATIONS = [
  defineWebApiFixture<CurrenciesResponseBody>()(
    'shared.currencies.list.default',
    sharedCurrenciesListDefault,
    context => context.client.currencies.fetchCurrencies(),
  ),
  defineWebApiFixture<null>()(
    'web.oauth.authorization.complete.acknowledged',
    oauthAuthorizationCompleteAcknowledged,
    context =>
      context.client.auth.acknowledgeOAuthAuthorization('019fafb8-a44c-73e2-890a-497ff3dd27a6'),
  ),
  defineWebApiFixture<SupportThreadCreateResponseBody>()(
    'web.my.support-threads.create.default',
    webMySupportThreadsCreateDefault,
    context =>
      context.client.support.createMySupportThread({
        message: 'I need help with my account.',
        subject: 'Account access issue',
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
