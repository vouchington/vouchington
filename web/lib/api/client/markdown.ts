'use client'

import { clientApi } from './instance'

interface MarkdownPreviewResponseBody {
  html: string
}

/**
 * POST /api/v1/markdown/preview
 *
 * Renders markdown to HTML using the server-side Rust comrak renderer.
 * Use for live preview in post and comment composers.
 *
 * Always renders in non-admin mode — previews for admin authors may
 * differ slightly from the final published rendering.
 */
export function previewMarkdown(
  markdown: string,
  options?: { signal?: AbortSignal },
): Promise<MarkdownPreviewResponseBody> {
  return clientApi.post<MarkdownPreviewResponseBody>(
    '/api/v1/markdown/preview',
    { markdown },
    { signal: options?.signal },
  )
}
