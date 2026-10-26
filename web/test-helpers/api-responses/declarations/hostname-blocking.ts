import hostnameBlockAdmissionDefault from '../../../../api-fixtures/v1/responses/web.hostname-block-admission.default.json'
import hostnameBlockCreateAdmissionDefault from '../../../../api-fixtures/v1/responses/web.hostname-block-create-admission.default.json'
import hostnameBlockOperationCompleted from '../../../../api-fixtures/v1/responses/web.hostname-block-operation.completed.json'
import type { BlockHostnameResult, CreateHostnameResponse } from '@/types/hostnames'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const HOSTNAME_ID = '00000000-0000-7000-8000-000000000001'
const OPERATION_ID = '00000000-0000-7000-8000-000000000002'

export const HOSTNAME_BLOCKING_DECLARATIONS = [
  defineWebApiFixture<BlockHostnameResult>()(
    'web.hostname-block-admission.default',
    hostnameBlockAdmissionDefault,
    context => context.client.hostnames.updateHostname(HOSTNAME_ID, { is_blocked: true }),
  ),
  defineWebApiFixture<CreateHostnameResponse>()(
    'web.hostname-block-create-admission.default',
    hostnameBlockCreateAdmissionDefault,
    context =>
      context.client.hostnames.createHostname({
        hostname: 'blocked.example.com',
        is_blocked: true,
      }),
  ),
  defineWebApiFixture<BlockHostnameResult>()(
    'web.hostname-block-operation.completed',
    hostnameBlockOperationCompleted,
    context => context.client.hostnames.fetchHostnameBlockOperation(OPERATION_ID),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
