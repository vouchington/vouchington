import { Component, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from 'react'

export interface RatchetedComponent {
  key: string
  component: unknown
  props?: Record<string, unknown>
}

interface ErrorBoundaryState {
  error: unknown
}

class ComponentErrorBoundary extends Component<
  { componentKey: string; children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { componentKey: string; children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(
      '[ComponentStoryRatchet] render error:',
      this.props.componentKey,
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
      return (
        <div
          className='rounded-md border border-dashed bg-muted/40 px-3 py-2'
          role='alert'
        >
          <p className='font-mono text-xs'>{this.props.componentKey}</p>
          <p className='mt-1 text-xs text-muted-foreground'>Rendered fallback state</p>
          <p className='mt-1 font-mono text-xs text-muted-foreground'>{message}</p>
        </div>
      )
    }

    return this.props.children
  }
}

function RatchetedComponentPreview({ item }: { item: RatchetedComponent }) {
  const Preview = item.component as ComponentType<Record<string, unknown>>

  return (
    <ComponentErrorBoundary componentKey={item.key}>
      <Suspense
        fallback={
          <div className='rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs'>
            {item.key}
          </div>
        }
      >
        <div className='rounded-md border bg-card p-3'>
          <p className='mb-2 break-all font-mono text-xs text-muted-foreground'>{item.key}</p>
          <Preview {...(item.props ?? {})} />
        </div>
      </Suspense>
    </ComponentErrorBoundary>
  )
}

export function ComponentStoryRatchetGrid({
  title,
  components,
}: {
  title: string
  components: RatchetedComponent[]
}) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-5xl space-y-4'>
        <h1 className='text-2xl font-bold'>{title}</h1>
        <div className='grid gap-3 text-sm md:grid-cols-2'>
          {components.map(item => (
            <RatchetedComponentPreview
              key={item.key}
              item={item}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
