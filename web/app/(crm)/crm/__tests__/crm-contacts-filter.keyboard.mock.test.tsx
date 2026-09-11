import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { CrmContactsFilter } from '../crm-contacts-filter'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='select-mock'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('CrmContactsFilter — keyboard submit', () => {
  it('Enter on the search input pushes a filtered URL via router', async () => {
    render(<CrmContactsFilter />)

    const input = screen.getByLabelText('Search contacts') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alice' } })

    void expectInputEnterSubmits({ input, onSubmit: mockNav.push })

    await waitFor(() => {
      expect(mockNav.push).toHaveBeenCalledWith(expect.stringContaining('/crm?'))
    })
    expect(mockNav.push).toHaveBeenCalledWith(expect.stringContaining('q=alice'))
  })
})
