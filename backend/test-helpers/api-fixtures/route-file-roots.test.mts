import { describe, expect, it } from 'vitest'

import { backendApiRouteRootFileNames } from './route-file-roots.mts'

describe('backend compiler root selection', () => {
  it('keeps declarations and route modules while excluding unrelated and test modules', () => {
    const roots = [
      '/repo/backend/types/global.d.ts',
      '/repo/backend/types/global.d.mts',
      '/repo/backend/types/global.d.cts',
      '/repo/backend/api/v1/posts/get.mts',
      '/repo/backend/api/v1/posts/get.test.mts',
      '/repo/backend/api/v1/posts/__tests__/get.mts',
      '/repo/backend/services/posts/get.mts',
      '/repo/web/app/page.tsx',
    ]

    expect(backendApiRouteRootFileNames(roots)).toEqual(roots.slice(0, 4))
  })
})
