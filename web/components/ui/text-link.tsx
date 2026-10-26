import * as React from 'react'
import Link from 'next/link'

interface TextLinkProps extends Omit<React.ComponentPropsWithoutRef<'a'>, 'href'> {
  href: string
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
  ref?: React.Ref<HTMLAnchorElement>
}

function isInternalPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}

/**
 * Shared link for hrefs that do not open a new tab: in-app paths use client-side navigation,
 * while mailto:, downloads and absolute URLs render a plain anchor. Callers always pass their own
 * `data-pw`; use `ExternalLink` for links that open in a new tab.
 */
function TextLink({
  href,
  prefetch,
  replace,
  scroll,
  download,
  ref,
  children,
  ...props
}: TextLinkProps) {
  if (isInternalPath(href) && download === undefined) {
    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch}
        replace={replace}
        scroll={scroll}
        data-pw='text-link'
        {...props}
      >
        {children}
      </Link>
    )
  }

  return (
    <a
      ref={ref}
      href={href}
      download={download}
      data-pw='text-link-anchor'
      {...props}
    >
      {children}
    </a>
  )
}
TextLink.displayName = 'TextLink'

export { TextLink }
