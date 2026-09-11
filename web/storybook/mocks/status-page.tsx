import Link from 'next/link'
import { Home, Hash, MessageSquare, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StatusPageProps {
  status: number
  title: string
  description: string
}

// Storybook stub — the real StatusPage is an async Server Component (calls getTranslations(),
// which reaches next/headers). React 19 cannot render async components client-side, so this
// mirrors the real synchronous JSX/labels for visual coverage instead of translating them.
export function StatusPage({ status, title, description }: StatusPageProps) {
  return (
    <div className='flex min-h-[50vh] flex-col items-center justify-center py-16 text-center'>
      <p className='text-6xl font-bold text-muted-foreground'>{status}</p>
      <h1
        className='mt-4 text-2xl font-semibold'
        data-pw='status-page-title'
      >
        {title}
      </h1>
      <p
        data-pw='status-page-description'
        className='mt-2 max-w-sm text-sm text-muted-foreground'
      >
        {description}
      </p>
      <div className='mt-8 flex flex-wrap justify-center gap-3'>
        <Button
          asChild
          className='min-h-11'
        >
          <Link
            href='/'
            prefetch={false}
            data-pw='status-page-home-link'
          >
            <Home className='h-4 w-4' />
            Home
          </Link>
        </Button>
        <Button
          asChild
          variant='outline'
          className='min-h-11'
        >
          <Link
            href='/topics'
            prefetch={false}
            data-pw='status-page-topics-link'
          >
            <Hash className='h-4 w-4' />
            Topics
          </Link>
        </Button>
        <Button
          asChild
          variant='outline'
          className='min-h-11'
        >
          <Link
            href='/discussions'
            prefetch={false}
            data-pw='status-page-discussions-link'
          >
            <MessageSquare className='h-4 w-4' />
            Discussions
          </Link>
        </Button>
        <Button
          asChild
          variant='outline'
          className='min-h-11'
        >
          <Link
            href='/reviews'
            prefetch={false}
            data-pw='status-page-reviews-link'
          >
            <Star className='h-4 w-4' />
            Reviews
          </Link>
        </Button>
      </div>
    </div>
  )
}
