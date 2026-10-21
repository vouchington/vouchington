import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import meta, { Empty, Incoming, LoadFailure, Owner, Saving } from '../household-invitations.stories'

describe('household invitation stories', () => {
  it('exposes invitee actions and owner creation as separate states', () => {
    const incoming = renderToStaticMarkup(
      createElement(meta.component, { ...meta.args, ...Incoming.args }),
    )
    const owner = renderToStaticMarkup(
      createElement(meta.component, { ...meta.args, ...Owner.args }),
    )
    expect(incoming).toContain('Accept')
    expect(incoming).toContain('Decline')
    expect(incoming).not.toContain('Send invitation')
    expect(owner).toContain('Send invitation')
    expect(owner).toContain('Revoke invitation')
    expect(owner).not.toContain('>Accept<')
  })
  it('shows empty, failed, and disabled states', () => {
    const empty = renderToStaticMarkup(
      createElement(meta.component, { ...meta.args, ...Empty.args }),
    )
    const failure = renderToStaticMarkup(
      createElement(meta.component, { ...meta.args, ...LoadFailure.args }),
    )
    const saving = renderToStaticMarkup(
      createElement(meta.component, { ...meta.args, ...Saving.args }),
    )
    expect(empty).toContain('No pending invitations.')
    expect(failure).toContain('Invitations could not be loaded.')
    expect(failure).toContain('Retry')
    expect(saving).toContain('disabled=""')
  })
})
