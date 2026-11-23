import { vi } from 'vitest'

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(() => Promise.resolve(null)),
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ noIndex: true })),
  createPageMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/post-schema'), () => ({
  createPostSchema: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/structured-data-breadcrumbs'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/post-schema-helpers'), () => ({
  buildCommentsForSchema: vi.fn<VitestLooseMock>(() => []),
  buildInteractionStats: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/lib/seo/indexability'), () => ({
  isIndexableForSeo: vi.fn<VitestLooseMock>(() => true),
}))
vi.mock(import('@/lib/seo/schema-org-types'), () => ({
  getSchemaOrgType: vi.fn<VitestLooseMock>(() => 'Thing'),
}))
