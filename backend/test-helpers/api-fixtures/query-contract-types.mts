import type { QueryContract } from '@modules/pagination'

export type BackendQueryContract = {
  method: string
  routeTemplate: string
  parameters: QueryContract
}

export type BackendQueryContractRegistry = Readonly<Record<string, BackendQueryContract>>
