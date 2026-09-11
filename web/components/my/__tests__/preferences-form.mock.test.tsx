import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreferencesForm } from '../preferences-form'

interface SelectProps {
  onValueChange: (v: string) => void
  value: string
  children: React.ReactNode
}
interface SelectTriggerProps {
  id?: string
  className?: string
  children?: React.ReactNode
}
interface SelectContentProps {
  children: React.ReactNode
}
interface SelectItemProps {
  value: string
  children: React.ReactNode
}

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ onValueChange, value, children }: SelectProps) => {
        // Extract id from SelectTrigger child so htmlFor label association works
        let id: string | undefined
        for (const child of Array.isArray(children) ? children : [children]) {
          if (isValidElement(child) && (child.props as SelectTriggerProps).id) {
            id = (child.props as SelectTriggerProps).id
          }
        }
        return (
          <select
            id={id}
            value={value}
            onChange={e => onValueChange(e.target.value)}
          >
            {children}
          </select>
        )
      },
      SelectTrigger: (_: SelectTriggerProps) => null,
      SelectValue: () => null,
      SelectContent: ({ children }: SelectContentProps) => children as ReactElement,
      SelectItem: ({ value, children }: SelectItemProps) => (
        <option value={value}>{children}</option>
      ),
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/preferences/use-theme'), () => ({
  useTheme: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/preferences/use-list-style'), () => ({
  useListStyle: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/preferences/use-feed-style'), () => ({
  useFeedStyle: vi.fn<VitestLooseMock>(),
}))

const mockUpdateMyUser = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client/users'), () => ({
  updateMyUser: mockUpdateMyUser,
}))

vi.mock(
  import('@/components/ui/switch'),
  () =>
    ({
      Switch: ({
        checked,
        id,
        onCheckedChange,
      }: {
        checked: boolean
        id?: string
        onCheckedChange: (enabled: boolean) => void
      }) => (
        <input
          checked={checked}
          id={id}
          type='checkbox'
          onChange={event => onCheckedChange(event.target.checked)}
        />
      ),
    }) as unknown as typeof import('@/components/ui/switch'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

import { useTheme } from '@/lib/preferences/use-theme'
import { useListStyle } from '@/lib/preferences/use-list-style'
import { useFeedStyle } from '@/lib/preferences/use-feed-style'
import { toast } from 'sonner'

const mockUseTheme = vi.mocked(useTheme)
const mockUseListStyle = vi.mocked(useListStyle)
const mockUseFeedStyle = vi.mocked(useFeedStyle)
const mockToastSuccess = vi.mocked(toast.success)

function renderForm() {
  return render(
    <PreferencesForm
      hnDiscussionsEnabled={false}
      userId='user-1'
    />,
  )
}

describe('PreferencesForm', () => {
  const mockSetTheme = vi.fn<VitestLooseMock>()
  const mockSetListStyle = vi.fn<VitestLooseMock>()
  const mockSetFeedStyle = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    mockSetTheme.mockClear()
    mockSetListStyle.mockClear()
    mockSetFeedStyle.mockClear()
    mockToastSuccess.mockClear()
    mockUpdateMyUser.mockReset()
    mockUpdateMyUser.mockResolvedValue({})
    mockUseTheme.mockReturnValue({ theme: 'system', setTheme: mockSetTheme })
    mockUseListStyle.mockReturnValue({ listStyle: 'card', setListStyle: mockSetListStyle })
    mockUseFeedStyle.mockReturnValue({ feedStyle: 'summary', setFeedStyle: mockSetFeedStyle })
  })

  it('renders theme, list style, feed style, and Hacker News discussions controls', () => {
    renderForm()
    expect(screen.getByLabelText('Theme')).toBeInTheDocument()
    expect(screen.getByLabelText('Post List Style')).toBeInTheDocument()
    expect(screen.getByLabelText('Feed Style')).toBeInTheDocument()
    expect(screen.getByLabelText('Hacker News discussions')).toBeInTheDocument()
  })

  it('displays the current theme value', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme })
    renderForm()
    expect(screen.getByLabelText('Theme')).toHaveValue('dark')
  })

  it('displays the current list style value', () => {
    mockUseListStyle.mockReturnValue({ listStyle: 'compact', setListStyle: mockSetListStyle })
    renderForm()
    expect(screen.getByLabelText('Post List Style')).toHaveValue('compact')
  })

  it('displays the current feed style value', () => {
    mockUseFeedStyle.mockReturnValue({ feedStyle: 'compact', setFeedStyle: mockSetFeedStyle })
    renderForm()
    expect(screen.getByLabelText('Feed Style')).toHaveValue('compact')
  })

  it('calls setTheme when theme select changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } })
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('shows a toast when theme changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } })
    expect(mockToastSuccess).toHaveBeenCalledWith('Theme updated')
  })

  it('does not call setTheme for invalid values', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'invalid' } })
    expect(mockSetTheme).not.toHaveBeenCalled()
  })

  it('calls setListStyle when list style select changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Post List Style'), { target: { value: 'compact' } })
    expect(mockSetListStyle).toHaveBeenCalledWith('compact')
  })

  it('shows a toast when list style changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Post List Style'), { target: { value: 'compact' } })
    expect(mockToastSuccess).toHaveBeenCalledWith('List style updated')
  })

  it('calls setFeedStyle when feed style select changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Feed Style'), { target: { value: 'compact' } })
    expect(mockSetFeedStyle).toHaveBeenCalledWith('compact')
  })

  it('shows a toast when feed style changes', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Feed Style'), { target: { value: 'compact' } })
    expect(mockToastSuccess).toHaveBeenCalledWith('Feed style updated')
  })

  it('does not call setFeedStyle for invalid values', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Feed Style'), { target: { value: 'invalid' } })
    expect(mockSetFeedStyle).not.toHaveBeenCalled()
  })

  it('enables Hacker News discussions and shows a toast', async () => {
    renderForm()
    fireEvent.click(screen.getByLabelText('Hacker News discussions'))
    expect(mockUpdateMyUser).toHaveBeenCalledWith('user-1', { hn_discussions: true })
    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Hacker News discussions updated')
    })
  })
})
