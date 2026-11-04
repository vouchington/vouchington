import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import { PostTimeRangeSelect } from '../post-time-range-select'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: ReactNode
        value: string
        onValueChange: (value: string) => void
      }) => (
        <select
          aria-label='Time range'
          value={value}
          onChange={event => onValueChange(event.target.value)}
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

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('PostTimeRangeSelect', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  it('defaults to 30 days and offers every range', () => {
    render(<PostTimeRangeSelect />)
    const select = screen.getByLabelText<HTMLSelectElement>('Time range')
    expect(select.value).toBe('1m')
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      '1w',
      '1m',
      '1y',
      'all',
    ])
  })

  it('reads the range from the URL', () => {
    mockNav.setSearchParams('time_range=1y')
    render(<PostTimeRangeSelect />)
    expect(screen.getByLabelText<HTMLSelectElement>('Time range').value).toBe('1y')
  })

  it('writes a non-default range to the URL and drops the cursor', () => {
    mockNav.setSearchParams('after=abc&q=card')
    render(<PostTimeRangeSelect />)
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'all' } })
    expect(mockNav.push).toHaveBeenCalledWith('?q=card&time_range=all', { scroll: false })
  })

  it('removes the param when the default is chosen', () => {
    mockNav.setSearchParams('time_range=1y')
    render(<PostTimeRangeSelect />)
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '1m' } })
    expect(mockNav.push).toHaveBeenCalledWith('?', { scroll: false })
  })

  it('offers only the given options and honors an explicit value', () => {
    mockNav.setSearchParams('time_range=all')
    render(
      <PostTimeRangeSelect
        options={['1w', '1m', '1y']}
        value='1y'
      />,
    )
    const select = screen.getByLabelText<HTMLSelectElement>('Time range')
    expect(Array.from(select.options).map(option => option.value)).toEqual(['1w', '1m', '1y'])
    expect(select.value).toBe('1y')
  })

  it('falls back when the URL range is not offered', () => {
    mockNav.setSearchParams('time_range=all')
    render(<PostTimeRangeSelect options={['1w', '1y']} />)
    expect(screen.getByLabelText<HTMLSelectElement>('Time range').value).toBe('1w')
  })
})
