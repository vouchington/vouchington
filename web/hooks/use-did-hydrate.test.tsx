import { render, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useDidHydrate } from './use-did-hydrate'

describe('useDidHydrate', () => {
  it('returns false during SSR and initial hydration before switching to true', async () => {
    const values: boolean[] = []
    function TestComponent() {
      const didHydrate = useDidHydrate()
      values.push(didHydrate)
      return <div>{String(didHydrate)}</div>
    }

    renderToString(<TestComponent />)
    expect(values).toEqual([false])

    values.length = 0
    const container = document.createElement('div')
    const ssrRoot = document.createElement('div')
    ssrRoot.textContent = 'false'
    container.append(ssrRoot)

    render(<TestComponent />, {
      container,
      hydrate: true,
    })

    await waitFor(() => expect(container.textContent).toBe('true'))
    expect(values).toEqual([false, true])
  })
})
