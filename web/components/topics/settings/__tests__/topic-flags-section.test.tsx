import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TopicFlagsSection } from '../topic-flags-section'

function pw(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-pw="${id}"]`)
  if (!el) throw new Error(`missing [data-pw="${id}"]`)
  return el
}

describe('TopicFlagsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderSection(overrides: Partial<React.ComponentProps<typeof TopicFlagsSection>> = {}) {
    const props = {
      noindex: false,
      allowReviews: true,
      onFlagsSubmit: vi.fn<VitestLooseMock>(e => e.preventDefault()),
      setNoindex: vi.fn<VitestLooseMock>(),
      setAllowReviews: vi.fn<VitestLooseMock>(),
      flagsSaving: false,
      ...overrides,
    }
    const { container } = render(<TopicFlagsSection {...props} />)
    return { props, container }
  }

  it('renders both flag checkboxes', () => {
    const { container } = renderSection()
    expect(pw(container, 'topic-noindex')).toBeDefined()
    expect(pw(container, 'topic-allow-reviews')).toBeDefined()
  })

  it('toggling noindex calls setNoindex with the new value', () => {
    const { props, container } = renderSection({ noindex: false })
    fireEvent.click(pw(container, 'topic-noindex'))
    expect(props.setNoindex).toHaveBeenCalledWith(true)
  })

  it('toggling allow_reviews calls setAllowReviews with the new value', () => {
    const { props, container } = renderSection({ allowReviews: true })
    fireEvent.click(pw(container, 'topic-allow-reviews'))
    expect(props.setAllowReviews).toHaveBeenCalledWith(false)
  })

  it('submitting the form calls onFlagsSubmit', () => {
    const { props, container } = renderSection()
    fireEvent.click(pw(container, 'save-topic-flags'))
    expect(props.onFlagsSubmit).toHaveBeenCalled()
  })

  it('disables the submit button while saving', () => {
    const { container } = renderSection({ flagsSaving: true })
    expect(pw(container, 'save-topic-flags')).toHaveProperty('disabled', true)
  })
})
