import { describe, expect, it, vi } from 'vitest'
import React, { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionFields, type DiscussionCategoryEntry } from '../discussion-fields'

vi.mock(
  import('../topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({
        onChange,
        value,
        label,
        inputRef,
      }: {
        onChange: (id: string, name: string) => void
        value: string | null
        label: string
        inputRef?: (element: HTMLInputElement | null) => void
        [k: string]: unknown
      }) => (
        <div data-testid='topic-autocomplete'>
          <input
            ref={inputRef}
            aria-label={`Topic ${label || 'new'}`}
          />
          <span data-testid='autocomplete-label'>{label}</span>
          <button
            type='button'
            data-testid='autocomplete-change'
            data-value={value}
            onClick={() => onChange('new-topic-id', 'New Topic')}
          >
            Change Topic
          </button>
        </div>
      ),
    }) as unknown as typeof import('../topic-autocomplete'),
)

function makeEntry(overrides: Partial<DiscussionCategoryEntry> = {}): DiscussionCategoryEntry {
  return {
    key: crypto.randomUUID(),
    topicId: 'topic-1',
    topicName: 'Test Topic',
    hashtag: '',
    ...overrides,
  }
}

const EMPTY_CATEGORIES: DiscussionCategoryEntry[] = []

function Wrapper({
  initialCategories = EMPTY_CATEGORIES,
}: {
  initialCategories?: DiscussionCategoryEntry[]
}) {
  const [categories, setCategories] = React.useState<DiscussionCategoryEntry[]>(initialCategories)
  const pendingFocusIndexRef = useRef<number | null>(null)

  function handleCategoryChange(index: number, id: string, name: string) {
    setCategories(prev =>
      prev.map((c, i) => (i === index ? { ...c, topicId: id, topicName: name } : c)),
    )
  }

  function handleHashtagChange(index: number, hashtag: string) {
    setCategories(prev => prev.map((c, i) => (i === index ? { ...c, hashtag } : c)))
  }

  function addCategory() {
    pendingFocusIndexRef.current = categories.length
    setCategories(prev => [
      ...prev,
      { key: crypto.randomUUID(), topicId: '', topicName: '', hashtag: '' },
    ])
  }

  function removeCategory(index: number) {
    setCategories(prev => prev.filter((_, i) => i !== index))
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= categories.length) return
    setCategories(prev => {
      const updated = [...prev]
      const a = updated[index]!
      const b = updated[next]!
      updated[index] = b
      updated[next] = a
      return updated
    })
  }

  return (
    <DiscussionFields
      categories={categories}
      onCategoryChange={handleCategoryChange}
      onHashtagChange={handleHashtagChange}
      onAddCategory={addCategory}
      onRemoveCategory={removeCategory}
      onMoveCategory={moveCategory}
      pendingFocusIndexRef={pendingFocusIndexRef}
    />
  )
}

describe('DiscussionFields', () => {
  it('renders Add Category button with no categories', () => {
    render(<Wrapper />)
    expect(screen.getByText('Add Category')).toBeDefined()
    expect(screen.queryAllByTestId('topic-autocomplete')).toHaveLength(0)
  })

  it('renders pre-seeded category row', () => {
    render(<Wrapper initialCategories={[makeEntry({ topicName: 'My Topic' })]} />)
    expect(screen.getByText('My Topic')).toBeDefined()
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(1)
  })

  it('adds a new row on Add Category click', () => {
    render(<Wrapper initialCategories={[makeEntry()]} />)
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(1)
    fireEvent.click(screen.getByText('Add Category'))
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(2)
  })

  it('removes a row on remove button click when multiple rows exist', () => {
    render(
      <Wrapper
        initialCategories={[
          makeEntry({ key: 'k1', topicName: 'Alpha' }),
          makeEntry({ key: 'k2', topicName: 'Beta' }),
        ]}
      />,
    )
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(2)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove category' })
    fireEvent.click(removeButtons[0]!)
    expect(screen.getAllByTestId('topic-autocomplete')).toHaveLength(1)
  })

  it('shows remove button even for a single row (allows removing to zero)', () => {
    render(<Wrapper initialCategories={[makeEntry()]} />)
    expect(screen.getByRole('button', { name: 'Remove category' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove category' }))
    expect(screen.queryAllByTestId('topic-autocomplete')).toHaveLength(0)
  })

  it('disables Move Up on first row', () => {
    render(
      <Wrapper
        initialCategories={[
          makeEntry({ key: 'k1', topicName: 'Alpha' }),
          makeEntry({ key: 'k2', topicName: 'Beta' }),
        ]}
      />,
    )
    const [firstUp, secondUp] = screen.getAllByRole('button', { name: 'Move category up' })
    expect(firstUp).toBeDisabled()
    expect(secondUp).not.toBeDisabled()
  })

  it('disables Move Down on last row', () => {
    render(
      <Wrapper
        initialCategories={[
          makeEntry({ key: 'k1', topicName: 'Alpha' }),
          makeEntry({ key: 'k2', topicName: 'Beta' }),
        ]}
      />,
    )
    const [firstDown, secondDown] = screen.getAllByRole('button', { name: 'Move category down' })
    expect(firstDown).not.toBeDisabled()
    expect(secondDown).toBeDisabled()
  })

  it('moves rows on up/down click', () => {
    render(
      <Wrapper
        initialCategories={[
          makeEntry({ key: 'k1', topicName: 'Alpha' }),
          makeEntry({ key: 'k2', topicName: 'Beta' }),
        ]}
      />,
    )
    const labels = () =>
      screen.getAllByTestId('autocomplete-label').map((el: HTMLElement) => el.textContent)

    expect(labels()).toEqual(['Alpha', 'Beta'])
    const [firstDownBtn] = screen.getAllByRole('button', { name: 'Move category down' })
    fireEvent.click(firstDownBtn!)
    expect(labels()).toEqual(['Beta', 'Alpha'])
  })

  it('moves rows up on up button click', () => {
    render(
      <Wrapper
        initialCategories={[
          makeEntry({ key: 'k1', topicName: 'Alpha' }),
          makeEntry({ key: 'k2', topicName: 'Beta' }),
        ]}
      />,
    )
    const labels = () =>
      screen.getAllByTestId('autocomplete-label').map((el: HTMLElement) => el.textContent)

    expect(labels()).toEqual(['Alpha', 'Beta'])
    const [, secondUpBtn] = screen.getAllByRole('button', { name: 'Move category up' })
    fireEvent.click(secondUpBtn!)
    expect(labels()).toEqual(['Beta', 'Alpha'])
  })

  it('updates category on autocomplete change', () => {
    render(<Wrapper initialCategories={[makeEntry({ key: 'k1', topicName: 'Alpha' })]} />)
    const changeBtn = screen.getByTestId('autocomplete-change')
    fireEvent.click(changeBtn)
    expect(screen.getByText('New Topic')).toBeDefined()
  })

  it('focuses the newly added category input', () => {
    render(<Wrapper initialCategories={[makeEntry()]} />)
    fireEvent.click(screen.getByText('Add Category'))
    expect(screen.getByRole('textbox', { name: 'Topic new' })).toHaveFocus()
  })
})
