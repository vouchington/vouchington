import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiMessagesHydrator } from '../ui-messages-hydrator'
import { getMessagesPromise } from '../use-translations'

describe('UiMessagesHydrator', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('merges the catalog before rendering children', async () => {
    render(
      <UiMessagesHydrator
        locale='hydrator-test'
        catalog={{ nav: { home: 'Hydrated' } }}
      >
        <div data-testid='child'>ok</div>
      </UiMessagesHydrator>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('ok')
    await expect(getMessagesPromise('hydrator-test')).resolves.toEqual({
      nav: { home: 'Hydrated' },
    })
  })
})
