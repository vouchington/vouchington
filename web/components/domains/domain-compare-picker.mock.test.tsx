import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import type { HostnameListResponse } from '@/types/hostnames'
import { DomainComparePicker } from './domain-compare-picker'

const fetchHostnames = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/api/client/hostnames'),
  () => ({ fetchHostnames }) as unknown as typeof import('@/lib/api/client/hostnames'),
)

const nav = createNavMock()
const results = {
  results: [{ __entity_type: 'hostname', id: '00000000-0000-7000-8000-000000000701' }],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  hostnames: {
    '00000000-0000-7000-8000-000000000701': {
      __entity_type: 'hostname',
      id: '00000000-0000-7000-8000-000000000701',
      hostname: 'test.org',
      topic_id: null,
    },
  },
} satisfies HostnameListResponse

describe('DomainComparePicker', () => {
  beforeEach(() => {
    nav.reset()
    fetchHostnames.mockReset()
    fetchHostnames.mockResolvedValue(results)
  })

  it('adds a searched hostname and compares natural hostname keys with the existing selection', async () => {
    render(<DomainComparePicker initialHostnames={['example.com']} />)

    fireEvent.change(screen.getByPlaceholderText('Search hostnames'), {
      target: { value: 'test' },
    })
    fireEvent.click(await screen.findByRole('option', { name: 'test.org' }))

    expect(screen.getByRole('button', { name: 'example.com ×' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'test.org ×' })).toBeInTheDocument()
    expect(screen.queryByText('00000000-0000-7000-8000-000000000701')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search hostnames')).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Compare hostnames' }))
    expect(nav.push).toHaveBeenCalledWith('/domains/compare?hostnames=example.com%2Ctest.org')
  })

  it('deduplicates an existing hostname and disables comparison after removing the last one', async () => {
    render(<DomainComparePicker initialHostnames={['test.org']} />)

    fireEvent.change(screen.getByPlaceholderText('Search hostnames'), {
      target: { value: 'test' },
    })
    fireEvent.click(await screen.findByRole('option', { name: 'test.org' }))

    expect(screen.getAllByRole('button', { name: 'test.org ×' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Compare hostnames' }))
    expect(nav.push).toHaveBeenCalledWith('/domains/compare?hostnames=test.org')

    fireEvent.click(screen.getByRole('button', { name: 'test.org ×' }))
    expect(screen.getByRole('button', { name: 'Compare hostnames' })).toBeDisabled()
  })
})
