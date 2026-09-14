import type { MouseEventHandler, ReactNode } from 'react'
import { configure, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityMenubarNav } from '../entity-menubar-nav'
import { consumePreservedScrollPosition } from '@/lib/navigation/scroll-preservation'

configure({ testIdAttribute: 'data-pw' })

interface LinkStubProps {
  children: ReactNode
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  scroll?: boolean
  'data-pw': string
}

function LinkStub({ children, href, onClick, scroll: _scroll, 'data-pw': dataPw }: LinkStubProps) {
  return (
    <a
      href={href}
      onClick={event => {
        event.preventDefault()
        onClick?.(event)
      }}
      data-pw={dataPw}
    >
      {children}
    </a>
  )
}

describe('EntityMenubarNav scroll preservation', () => {
  beforeEach(() => {
    consumePreservedScrollPosition('/__test_reset__')
  })

  it('records preserve intent for opted-in internal links', () => {
    render(
      <EntityMenubarNav
        ariaLabel='Example navigation'
        preserveScrollOnNavigation
        items={[
          {
            key: 'direct',
            content: (
              <LinkStub
                href='/target'
                data-pw='direct-link'
              >
                Direct
              </LinkStub>
            ),
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByText('Direct'))

    expect(consumePreservedScrollPosition('/target')).not.toBeNull()
  })

  it('does not record preserve intent when the nav is not opted in', () => {
    render(
      <EntityMenubarNav
        ariaLabel='Settings navigation'
        items={[
          {
            key: 'direct',
            content: (
              <LinkStub
                href='/target'
                data-pw='direct-link'
              >
                Direct
              </LinkStub>
            ),
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByText('Direct'))

    expect(consumePreservedScrollPosition('/target')).toBeNull()
  })

  it('keeps focus from returning to the trigger after a portaled preserve-scroll link', () => {
    render(
      <EntityMenubarNav
        ariaLabel='Example navigation'
        preserveScrollOnNavigation
        items={[
          {
            key: 'dropdown',
            content: <button type='button'>Open</button>,
            dropdownItems: [
              {
                key: 'target',
                content: (
                  <LinkStub
                    href='/target'
                    data-pw='dropdown-link'
                  >
                    Target
                  </LinkStub>
                ),
              },
            ],
          },
        ]}
      />,
    )

    const trigger = screen.getByText('Open')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const triggerFocus = vi.spyOn(trigger, 'focus')
    fireEvent.click(screen.getByTestId('dropdown-link'))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(consumePreservedScrollPosition('/target')).not.toBeNull()
    expect(triggerFocus).not.toHaveBeenCalled()
  })
})
