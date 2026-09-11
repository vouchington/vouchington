import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { AdminSupportContactsClient } from '../admin-support-contacts-client'
import type { SupportContactsResponse } from '@/types/support'

const mockRouterReplace = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockRouterRefresh = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ replace: mockRouterReplace, refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const initialData: SupportContactsResponse = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null },
} as unknown as SupportContactsResponse

describe('AdminSupportContactsClient — keyboard submit', () => {
  it('Enter on the search input replaces the URL via router', async () => {
    render(
      <AdminSupportContactsClient
        initialData={initialData}
        initialQ={undefined}
      />,
    )

    const input = screen.getByLabelText('Search support contacts') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tests+alice@voucha.ai' } })

    void expectInputEnterSubmits({ input, onSubmit: mockRouterReplace })

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/support/contacts'))
    })
    expect(mockRouterReplace).toHaveBeenCalledWith(
      expect.stringContaining('q=tests%2Balice%40voucha.ai'),
    )
  })
})
