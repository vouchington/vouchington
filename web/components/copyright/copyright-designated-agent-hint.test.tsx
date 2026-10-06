import { configure, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CopyrightDesignatedAgentHint,
  CopyrightTargetNotFound,
} from './copyright-designated-agent-hint'

configure({ testIdAttribute: 'data-pw' })

describe('CopyrightDesignatedAgentHint', () => {
  it('points to the form, not to email, while no designated agent is published', () => {
    render(<CopyrightDesignatedAgentHint />)

    const hint = screen.getByTestId('copyright-designated-agent-hint')
    expect(hint).toHaveTextContent(/use this form to file your notice/i)
    expect(hint).not.toHaveTextContent(/e-?mail/i)
    expect(screen.getByRole('link', { name: 'designated agent status' })).toHaveAttribute(
      'href',
      '/copyright/designated-agent',
    )
  })

  it('offers the email route once a designated agent is published', () => {
    render(<CopyrightDesignatedAgentHint agentPublished />)

    expect(screen.getByTestId('copyright-designated-agent-hint')).toHaveTextContent(
      /email your notice to our designated agent/i,
    )
    expect(screen.getByRole('link', { name: 'designated agent' })).toHaveAttribute(
      'href',
      '/copyright/designated-agent',
    )
  })
})

describe('CopyrightTargetNotFound', () => {
  it('points to the form, not to email, while no designated agent is published', () => {
    render(<CopyrightTargetNotFound />)

    const alert = screen.getByTestId('copyright-target-not-found')
    expect(alert).toHaveTextContent(/could not find hosted material/i)
    expect(alert).toHaveTextContent(/have not published a designated agent yet/i)
    expect(alert).not.toHaveTextContent(/e-?mail/i)
    expect(screen.getByRole('link', { name: 'designated agent status' })).toHaveAttribute(
      'href',
      '/copyright/designated-agent',
    )
  })

  it('offers the email route once a designated agent is published', () => {
    render(<CopyrightTargetNotFound agentPublished />)

    expect(screen.getByTestId('copyright-target-not-found')).toHaveTextContent(
      /email your notice to our designated agent/i,
    )
  })
})
