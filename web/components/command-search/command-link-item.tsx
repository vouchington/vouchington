/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- dataPw is a static prop passed from callers with literal values; ast-grep bans dynamic data-pw but this is a safe prop passthrough. */
'use client'

import { useRef } from 'react'
import { CommandItem } from '@/components/ui/command'
import { TextLink } from '@/components/ui/text-link'
import { PostContentText, type PostContentTextValue } from '@/components/posts/post-content-text'
import { RssFeedItemTitle } from '@/components/rss-feed-items/rss-feed-item-title'
import { ExternalLink } from '@/components/ui/external-link'

type InteractionKind = 'keyboard' | 'plain' | 'modified'

export type CommandItemLabel =
  | { kind: 'ui-text'; text: string }
  | { kind: 'post-content'; content: PostContentTextValue; fallback: string }
  | {
      kind: 'rss-item-title'
      title: string | null
      detectedLanguage: string | null
      fallback: string
    }

interface CommandLinkItemProps {
  href: string
  dataPw?: string
  /** Must be set explicitly — omitting it silently routes external URLs through router.push. */
  external: boolean
  label: CommandItemLabel
  sublabel: string
  onOpenChange: (open: boolean) => void
  /** Not called when external=true — external links navigate through the native anchor. */
  pushRoute?: (href: string) => void
}

export function CommandLinkItem({
  href,
  dataPw,
  external,
  label,
  sublabel,
  onOpenChange,
  pushRoute,
}: CommandLinkItemProps) {
  const interactionRef = useRef<InteractionKind>('keyboard')
  const externalAnchorRef = useRef<HTMLAnchorElement>(null)

  function captureClickModifier(e: React.MouseEvent) {
    const isModified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    if (isModified) {
      // Let the browser open a new tab natively; onSelect will no-op.
      interactionRef.current = 'modified'
    } else {
      interactionRef.current = 'plain'
      if (!external) {
        // Prevent Next/link from navigating — let onSelect drive SPA push.
        e.preventDefault()
      }
      // External: anchor's target="_blank" opens the new tab; no preventDefault needed.
    }
  }

  function handleSelect() {
    const kind = interactionRef.current
    interactionRef.current = 'keyboard'

    // Modified clicks (Cmd/Ctrl/middle) keep the dialog open so the user can keep clicking results.
    // Plain clicks close it — the user has committed to a destination.
    if (kind === 'modified') return

    if (external) {
      if (kind === 'keyboard') {
        externalAnchorRef.current?.click()
        return
      }
    } else {
      pushRoute?.(href)
    }
    onOpenChange(false)
  }

  const labelContent =
    label.kind === 'post-content' ? (
      <PostContentText
        as='span'
        className='font-medium'
        content={label.content}
        fallback={label.fallback}
      />
    ) : label.kind === 'rss-item-title' ? (
      <RssFeedItemTitle
        className='font-medium'
        title={label.title}
        detectedLanguage={label.detectedLanguage}
        fallback={label.fallback}
      />
    ) : (
      <span className='font-medium'>{label.text}</span>
    )

  const content = (
    <div className='flex flex-col'>
      {labelContent}
      <span className='text-xs text-muted-foreground'>{sublabel}</span>
    </div>
  )

  if (external) {
    return (
      <CommandItem
        asChild
        data-pw={dataPw}
        onSelect={handleSelect}
      >
        <ExternalLink
          data-pw={dataPw}
          ref={externalAnchorRef}
          href={href}
          rel='noopener noreferrer'
          onClick={captureClickModifier}
        >
          {content}
        </ExternalLink>
      </CommandItem>
    )
  }

  return (
    <CommandItem
      asChild
      data-pw={dataPw}
      onSelect={handleSelect}
    >
      <TextLink
        data-pw={dataPw}
        href={href}
        // Search lists many results; opt out of hover prefetch to avoid wasted bandwidth.
        prefetch={false}
        onClick={captureClickModifier}
      >
        {content}
      </TextLink>
    </CommandItem>
  )
}
