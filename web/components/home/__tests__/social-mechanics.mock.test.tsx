import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { SocialMechanics } from '../social-mechanics'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

type Translate = ReturnType<typeof createTranslator>

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    MessagesSquare: () => null,
    Link2: () => null,
    Tag: () => null,
    Shield: () => null,
    List: () => null,
  }),
)

describe('SocialMechanics', () => {
  let t: Translate

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders all mechanic cards with correct links', () => {
    render(<SocialMechanics t={t} />)

    expect(screen.getByText('Flexible Forum')).toBeDefined()
    expect(screen.getByText('Topics as Votable Tags')).toBeDefined()
    expect(screen.getByText('Community-Curated Lists')).toBeDefined()

    const listLink = screen
      .getAllByRole('link')
      .find(link => link.getAttribute('href') === '/communities?has_list_items=true')
    expect(listLink).toBeDefined()
  })
})
