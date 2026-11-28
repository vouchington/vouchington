import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { mockUseAuth, mockAddSourceForm } = vi.hoisted(() => ({
  mockUseAuth: vi.fn<VitestLooseMock>(),
  mockAddSourceForm: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: mockUseAuth,
}))

vi.mock(import('@/components/sources/add-source-form'), () => ({
  AddSourceForm: mockAddSourceForm,
}))

import { AddSourceButton } from '../add-source-button'

const baseUser = { id: 'user-1', username: 'alice' }

describe('AddSourceButton', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockAddSourceForm.mockReset()
    mockAddSourceForm.mockReturnValue(<div>mock-form</div>)
  })

  it('returns null when not authenticated', () => {
    mockUseAuth.mockReturnValue({ currentUser: null })
    const { container } = render(<AddSourceButton kind='news' />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Add News Source button for news kind', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    render(<AddSourceButton kind='news' />)
    expect(screen.getByRole('button', { name: 'Add News Source' })).toBeInTheDocument()
  })

  it('renders Add Podcast button for podcast kind', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    render(<AddSourceButton kind='podcast' />)
    expect(screen.getByRole('button', { name: 'Add Podcast' })).toBeInTheDocument()
  })

  it('renders Add Channel button for video kind', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    render(<AddSourceButton kind='video' />)
    expect(screen.getByRole('button', { name: 'Add Channel' })).toBeInTheDocument()
  })

  it('opens dialog on button click', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    render(<AddSourceButton kind='podcast' />)
    expect(screen.queryByText('Add a podcast')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Podcast' }))
    expect(screen.getByText('Add a podcast')).toBeInTheDocument()
  })

  it('renders dialog title for news kind', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    render(<AddSourceButton kind='news' />)
    fireEvent.click(screen.getByRole('button', { name: 'Add News Source' }))
    expect(screen.getByText('Add a news source')).toBeInTheDocument()
  })

  it('closes dialog when form calls onSuccess', () => {
    mockUseAuth.mockReturnValue({ currentUser: baseUser })
    mockAddSourceForm.mockImplementation(({ onSuccess }: { onSuccess?: () => void }) => (
      <button
        type='button'
        onClick={onSuccess}
      >
        mock-success
      </button>
    ))
    render(<AddSourceButton kind='podcast' />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Podcast' }))
    expect(screen.getByText('Add a podcast')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'mock-success' }))
    expect(screen.queryByText('Add a podcast')).toBeNull()
  })
})
