import * as React from 'react'
import { cn } from '@/lib/utils'

function isSafeHref(href: string): boolean {
  try {
    const { protocol } = new URL(href, 'https://voucha.com')
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export interface ExternalLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  href: string
  ugc?: boolean
  ref?: React.Ref<HTMLAnchorElement>
}

function ExternalLink({
  href,
  ugc = false,
  className,
  children,
  ref,
  target = '_blank',
  rel,
  ...props
}: ExternalLinkProps) {
  const relValue =
    rel ?? (ugc ? 'nofollow ugc noopener noreferrer' : 'nofollow noopener noreferrer')

  if (!isSafeHref(href)) {
    // Strip anchor-only props that are invalid on <span>. `target` and `rel` are already
    // removed via destructuring above; only `download`, `hrefLang`, `referrerPolicy`,
    // and `ping` need to be excluded here.
    const {
      download: _download,
      hrefLang: _hrefLang,
      referrerPolicy: _referrerPolicy,
      ping: _ping,
      ...spanProps
    } = props as React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>
    return (
      <span
        className={cn(className)}
        {...spanProps}
      >
        {children}
      </span>
    )
  }

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={relValue}
      className={cn(className)}
      data-pw='external-link'
      {...props}
    >
      {children}
    </a>
  )
}
ExternalLink.displayName = 'ExternalLink'

export { ExternalLink }
