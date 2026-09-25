import {
  buildAgentAccessLlmsSection,
  buildMcpAgentCardEntry,
  buildMcpAgentSkill,
  MCP_SPECIFICATION_URL,
} from './agent-interface-documents.mts'
import { getSiteOrigin } from './discovery-origin.mts'
import type { Env } from './types.mts'

export const MARKDOWN_SOURCE_PATHS = ['/md/posts', '/md/topics', '/md/users/{username}'] as const

export const WELL_KNOWN_PATHS = new Set([
  '/.well-known/security.txt',
  '/.well-known/api-catalog',
  '/.well-known/traffic-advice',
  '/.well-known/agent-card.json',
  '/.well-known/agent-skills.json',
])

const SPEC_LINKS = {
  llms: 'https://specification.website/spec/agent-readiness/llms-txt/',
  llmsFull: 'https://specification.website/spec/agent-readiness/llms-full-txt/',
  markdown: 'https://specification.website/spec/agent-readiness/markdown-source-endpoints/',
  linkHeaders: 'https://specification.website/spec/agent-readiness/link-headers/',
  securityTxt: 'https://specification.website/spec/security/security-txt/',
  apiCatalog: 'https://specification.website/spec/well-known/api-catalog/',
  trafficAdvice: 'https://specification.website/spec/well-known/traffic-advice/',
} as const

export function buildLlmsTxt(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return `# Voucha

> Voucha is a community platform for reviews, discussions, and curated content about rewards programs, credit cards, and personal finance.

Public content listed here needs no authentication. The one authenticated interface listed is the user MCP server under Agent Access (MCP), which needs the user's own API key. Private resources and URLs containing bearer credentials such as RSS \`apikey\` query parameters are intentionally omitted.

## Docs

- [Posts](/md/posts): Browse public unauthenticated posts including discussions, reviews, stories, articles, blog posts, and data points
- [Topics](/md/topics): Browse public unauthenticated topics including rewards programs, credit cards, and referral programs
- [User Profiles](/md/users/{username}): View public unauthenticated user profiles

## Markdown Source Endpoints

All public content below is available as structured markdown with YAML frontmatter. Responses use \`Content-Type: text/markdown; charset=utf-8\`.

- ${siteOrigin}/md/posts
- ${siteOrigin}/md/topics
- ${siteOrigin}/md/users/{username}

Per-page aliases ending in \`.md\` are supported for public posts, topics, and users, for example \`/review/example.md\`, \`/topic/example.md\`, and \`/user/example.md\`.

## Anonymous RSS

Anonymous RSS feeds are available at:

- ${siteOrigin}/rss/posts
- ${siteOrigin}/rss/news

RSS endpoints also support optional API keys for identity rate limiting, but keyed URLs are not discovery resources and must not be advertised in \`llms.txt\`, API catalogs, or HTTP \`Link\` headers.

## API

Posts support filtering by \`post_types\` (discussion, review, data_point, story, article, blog_post) and \`topic\` (topic slug or ID). Topics support filtering by \`topic_types\` (rewards_program, card, referral_program, rewards_program_status).

All list endpoints support \`limit\` (1-25 unauthenticated, 1-100 authenticated, default 25) and \`after\` (cursor) for pagination.

${buildAgentAccessLlmsSection(siteOrigin)}
## Specification Alignment

- ${SPEC_LINKS.llms}
- ${SPEC_LINKS.markdown}
- ${SPEC_LINKS.linkHeaders}
- ${MCP_SPECIFICATION_URL}
`
}

export function buildLlmsFullTxt(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return `${buildLlmsTxt(env)}

## Full Index Policy

Voucha exposes public content through paginated markdown endpoints rather than embedding every public post, topic, and user profile in this file. This keeps responses bounded and prevents accidental expansion when the public corpus grows.

Agents should start at:

- ${siteOrigin}/md/posts
- ${siteOrigin}/md/topics

Then follow pagination cursors and per-item links.

Spec reference: ${SPEC_LINKS.llmsFull}
`
}

export function buildSecurityTxt(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return `Contact: mailto:security@voucha.ai
Policy: ${siteOrigin}/article/security-policy
Preferred-Languages: en
Canonical: ${siteOrigin}/.well-known/security.txt
Expires: 2027-12-31T23:59:59Z
`
}

export function buildTrafficAdvice(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return JSON.stringify(
    {
      version: '1.0',
      applies_to: siteOrigin,
      specification: SPEC_LINKS.trafficAdvice,
      guidance: [
        {
          user_agents: ['*'],
          disallow: ['/admin/', '/api/', '/auth/', '/feed/', '/login', '/my/'],
          prefer: ['/llms.txt', '/md/posts', '/md/topics'],
        },
      ],
    },
    null,
    2,
  )
}

export function buildAgentCard(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return JSON.stringify(
    {
      name: 'Voucha',
      description:
        'Public reviews, discussions, and curated rewards-program and personal-finance content.',
      url: siteOrigin,
      llms: `${siteOrigin}/llms.txt`,
      skills: `${siteOrigin}/.well-known/agent-skills.json`,
      mcp: buildMcpAgentCardEntry(siteOrigin),
    },
    null,
    2,
  )
}

export function buildAgentSkills(env: Env): string {
  const siteOrigin = getSiteOrigin(env)
  return JSON.stringify(
    {
      skills: [
        {
          name: 'browse-public-content',
          description: 'Browse public posts, topics, and user profiles through markdown endpoints.',
          inputs: ['post slug or ID', 'topic slug or ID', 'username'],
          resources: [
            `${siteOrigin}/llms.txt`,
            `${siteOrigin}/md/posts`,
            `${siteOrigin}/md/topics`,
          ],
        },
        buildMcpAgentSkill(siteOrigin),
      ],
    },
    null,
    2,
  )
}
