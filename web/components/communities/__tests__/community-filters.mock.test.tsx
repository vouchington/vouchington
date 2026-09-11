import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommunityFilters } from '../community-filters'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('CommunityFilters', () => {
  it('renders search input with placeholder "Search by text or #topic"', () => {
    render(<CommunityFilters />)
    expect(screen.getByPlaceholderText('Search by text or #topic')).toBeDefined()
  })

  it('passes searchLabel for accessible labeling', () => {
    render(<CommunityFilters />)
    expect(screen.getByLabelText('Search communities by text or topic')).toBeDefined()
  })
})
