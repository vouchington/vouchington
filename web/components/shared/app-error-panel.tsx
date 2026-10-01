import Link from 'next/link'
import { Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AppErrorPanelVariant = 'global' | 'route'

interface AppErrorPanelSelectors {
  root?: string
  title?: string
  description?: string
  retry?: string
  home?: string
}

interface AppErrorPanelProps {
  status: number
  title: string
  description: string
  retryLabel: string
  homeLabel: string
  onRetry: () => void
  variant: AppErrorPanelVariant
  dataPw: AppErrorPanelSelectors
}

export function AppErrorPanel({
  status,
  title,
  description,
  retryLabel,
  homeLabel,
  onRetry,
  variant,
  dataPw: {
    root: rootPw = 'error-page',
    title: titlePw = 'error-page-title',
    description: descriptionPw = 'error-page-description',
    retry: retryPw = 'error-page-retry-button',
    home: homePw = 'error-page-home-link',
  },
}: AppErrorPanelProps) {
  const showRouteIcons = variant === 'route'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-center',
        variant === 'global' ? 'min-h-svh' : 'min-h-[50vh]',
      )}
      data-pw={rootPw}
    >
      <p className='text-6xl font-bold text-muted-foreground'>{status}</p>
      <h1
        className='mt-4 text-2xl font-semibold'
        data-pw={titlePw}
      >
        {title}
      </h1>
      <p
        className='mt-2 max-w-sm text-sm text-muted-foreground'
        data-pw={descriptionPw}
      >
        {description}
      </p>
      <div className='mt-8 flex flex-wrap justify-center gap-3'>
        <Button
          className='min-h-11'
          onClick={onRetry}
          data-pw={retryPw}
        >
          {showRouteIcons ? <RotateCcw className='h-4 w-4' /> : null}
          {retryLabel}
        </Button>
        <Button
          asChild
          variant='outline'
          className='min-h-11'
        >
          <Link
            href='/'
            prefetch={false}
            data-pw={homePw}
          >
            {showRouteIcons ? <Home className='h-4 w-4' /> : null}
            {homeLabel}
          </Link>
        </Button>
      </div>
    </div>
  )
}
