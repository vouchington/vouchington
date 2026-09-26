import { checkTopicTypes, checkPostTypes } from './finite-enum-ripple-types.mts'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import type { FiniteEnumFiles, ReadTrackedFile, RoutedPage } from './finite-enum-ripple-model.mts'

const NON_TOPIC_ENTITY_ROUTE_SLUGS = new Set(['domain', 'url'])
const NON_TOPIC_COLLECTION_ROUTE_SLUGS = new Set(['domains', 'urls', 'web-search'])
const NON_POST_COLLECTION_ROUTE_SLUGS = new Set(['test-markdown-html'])

export function checkFiniteEnumRippleGuard(
  ctx: SharedContext,
  errors: string[],
  existingTrackedFiles = ctx.trackedFiles.filter(file => existsSync(join(ctx.repoRoot, file))),
): void {
  const files = collectFiniteEnumFiles(existingTrackedFiles)
  const readTracked = createTrackedFileReader(ctx)
  checkTopicTypes(errors, files, readTracked)
  checkPostTypes(errors, files, readTracked)
}

/** Classifies the already-existing tracked inventory once for every enum ripple check. */
export function collectFiniteEnumFiles(existingTrackedFiles: readonly string[]): FiniteEnumFiles {
  const files: FiniteEnumFiles = {
    existingFileSet: new Set(existingTrackedFiles),
    postCollectionPages: [],
    postCreatePages: [],
    postDetailPages: [],
    topicCollectionPages: [],
    topicComponentFiles: [],
    topicDetailPages: [],
  }
  for (const file of existingTrackedFiles) {
    const topicDetail = /^web\/app\/\(topics\)\/([^/]+)\/\[id\]\/(?:(.*)\/)?page\.tsx?$/.exec(file)
    if (topicDetail && !NON_TOPIC_ENTITY_ROUTE_SLUGS.has(topicDetail[1])) {
      files.topicDetailPages.push({
        file,
        isTopLevel: !topicDetail[2],
        slug: topicDetail[1],
      })
      continue
    }
    const postDetail = /^web\/app\/\(posts\)\/([^/]+)\/\[id\]\/(?:(.*)\/)?page\.tsx?$/.exec(file)
    if (postDetail) {
      files.postDetailPages.push({ file, isTopLevel: !postDetail[2], slug: postDetail[1] })
      continue
    }
    const postCreate = /^web\/app\/\(posts\)\/([^/]+)\/create\/page\.tsx?$/.exec(file)
    if (postCreate) files.postCreatePages.push({ file, isTopLevel: false, slug: postCreate[1] })

    const topicCollection = collectionSlug(file, 'topics')
    if (topicCollection && !NON_TOPIC_COLLECTION_ROUTE_SLUGS.has(topicCollection.slug)) {
      files.topicCollectionPages.push({ file, ...topicCollection })
    }
    const postCollection = collectionSlug(file, 'posts')
    if (postCollection && !NON_POST_COLLECTION_ROUTE_SLUGS.has(postCollection.slug)) {
      files.postCollectionPages.push({ file, ...postCollection })
    }
    if (/^web\/components\/[^/]+\/.*\.[cm]?[tj]sx?$/.test(file)) {
      files.topicComponentFiles.push(file)
    }
  }
  return files
}

export function createTrackedFileReader(ctx: SharedContext): ReadTrackedFile {
  const contents = new Map<string, string>()
  return file => {
    const cached = contents.get(file)
    if (cached !== undefined) return cached
    const content = ctx.readTrackedFile?.(file) ?? readFileSync(join(ctx.repoRoot, file), 'utf8')
    contents.set(file, content)
    return content
  }
}

export function collectionSlug(
  file: string,
  group: 'posts' | 'topics',
): Omit<RoutedPage, 'file'> | undefined {
  const prefix = `web/app/(${group})/`
  if (!file.startsWith(prefix) || !/\/page\.tsx?$/.test(file)) return undefined
  const rest = file.slice(prefix.length)
  const parts = rest.split('/')
  if (parts.length < 2 || parts[1] === '[id]') return undefined
  return { isTopLevel: parts.length === 2, slug: parts[0] }
}

export { checkTopicTypes, checkPostTypes }
