import matter from 'gray-matter'

import type { PostType } from '@services/posts/types'

export type ArticleFrontmatter = {
  title?: string
  slug?: string
  post_type?: PostType
  topics?: string[]
}

export type ParsedArticle = {
  frontmatter: ArticleFrontmatter
  body: string
}

const COMPLETE_FRONTMATTER_BLOCK_REGEX = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

export function parseFrontmatter(content: string): ParsedArticle {
  if (content.startsWith('---') && !COMPLETE_FRONTMATTER_BLOCK_REGEX.test(content)) {
    return { frontmatter: {}, body: content }
  }
  const parsed = matter(content)
  const data = parsed.data
  const frontmatter: ArticleFrontmatter = {}
  if (typeof data.title === 'string') frontmatter.title = data.title
  if (typeof data.slug === 'string') frontmatter.slug = data.slug
  if ('post_type' in data) frontmatter.post_type = data.post_type as PostType
  if (Array.isArray(data.topics)) {
    frontmatter.topics = data.topics.filter((topic): topic is string => typeof topic === 'string')
  }
  return { frontmatter, body: parsed.content }
}

export function extractTitleFromMarkdown(body: string): string {
  const match = /^#\s+(.+)$/m.exec(body)
  return match ? match[1].trim() : ''
}
