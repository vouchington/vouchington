import { waitFor } from '@testing-library/react'

// Testing Library types every test-id match as HTMLElement, including svg icons.
function matchesFor(id: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-pw="${id}"]`)].flatMap(node =>
    node instanceof HTMLElement || node instanceof SVGElement ? [node as HTMLElement] : [],
  )
}

export function queryByPw(id: string): HTMLElement | null {
  const matches = matchesFor(id)
  if (matches.length > 1) {
    throw new Error(`Found multiple elements by: [data-pw="${id}"]`)
  }
  return matches[0] ?? null
}

export function getByPw(id: string): HTMLElement {
  const match = queryByPw(id)
  if (!match) {
    throw new Error(`Unable to find an element by: [data-pw="${id}"]`)
  }
  return match
}

export function findByPw(id: string): Promise<HTMLElement> {
  return waitFor(() => getByPw(id))
}
