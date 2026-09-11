import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SourceSection } from '../source-section'

describe('SourceSection', () => {
  it('underlines the sources link at rest', () => {
    render(
      <SourceSection
        onSubmit={vi.fn<(event: React.FormEvent<HTMLFormElement>) => void>()}
        rssFeed={null}
        saving={false}
      />,
    )

    expect(screen.getByRole('link', { name: '/sources' })).toHaveClass('underline')
  })
})
