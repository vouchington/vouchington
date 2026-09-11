import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  dataPw?: string
  titleClassName?: string
}

const titleSizeClassPatterns = [
  /^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/\S+)?$/,
  /^text-\[(?:length:)?(?:-?\d*\.?\d+(?:px|r?em|ch|ex|lh|vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax|%)|calc\(.+\)|clamp\(.+\)|min\(.+\)|max\(.+\))\](?:\/\S+)?$/,
  /^text-\(length:[^)]+\)(?:\/\S+)?$/,
]

function hasBaseTitleSize(titleClassName?: string) {
  return (
    titleClassName
      ?.split(/\s+/)
      .some(className => titleSizeClassPatterns.some(pattern => pattern.test(className))) ?? false
  )
}

export function PageHeader({
  title,
  description,
  dataPw = 'page-header-title',
  titleClassName,
}: PageHeaderProps) {
  const defaultTitleSize = hasBaseTitleSize(titleClassName) ? 'text-2xl' : 'text-2xl sm:text-3xl'

  return (
    <div data-pw='page-header'>
      <h1
        data-pw={dataPw}
        className={cn(defaultTitleSize, 'font-bold', titleClassName)}
      >
        {title}
      </h1>
      {description && (
        <p
          data-pw='page-header-description'
          className='mt-1 text-sm text-muted-foreground'
        >
          {description}
        </p>
      )}
    </div>
  )
}
