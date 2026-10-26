import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'

const { notFound, mockGetFlag } = vi.hoisted(() => ({
  notFound: vi.fn<() => never>(),
  mockGetFlag: vi.fn<(name: string) => Promise<boolean>>(),
}))

vi.mock(import('next/navigation'), () => ({ ...navMockModule, notFound }))

vi.mock(import('@/lib/feature-flags/server'), () => ({
  getEffectiveServerFeatureFlag: mockGetFlag,
}))

import InstancesLayout from './layout'

const child = <div>instances list</div>

describe('InstancesLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('returns notFound before the list streams when the fediverse flag is off', async () => {
    mockGetFlag.mockResolvedValue(false)

    await expect(InstancesLayout({ children: child })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
    expect(mockGetFlag).toHaveBeenCalledWith('fediverse')
  })

  it('renders the list when the fediverse flag is on', async () => {
    mockGetFlag.mockResolvedValue(true)

    await expect(InstancesLayout({ children: child })).resolves.toBe(child)
    expect(notFound).not.toHaveBeenCalled()
    expect(mockGetFlag).toHaveBeenCalledWith('fediverse')
  })
})
