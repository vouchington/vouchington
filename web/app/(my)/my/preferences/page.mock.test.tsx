import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))

vi.mock(import('@/components/my/preferences-form'), () => ({
  PreferencesForm: () => <div data-pw='preferences-form' />,
}))

import PreferencesPage from './page'

describe('PreferencesPage', () => {
  it('renders the shared settings header above the preferences form', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', hn_discussions: false })
    render(await PreferencesPage())

    expect(screen.getByText('Display')).toBeInTheDocument()
    expect(screen.getByText('Customize your browsing experience')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="settings-page-header"]')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="preferences-form"]')).toBeInTheDocument()
  })
})
