import { cache } from 'react'
import { serverApi } from './instance'
import type { ScopeCatalogResponse } from '@/types/scopes'

export const getScopeCatalog = cache(async (): Promise<ScopeCatalogResponse> =>
  serverApi.get<ScopeCatalogResponse>('/api/v1/scopes'),
)
