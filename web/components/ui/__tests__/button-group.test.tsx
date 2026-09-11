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

  it('defaults to horizontal orientation (flex-row flex-wrap)', () => {
    const { container } = render(<ButtonGroup />)
    const el = container.firstElementChild
    expect(el?.className).toContain('flex-row')
    expect(el?.className).toContain('flex-wrap')
    expect(el?.className).toContain('gap-2')
  })

  it('applies vertical orientation classes', () => {
    const { container } = render(<ButtonGroup orientation='vertical' />)
    const el = container.firstElementChild
    expect(el?.className).toContain('flex-col')
    expect(el?.className).toContain('items-stretch')
  })

  it('forwards className and additional props', () => {
    const { container } = render(
      <ButtonGroup
        className='mt-3'
        data-pw='test-group'
      />,
    )
    const el = container.firstElementChild
    expect(el?.className).toContain('mt-3')
    expect(el?.getAttribute('data-pw')).toBe('test-group')
  })

  it('renders children', () => {
    const { getByText } = render(
      <ButtonGroup>
        <button type='button'>Mute</button>
        <button type='button'>Block</button>
      </ButtonGroup>,
    )
    expect(getByText('Mute')).toBeDefined()
    expect(getByText('Block')).toBeDefined()
  })
})
