import { describe, expect, it } from 'vitest'

import {
  parsePostDetailRouteFactoryArgs,
  parsePostRouteConfigEntries,
  parsePostSlugToType,
  parseTopicRouteConfigEntries,
  parseTopicRouteFactoryArgs,
  parseTopicTypeEntries,
} from '../finite-enum-ripple-parsers.mts'

describe('finite-enum-ripple-parsers', () => {
  it('parses topicTypes entries without indentation coupling', () => {
    const content = [
      'export const topicTypes = {',
      "    topic: { slug: 'topic', slugPlural: 'topics', sitemap: true },",
      '    card: {',
      "      slug: 'card',",
      "      slugPlural: 'cards',",
      '      sitemap: true,',
      '    },',
      '} as const satisfies Record<string, TopicTypeEntry>',
    ].join('\n')

    expect(parseTopicTypeEntries(content, 'web/types/topics.ts')).toEqual([
      { value: 'topic', slug: 'topic', slugPlural: 'topics' },
      { value: 'card', slug: 'card', slugPlural: 'cards' },
    ])
  })

  it('reports missing topicTypes properties from compact object syntax', () => {
    expect(() =>
      parseTopicTypeEntries(
        "export const topicTypes = { topic: { slug: 'topic', sitemap: true } } as const",
        'web/types/topics.ts',
      ),
    ).toThrow('web/types/topics.ts: topicTypes.topic is missing slugPlural')
  })

  it('parses finite enum route config objects and factory calls structurally', () => {
    const content = [
      'export const postRouteConfigs = {',
      "  'blog-posts': {",
      "    title: 'blog-posts',",
      "    description: 'blog-posts',",
      '    postTypes: [',
      "      'blog_post',",
      "      'story',",
      '    ] as PostType[],',
      "    pluralPath: 'blog-posts',",
      "    singularPath: 'blog-post',",
      '  },',
      '  discussion: {',
      "    title: 'discussion',",
      "    description: 'discussion',",
      '    postTypes: undefined,',
      "    pluralPath: 'discussion',",
      "    singularPath: 'discussion',",
      '  },',
      '}',
      '',
      'export const topicRouteConfigs = {',
      '  topics: {',
      "    title: 'topic',",
      "    description: 'topic',",
      '    spendingCategory: true,',
      '    topicTypes: [',
      "      'topic',",
      "      'card',",
      '    ] as TopicTypes[],',
      "    pluralPath: 'topics',",
      "    singularPath: 'topic',",
      '  },',
      "  'cards': {",
      "    title: 'card',",
      "    description: 'card',",
      '    topicTypes: undefined,',
      "    pluralPath: 'cards',",
      "    singularPath: 'card',",
      '  },',
      '}',
    ].join('\n')
    const postFactoryContent = [
      'const { default: PostPage } = createPostDetailPage(',
      "  'discussion',",
      "  'discussion',",
      ')',
    ].join('\n')
    const topicFactoryContent = "const { default: TopicPage } = createTopicPostsPage('topic')"

    expect(parsePostRouteConfigEntries(content, 'web/lib/route-configs.ts')).toEqual([
      {
        key: 'blog-posts',
        body: expect.anything(),
        postTypes: ['blog_post', 'story'],
        pluralPath: 'blog-posts',
        singularPath: 'blog-post',
      },
      {
        key: 'discussion',
        body: expect.anything(),
        postTypes: [],
        pluralPath: 'discussion',
        singularPath: 'discussion',
      },
    ])
    expect(parseTopicRouteConfigEntries(content, 'web/lib/route-configs.ts')).toEqual([
      {
        key: 'topics',
        body: expect.anything(),
        topicTypes: ['topic', 'card'],
        pluralPath: 'topics',
        singularPath: 'topic',
        spendingCategory: true,
      },
      {
        key: 'cards',
        body: expect.anything(),
        topicTypes: [],
        pluralPath: 'cards',
        singularPath: 'card',
        spendingCategory: false,
      },
    ])
    expect(
      parsePostDetailRouteFactoryArgs(
        postFactoryContent,
        'web/app/(posts)/discussion/[id]/page.tsx',
      ),
    ).toEqual([{ postType: 'discussion', slug: 'discussion' }])
    expect(
      parseTopicRouteFactoryArgs(topicFactoryContent, 'web/app/(topics)/topic/[id]/page.tsx'),
    ).toEqual([{ slug: 'topic' }])
  })

  it('parses postSlugToType objects without indentation coupling', () => {
    const content =
      "export const postSlugToType = { 'blog-post': 'blog_post', discussion: 'discussion' } as const"

    expect([...parsePostSlugToType(content, 'web/lib/route-configs.ts').entries()]).toEqual([
      ['blog-post', 'blog_post'],
      ['discussion', 'discussion'],
    ])
  })
})
