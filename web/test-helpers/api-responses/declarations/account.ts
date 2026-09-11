import nativeMyApiKeysPaginated from '../../../../api-fixtures/v1/responses/native.my.api-keys.paginated.json'
import nativeMyPushSubscriptionsPaginated from '../../../../api-fixtures/v1/responses/native.my.push-subscriptions.paginated.json'
import nativeUsersDataRequestCreateDefault from '../../../../api-fixtures/v1/responses/native.users.data-request.create.default.json'
import nativeUsersDataRequestDefault from '../../../../api-fixtures/v1/responses/native.users.data-request.default.json'
import nativeUsersDeleteDefault from '../../../../api-fixtures/v1/responses/native.users.delete.default.json'
import type { ApiKey } from '@/types/api-keys'
import type { ListResponse, WebPushSubscriptionsResponseBody } from '@/types/api-responses'
import type { CreateOrConflictDataRequestResponse, DataRequest } from '@/lib/api/client/users'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const ACCOUNT_DECLARATIONS = [
  defineWebApiFixture<ListResponse<ApiKey>>()(
    'native.my.api-keys.paginated',
    nativeMyApiKeysPaginated,
    context =>
      context.client.apiKeys.getApiKeys({ after: 'fixture-owner-scoped-api-key-cursor', limit: 1 }),
    [
      context =>
        context.server.apiKeys.getMyApiKeys({
          after: 'fixture-owner-scoped-api-key-cursor',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<WebPushSubscriptionsResponseBody>()(
    'native.my.push-subscriptions.paginated',
    nativeMyPushSubscriptionsPaginated,
    context =>
      context.client.myNotifications.getMyWebPushSubscriptionsClient({
        after: 'fixture-owner-scoped-push-cursor',
        limit: 1,
      }),
    [
      context =>
        context.server.my.getMyWebPushSubscriptions({
          after: 'fixture-owner-scoped-push-cursor',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<{ logout: boolean }>()(
    'native.users.delete.default',
    nativeUsersDeleteDefault,
    context => context.client.users.deleteUser('user-abc'),
  ),
  defineWebApiFixture<DataRequest>()(
    'native.users.data-request.default',
    nativeUsersDataRequestDefault,
    context => context.client.users.getUserDataRequest('user-abc'),
  ),
  defineWebApiFixture<CreateOrConflictDataRequestResponse>()(
    'native.users.data-request.create.default',
    nativeUsersDataRequestCreateDefault,
    context => context.client.users.createUserDataRequest('user-abc'),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
