import type { ApiFixtureCase } from './types.mts'

const hostnameId = '00000000-0000-7000-8000-000000000001'
const operationId = '00000000-0000-7000-8000-000000000002'
const pendingOperation = { operation_id: operationId, status: 'pending', totals: null } as const

export const webHostnameBlockingApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.hostname-block-create-admission.default',
    method: 'POST',
    path: '/api/v1/hostnames',
    route: { routeTemplate: '/api/v1/hostnames' },
    requestBody: { hostname: 'blocked.example.com', is_blocked: true },
    auth: 'fixture-admin',
    status: 200,
    consumers: ['web'],
    migratedFrom: ['web/types/hostnames.ts'],
    backendResponseContractKey: 'POST:/api/v1/hostnames#block',
    body: {
      id: hostnameId,
      hostname: 'blocked.example.com',
      ...pendingOperation,
    },
  },
  {
    id: 'web.hostname-block-admission.default',
    method: 'PATCH',
    path: `/api/v1/hostnames/${hostnameId}`,
    route: { routeTemplate: '/api/v1/hostnames/:id', pathParams: { id: hostnameId } },
    requestBody: { is_blocked: true },
    auth: 'fixture-admin',
    status: 200,
    consumers: ['web'],
    migratedFrom: ['web/types/hostnames.ts'],
    backendResponseContractKey: 'PATCH:/api/v1/hostnames/:id#block',
    body: pendingOperation,
  },
  {
    id: 'web.hostname-block-operation.completed',
    method: 'GET',
    path: `/api/v1/hostname-block-operations/${operationId}`,
    route: {
      routeTemplate: '/api/v1/hostname-block-operations/:operationId',
      pathParams: { operationId },
    },
    auth: 'fixture-admin',
    status: 200,
    consumers: ['web'],
    migratedFrom: ['web/types/hostnames.ts'],
    backendResponseContractKey: 'GET:/api/v1/hostname-block-operations/:operationId',
    body: {
      operation_id: operationId,
      status: 'completed',
      totals: {
        blocked_hostname_count: 3,
        soft_deleted_relation_count: 7,
        penalized_user_count: 2,
      },
    },
  },
]
