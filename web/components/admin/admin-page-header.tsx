import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  children?: ReactNode
  /** Overrides the `data-pw` on the `<h1>` title only; defaults to `'admin-page-header-title'`. */
  dataPw?: string
  description?: string
  title: string
}

export function AdminPageHeader({
  children,
  dataPw = 'admin-page-header-title',
  description,
  title,
}: AdminPageHeaderProps) {
  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <h1
          data-pw={dataPw}
          className='text-xl font-semibold text-foreground sm:text-2xl'
        >
          {title}
        </h1>
        {description ? <p className='mt-1 text-sm text-muted-foreground'>{description}</p> : null}
      </div>
      {children ? <div className='flex flex-wrap items-center gap-2'>{children}</div> : null}
    </div>
  )
}
