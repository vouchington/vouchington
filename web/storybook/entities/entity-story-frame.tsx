import type { ComponentType, ReactNode } from 'react'
import { PageWithAside } from '@/components/page-with-aside'
import { Card } from '@/components/ui/card'

export function EntityStoryFrame({
  title,
  description,
  children,
  aside,
}: {
  title: string
  description?: string
  children: ReactNode
  aside?: ComponentType | ReactNode
}) {
  return (
    <main className='min-h-screen bg-background py-6 text-foreground'>
      <PageWithAside
        aside={aside}
        showFooter={false}
      >
        <div className='space-y-6'>
          <header className='space-y-2'>
            <h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
            {description ? (
              <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p>
            ) : null}
          </header>
          {children}
        </div>
      </PageWithAside>
    </main>
  )
}

export function EntityStorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
      {children}
    </section>
  )
}

export function StoryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className='space-y-3 p-4'>
      <h3 className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
        {title}
      </h3>
      {children}
    </Card>
  )
}

export function AsideStack({ children }: { children: ReactNode }) {
  return <div className='space-y-4'>{children}</div>
}

export function StoryGrid({ children }: { children: ReactNode }) {
  return <div className='grid gap-4 md:grid-cols-2'>{children}</div>
}
