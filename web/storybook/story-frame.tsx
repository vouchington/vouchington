import type { ReactNode } from 'react'

export function StoryFrame({
  children,
  width = 'max-w-3xl',
}: {
  children: ReactNode
  width?: string
}) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className={`mx-auto ${width}`}>{children}</div>
    </main>
  )
}
