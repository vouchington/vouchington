import { Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'

interface RenderAuthGatedStreamingOptions<T> {
  isAuthenticated: boolean
  dataPromise: Promise<T>
  renderLoggedOut: (data: T) => ReactNode
  renderStreaming: ReactNode
  errorFallback?: ReactNode
  loadingFallback?: ReactNode
}

const DEFAULT_ERROR_FALLBACK = <div className='text-sm text-destructive'>Error loading tags</div>
const DEFAULT_LOADING_FALLBACK = <div className='text-sm text-muted-foreground'>Loading...</div>

export async function renderAuthGatedStreaming<T>({
  isAuthenticated,
  dataPromise,
  renderLoggedOut,
  renderStreaming,
  errorFallback = DEFAULT_ERROR_FALLBACK,
  loadingFallback = DEFAULT_LOADING_FALLBACK,
}: RenderAuthGatedStreamingOptions<T>): Promise<ReactNode> {
  if (!isAuthenticated) {
    return renderLoggedOut(await dataPromise)
  }

  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback}>{renderStreaming}</Suspense>
    </ErrorBoundary>
  )
}
