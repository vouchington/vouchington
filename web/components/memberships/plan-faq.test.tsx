import { beforeAll, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator, type Translator } from '@ts-shared/ui-messages'
import { PlanFAQ } from './plan-faq'
import { getPlanFaqItems } from './plan-faq-items'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('PlanFAQ', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders the section heading', () => {
    render(<PlanFAQ t={t} />)
    expect(screen.getByRole('heading', { name: 'Frequently Asked Questions' })).toBeDefined()
  })

  it('renders all FAQ questions', () => {
    render(<PlanFAQ t={t} />)
    for (const { question } of getPlanFaqItems(t)) {
      expect(screen.getByText(question)).toBeDefined()
    }
  })

  it('renders all FAQ answers', () => {
    render(<PlanFAQ t={t} />)
    for (const { answer } of getPlanFaqItems(t)) {
      expect(screen.getByText(answer)).toBeDefined()
    }
  })

  it('keeps FAQ answers mounted before interaction', () => {
    const { container } = render(<PlanFAQ t={t} />)

    for (const { answer } of getPlanFaqItems(t)) {
      expect(container).toHaveTextContent(answer)
    }
  })

  it('uses native disclosure controls for no-JS access', () => {
    const { container } = render(<PlanFAQ t={t} />)
    expect(container.querySelectorAll('details')).toHaveLength(getPlanFaqItems(t).length)
    expect(container.querySelectorAll('summary')).toHaveLength(getPlanFaqItems(t).length)
  })

  it('has at least 5 FAQ items', () => {
    expect(getPlanFaqItems(t).length).toBeGreaterThanOrEqual(5)
  })

  it('describes AI moderation rules without internal slot jargon or duplicated plan limits', () => {
    const copy = getPlanFaqItems(t)
      .flatMap(item => [item.question, item.answer])
      .join(' ')

    expect(copy).toContain('AI moderation rules')
    expect(copy).not.toMatch(/agent prompt slots|Plus members get 3|Pro members get 10/i)
  })
})
