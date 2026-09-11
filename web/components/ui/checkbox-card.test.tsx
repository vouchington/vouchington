import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckboxCard } from './checkbox-card'

describe('CheckboxCard', () => {
  it('renders label and description', () => {
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={vi.fn<VitestLooseMock>()}
        label='My label'
        description='My description'
      />,
    )
    expect(screen.getByText('My label')).toBeDefined()
    expect(screen.getByText('My description')).toBeDefined()
    expect(screen.getByRole('checkbox')).toBeDefined()
  })

  it('reflects checked state', () => {
    render(
      <CheckboxCard
        id='test-cb'
        checked
        onCheckedChange={vi.fn<VitestLooseMock>()}
        label='My label'
      />,
    )
    expect(screen.getByRole('checkbox').getAttribute('data-state')).toBe('checked')
  })

  it('calls onCheckedChange when the checkbox is clicked', () => {
    const onChange = vi.fn<VitestLooseMock>()
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={onChange}
        label='My label'
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onCheckedChange when the label text is clicked', () => {
    const onChange = vi.fn<VitestLooseMock>()
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={onChange}
        label='My label'
      />,
    )
    fireEvent.click(screen.getByText('My label'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onCheckedChange when the description text is clicked', () => {
    const onChange = vi.fn<VitestLooseMock>()
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={onChange}
        label='My label'
        description='My description'
      />,
    )
    fireEvent.click(screen.getByText('My description'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not render description element when description is omitted', () => {
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={vi.fn<VitestLooseMock>()}
        label='My label'
      />,
    )
    expect(screen.queryByText('My description')).toBeNull()
  })

  it('does not call onCheckedChange when disabled', () => {
    const onChange = vi.fn<VitestLooseMock>()
    render(
      <CheckboxCard
        id='test-cb'
        checked={false}
        onCheckedChange={onChange}
        label='My label'
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
