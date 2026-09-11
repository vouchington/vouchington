export type ApiFixtureConsumer = 'web' | 'swift-core' | 'swift-ui' | 'dotnet-core' | 'playwright'

export type ApiFixtureAuthMode = 'none' | 'fixture-user' | 'fixture-developer' | 'fixture-admin'

export type ApiFixtureRouteContract = {
  routeTemplate: string
  pathParams?: Record<string, string>
}

export type ApiFixtureSource = {
  caseFile: string
}

export type ApiFixtureResponseSchema = {
  key: string
  hash: string
}

export type ApiFixtureCase = {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  route?: ApiFixtureRouteContract
  query?: Record<string, string>
  requestBody?: unknown
  auth: ApiFixtureAuthMode
  status: number
  body: unknown
  consumers: ApiFixtureConsumer[]
  migratedFrom: string[]
  responseSchemaKey?: string
  backendResponseContractKey?: string
  source?: ApiFixtureSource
}

export type ResolvedApiFixtureCase = ApiFixtureCase & {
  backendResponseContractKey: string
  route: ApiFixtureRouteContract
}

export type ApiFixtureManifestEntry = Omit<ResolvedApiFixtureCase, 'body' | 'responseSchemaKey'> & {
  bodyFile: string
  responseSchema: ApiFixtureResponseSchema
}

export type ApiFixtureManifest = {
  version: 2
  source: {
    kind: 'generated'
    generator: 'backend/test-helpers/api-fixtures/generate.mts'
    caseRoot: 'backend/test-helpers/api-fixtures'
  }
  backendResponseContracts: Record<
    string,
    {
      source: string
      method: string
      routeTemplate: string
      hash: string
      schema: import('./contract-schema-types.mts').ContractSchema
    }
  >
  fixtures: ApiFixtureManifestEntry[]
}
