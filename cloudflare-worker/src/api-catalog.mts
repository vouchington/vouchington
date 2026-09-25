import { buildMcpApiCatalogContext } from './agent-interface-documents.mts'
import { getSiteOrigin } from './discovery-origin.mts'
import type { Env } from './types.mts'

type LinkTarget = {
  href: string
  type?: string
  title?: string
}

type SiteLinkContext = {
  anchor: string
  'service-desc': LinkTarget[]
  sitemap: LinkTarget[]
  item: LinkTarget[]
  alternate: LinkTarget[]
}

type AgentInterfaceLinkContext = {
  anchor: string
  'service-doc': LinkTarget[]
}

type LinkSet = {
  linkset: [SiteLinkContext, AgentInterfaceLinkContext]
}

export function buildApiCatalogLinkset(env: Env): LinkSet {
  const siteOrigin = getSiteOrigin(env)
  const sitemap =
    env.NOINDEX?.toLowerCase() === 'true'
      ? []
      : [
          {
            href: `${siteOrigin}/sitemap.xml`,
            type: 'application/xml',
            title: 'Sitemap index',
          },
        ]
  return {
    linkset: [
      {
        anchor: siteOrigin,
        'service-desc': [
          {
            href: `${siteOrigin}/llms.txt`,
            type: 'text/markdown',
            title: 'LLM discovery',
          },
        ],
        sitemap,
        item: [
          {
            href: `${siteOrigin}/md/posts`,
            type: 'text/markdown',
            title: 'Public posts as markdown',
          },
          {
            href: `${siteOrigin}/md/topics`,
            type: 'text/markdown',
            title: 'Public topics as markdown',
          },
        ],
        alternate: [
          {
            href: `${siteOrigin}/rss/posts`,
            type: 'application/rss+xml',
            title: 'Public posts RSS',
          },
          {
            href: `${siteOrigin}/rss/news`,
            type: 'application/rss+xml',
            title: 'Public news RSS',
          },
        ],
      },
      buildMcpApiCatalogContext(siteOrigin),
    ],
  }
}
