import type { ApiFixtureCase, ResolvedApiFixtureCase } from './types.mts'

export function fromCaseFile(caseFile: string, cases: ApiFixtureCase[]): ResolvedApiFixtureCase[] {
  return cases.map(fixtureCase => {
    if (!fixtureCase.route)
      throw new Error(`API fixture "${fixtureCase.id}" is missing route metadata`)
    return {
      ...fixtureCase,
      route: fixtureCase.route,
      backendResponseContractKey:
        fixtureCase.backendResponseContractKey ??
        `${fixtureCase.method}:${fixtureCase.route.routeTemplate}`,
      source: { caseFile },
    }
  })
}
