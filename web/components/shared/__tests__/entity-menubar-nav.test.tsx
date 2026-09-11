import type { MouseEventHandler, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EntityMenubarNav } from '../entity-menubar-nav'
import { consumePreservedScrollPathname } from '@/lib/navigation/scroll-preservation'

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
    consumePreservedScrollPathname('/__test_reset__')
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

    expect(consumePreservedScrollPathname('/target')).toBe(true)
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

    expect(consumePreservedScrollPathname('/target')).toBe(false)
  })
})
