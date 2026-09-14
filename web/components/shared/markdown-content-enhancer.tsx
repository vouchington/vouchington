/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createPortal } from 'react-dom'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { isSideloadImageSrc } from '@/lib/utils/assert-proxied-image-src'
import { highlightCodeBlocks } from './markdown-code-block-highlighter'
import { appendUtm, isExternalHref, OUTBOUND_UTM } from '@/lib/url/utm'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import type { SafeHtmlFragment } from '@/lib/html/safe-html-fragment'
import type { MarkdownContentFeatures } from './markdown-content-features'

function appendWidthParam(src: string, width: number): string {
  const [path, query = ''] = src.split('?', 2)
  const params = new URLSearchParams(query)
  // If `w` is already set (e.g. by `buildSideloadImageUrl` upstream), preserve it —
  // a second `w=` would create ambiguous precedence under API Gateway query parsing.
  if (params.has('w')) return src
  params.set('w', String(width))
  return `${path}?${params.toString()}`
}

interface ImagePortal {
  id: string
  container: HTMLElement
  src: string
  alt: string
  width: number
  height: number
  original: HTMLImageElement
  previousDisplay: string
}

interface MarkdownContentEnhancerProps {
  html: SafeHtmlFragment
  className?: string
  features: MarkdownContentFeatures
  /** ISO 639-1 language code for the content. Sets the HTML lang attribute on the container. */
  lang?: string
}

/**
 * Client-side post-hydration enhancer for markdown-rendered HTML.
 *
 * The server-rendered HTML is emitted untouched (byte-identical with the SSR pass),
 * so crawlers and JS-disabled users see the full content on first paint.
 *
 * After hydration, a useEffect walks the rendered DOM and upgrades:
 * - <img> → next/image (with lazy-loading, unoptimized for same-origin sideload URLs)
 * - <pre><code class="language-*"> → Shiki-highlighted code blocks
 * - external <a> hrefs → outbound UTM-tagged URLs
 *
 * Only features explicitly set to `true` are run.
 */
export function MarkdownContentEnhancer({
  html,
  className,
  features,
  lang,
}: MarkdownContentEnhancerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const imageCleanupRef = useRef<(() => void) | null>(null)
  const [imagePortals, setImagePortals] = useState<ImagePortal[]>([])
  const shouldRewriteUtm = features.utm === true
  const innerHtml = useMemo(() => ({ __html: html }), [html])

  const setContainer = useMemo(
    () => (container: HTMLDivElement | null) => {
      imageCleanupRef.current?.()
      imageCleanupRef.current = null
      containerRef.current = container
      if (!container) return
      if (container.childNodes.length === 0 && html.length > 0) return
      const portals: ImagePortal[] = []
      const shouldEnhanceImages = features.images || features.eagerFirstImage

      // Image upgrade: replace <img> with next/image via React portals for lazy-loading.
      // We only insert a placeholder div and hide the original img — the actual next/image
      // is rendered via createPortal() in the component's return.
      if (shouldEnhanceImages) {
        const imgs = container.querySelectorAll<HTMLImageElement>('img')
        imgs.forEach((img, i) => {
          // Skip images inside truncated (line-clamp) containers — they won't be visible anyway.
          if (img.closest('[class*="line-clamp"]')) return

          const src = img.getAttribute('src') ?? ''
          if (!src) return

          const alt = img.getAttribute('alt') ?? ''
          // Prefer naturalWidth/naturalHeight (set once the image loads), fall back to
          // HTML attributes, then to safe defaults. next/image uses these to reserve
          // space at the correct aspect ratio; style={{ height: 'auto }} ensures the
          // rendered size is always correct regardless of the fallback values.
          const width = img.naturalWidth || parseInt(img.getAttribute('width') ?? '0', 10) || 640
          const height = img.naturalHeight || parseInt(img.getAttribute('height') ?? '0', 10) || 400
          // Sideload URLs are proxied through the image-resize Lambda, which
          // requires a `w` parameter. next/image is rendered `unoptimized` for these
          // (the Lambda already resizes), so Next does not add `?w=` automatically —
          // we append it here from the rendered width.
          const finalSrc = isSideloadImageSrc(src) ? appendWidthParam(src, width) : src
          const placeholder = document.createElement('div')
          img.parentNode?.insertBefore(placeholder, img)
          const previousDisplay = img.style.display
          img.style.display = 'none'

          portals.push({
            id: String(i),
            container: placeholder,
            src: finalSrc,
            alt,
            width,
            height,
            original: img,
            previousDisplay,
          })
        })
      }

      setImagePortals(portals)

      // Code block upgrade: Shiki syntax highlighting (lazy-loaded WASM).
      if (features.code) {
        highlightCodeBlocks(container).catch(Sentry.captureException)
      }

      if (shouldEnhanceImages) {
        imageCleanupRef.current = () => {
          portals.forEach(portal => {
            portal.original.style.display = portal.previousDisplay
            portal.container.remove()
          })
        }
      }
    },
    [html, features.code, features.images, features.eagerFirstImage],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || !shouldRewriteUtm) return

    // Outbound UTM tagging: rewrite external <a> hrefs so the destination's
    // analytics records voucha.ai as the referrer.
    const anchors = container.querySelectorAll<HTMLAnchorElement>('a[href]')
    anchors.forEach(anchor => {
      const href = anchor.getAttribute('href') ?? ''
      if (!isExternalHref(href) || anchor.hasAttribute('data-no-utm')) return
      anchor.href = appendUtm(href, OUTBOUND_UTM)
    })
  }, [html, shouldRewriteUtm])

  return (
    <>
      <div
        ref={setContainer}
        className={className}
        lang={lang}
        dir={getContentLanguageDir(lang)}
        // oxlint-disable-next-line react/no-danger -- html comes from backend markdown renderer/sanitizer
        dangerouslySetInnerHTML={innerHtml}
      />
      {imagePortals.map((portal, portalIndex) =>
        createPortal(
          <div style={{ position: 'relative', width: '100%' }}>
            {features.eagerFirstImage && portalIndex === 0 ? (
              <Image
                src={portal.src}
                alt={portal.alt}
                width={portal.width}
                height={portal.height}
                unoptimized
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            ) : (
              <Image
                src={portal.src}
                alt={portal.alt}
                width={portal.width}
                height={portal.height}
                unoptimized
                style={{ width: '100%', height: 'auto' }}
                loading='lazy'
                decoding='async'
              />
            )}
          </div>,
          portal.container,
          portal.id,
        ),
      )}
    </>
  )
}
