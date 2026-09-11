import { Children, Suspense, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Wraps RSC children in nested Suspense boundaries for sequential, jank-free loading.
 *
 * - The fallback is shown while the outermost (first) child is loading.
 * - If the first child has already resolved, no fallback is shown — even if later
 *   children are still loading. This is intentional: it prevents mid-page pop-in.
 * - Children always appear in order; a later child cannot render before an earlier one.
 */
export function SequentialSuspense({ children, fallback = null }: Props) {
  // oxlint-disable-next-line react/no-react-children -- sequential RSC loading needs React's opaque children handling.
  const elements = Children.toArray(children)
  if (elements.length === 0) return null

  // Build nested Suspense from inside out:
  // Suspense(fallback) → [Child1, Suspense(null) → [Child2, Suspense(null) → [Child3]]]
  let result: ReactNode = null
  for (let i = elements.length - 1; i >= 0; i--) {
    const boundary = i === 0 ? fallback : null
    result = (
      <Suspense fallback={boundary}>
        {elements[i]}
        {result}
      </Suspense>
    )
  }

  return result
}
