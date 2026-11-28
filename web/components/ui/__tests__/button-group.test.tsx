import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ButtonGroup } from '@/components/ui/button-group'

describe('ButtonGroup', () => {
  it('renders a div with role=group', () => {
    const { container } = render(<ButtonGroup />)
    const el = container.firstElementChild
    expect(el?.getAttribute('role')).toBe('group')
    expect(el?.tagName).toBe('DIV')
  })

  it('forwards additional props', () => {
    const { container } = render(<ButtonGroup data-pw='test-group' />)
    const el = container.firstElementChild
    expect(el?.getAttribute('data-pw')).toBe('test-group')
  })

  it('renders children', () => {
    const { getByText } = render(
      <ButtonGroup>
        <button type='button'>Mute</button>
        <button type='button'>Block</button>
      </ButtonGroup>,
    )
    expect(getByText('Mute')).toBeInTheDocument()
    expect(getByText('Block')).toBeInTheDocument()
  })
})
