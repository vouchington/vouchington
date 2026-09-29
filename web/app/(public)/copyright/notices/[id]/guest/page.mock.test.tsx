import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/copyright/copyright-guest-filing-form'), () => ({
  CopyrightGuestFilingForm: ({ noticeId }: { noticeId: string }) => (
    <div>guest form {noticeId}</div>
  ),
}))

import CopyrightGuestFilingPage from './page'

const noticeId = '00000000-0000-7000-8000-000000000830'

describe('CopyrightGuestFilingPage', () => {
  it('renders the filing form for the case id', async () => {
    render(await CopyrightGuestFilingPage({ params: Promise.resolve({ id: noticeId }) }))
    expect(screen.getByRole('heading', { name: 'Copyright case filing' })).toBeInTheDocument()
    expect(screen.getByText(`guest form ${noticeId}`)).toBeInTheDocument()
  })
})
