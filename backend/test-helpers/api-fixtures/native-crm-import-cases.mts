import { predecessorIssue } from './predecessor-issue.mts'
import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-admin',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [predecessorIssue(6584)],
}

export const nativeCrmImportApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.crm.import.success.default',
    method: 'POST',
    path: '/api/v1/imports/crm-contacts',
    route: { routeTemplate: '/api/v1/imports/crm-contacts' },
    backendResponseContractKey: 'POST:/api/v1/imports/crm-contacts#success',
    requestBody: { csv: 'name,email\nAlice Creator,alice@example.test' },
    status: 201,
    body: responseBody('native.crm.import.success.default'),
  },
  {
    ...shared,
    id: 'native.crm.import.validation.default',
    method: 'POST',
    path: '/api/v1/imports/crm-contacts',
    route: { routeTemplate: '/api/v1/imports/crm-contacts' },
    backendResponseContractKey: 'POST:/api/v1/imports/crm-contacts#validation',
    requestBody: { csv: 'name,email,follower_count\nAlice Creator,alice@example.test,-1' },
    status: 422,
    body: responseBody('native.crm.import.validation.default'),
  },
]
