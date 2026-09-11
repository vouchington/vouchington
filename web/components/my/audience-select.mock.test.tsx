import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AudienceSelect } from './audience-select'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({
        children,
        value,
        ...props
      }: {
        children: ReactNode
        value: string
        [key: string]: unknown
      }) => (
        <div
          data-value={value}
          {...props}
        >
          {children}
        </div>
      ),
      SelectTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('AudienceSelect selector props', () => {
  it('passes trigger and option data-pw values to rendered select parts', () => {
    const { container } = render(
      <AudienceSelect
        id='audience'
        label='Audience'
        value='everyone'
        onChange={vi.fn<VitestLooseMock>()}
        dataPw={{
          trigger: 'audience-select-trigger',
          options: {
            everyone: 'audience-select-option-everyone',
            mutual_followers: 'audience-select-option-mutual-followers',
          },
        }}
      />,
    )

    expect(container.querySelector('[data-pw="audience-select-trigger"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="audience-select-option-everyone"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="audience-select-option-mutual-followers"]'),
    ).not.toBeNull()
  })
})
