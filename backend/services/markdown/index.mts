import {
  renderMarkdownToHtmlBatch as renderMarkdownToHtmlBatchNative,
  renderMarkdownToHtml as renderMarkdownToHtmlNative,
} from '@jongleberry/vurst-markdown'
import { replaceEntityMentions } from '@services/entity-links'
import { absolutizeSideloadImageSources } from '@modules/utils/absolute-sideload-html'
import { parseSigningKeys, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

type MarkdownRenderOptions = {
  allowHtml?: boolean
  nofollowLinks?: boolean
  proxyImages?: boolean
  imageProxySigningKeys?: string[]
}

type NormalizedRenderOptions = {
  allowHtml: boolean
  nofollowLinks: boolean
  proxyImages: boolean
  imageProxyUrlPrefix: string
  imageProxySigningKeys: string[]
}

// Parse once at module load time to avoid re-parsing on every render call.
let cachedSigningKeys: string[] | undefined

function getSigningKeys(): string[] {
  if (cachedSigningKeys !== undefined) return cachedSigningKeys
  const keys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
  cachedSigningKeys = keys
  return keys
}

function normalizeRenderOptions(options: MarkdownRenderOptions): NormalizedRenderOptions {
  return {
    allowHtml: options.allowHtml ?? false,
    nofollowLinks: options.nofollowLinks ?? true,
    proxyImages: options.proxyImages ?? true,
    imageProxyUrlPrefix: '/sideload/',
    imageProxySigningKeys: options.imageProxySigningKeys ?? getSigningKeys(),
  }
}

export async function renderMarkdownToHtml(
  text: string | null | undefined,
  options: MarkdownRenderOptions = {},
): Promise<string> {
  const normalized = typeof text === 'string' ? text.trim() : ''
  if (!normalized) return ''

  const normalizedOptions = normalizeRenderOptions(options)
  const rendered = (await renderMarkdownToHtmlNative(Buffer.from(normalized), normalizedOptions))
    .toString()
    .trim()
  return absolutizeSideloadImageSources(rendered)
}

export async function renderMarkdownToHtmlBatch(
  texts: string[],
  options: MarkdownRenderOptions = {},
): Promise<string[]> {
  if (texts.length === 0) return []

  const normalizedOptions = normalizeRenderOptions(options)
  const results = await renderMarkdownToHtmlBatchNative(
    texts.map(t => Buffer.from(typeof t === 'string' ? t.trim() : '')),
    normalizedOptions,
  )
  return results.map((buf: Buffer) => absolutizeSideloadImageSources(buf.toString().trim()))
}

async function renderMarkdown(
  text: string | null | undefined,
  options: MarkdownRenderOptions = {},
): Promise<string> {
  const html = await renderMarkdownToHtml(text, options)
  if (!html) return ''
  return replaceEntityMentions(html)
}

export default renderMarkdown
