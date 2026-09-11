import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PostDefaultSelect } from './post-default-select'

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

describe('PostDefaultSelect selector props', () => {
  it('passes trigger and option data-pw values to rendered select parts', () => {
    const { container } = render(
      <PostDefaultSelect
        disabled={false}
        id='post-default'
        label='Post default'
        value='public'
        onChange={vi.fn<VitestLooseMock>()}
        options={[
          { label: 'Public', value: 'public' },
          { label: 'Private', value: 'private' },
        ]}
        dataPw={{
          trigger: 'post-default-select-trigger',
          options: {
            public: 'post-default-select-option-public',
            private: 'post-default-select-option-private',
          },
        }}
      />,
    )

    expect(container.querySelector('[data-pw="post-default-select-trigger"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="post-default-select-option-public"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="post-default-select-option-private"]')).not.toBeNull()
  })
})
