export interface MarkdownContentFeatures {
  /** Upgrade <pre><code class="language-*"> blocks with Shiki syntax highlighting. */
  code?: boolean
  /** Replace <img> elements with next/image for lazy-loading. */
  images?: boolean
  /** Mark the first <img> in the body as priority (eager). Use on post detail pages where the first body image may be above the fold. */
  eagerFirstImage?: boolean
  /** Rewrite external <a> hrefs with outbound UTM parameters after hydration. */
  utm?: boolean
}

export const MARKDOWN_CONTENT_FEATURES_UTM: MarkdownContentFeatures = { utm: true }

export const MARKDOWN_CONTENT_FEATURES_RICH: MarkdownContentFeatures = {
  code: true,
  images: true,
  utm: true,
}

export const MARKDOWN_CONTENT_FEATURES_RICH_EAGER: MarkdownContentFeatures = {
  code: true,
  images: true,
  eagerFirstImage: true,
  utm: true,
}
