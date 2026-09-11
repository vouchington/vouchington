import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingReviewTitle } from './landing-review-title'

describe('LandingReviewTitle', () => {
  it('marks an authored markdown excerpt when the authored title is blank', () => {
    render(
      <LandingReviewTitle
        review={{
          title: '   ',
          markdown: 'مراجعة عربية',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
        }}
      />,
    )

    const excerpt = screen.getByText('مراجعة عربية')
    expect(excerpt).toHaveAttribute('lang', 'ar')
    expect(excerpt).toHaveAttribute('dir', 'rtl')
  })
})
