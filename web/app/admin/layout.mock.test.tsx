import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AdminLayout from './layout'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: vi.fn<VitestLooseMock>(() => {
        throw new Error('NEXT_REDIRECT')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockRedirect = vi.mocked(redirect)
const mockGetCurrentUser = vi.mocked(getCurrentUser)

describe('AdminLayout', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children for an administrator', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', roles: ['administrator'] } as any)
    const result = await AdminLayout({ children: <span>content</span> })
    expect(result).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('renders children for a viewer role (developer)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u2', roles: ['developer'] } as any)
    const result = await AdminLayout({ children: <span>content</span> })
    expect(result).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to / for a user with no config role', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u3', roles: ['member'] } as any)
    await expect(AdminLayout({ children: <span>content</span> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to / when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(AdminLayout({ children: <span>content</span> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
