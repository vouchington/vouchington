import { ROBOTS_DISALLOW_PREFIXES } from '@ts-shared/route-classification'

// Major AI crawler user-agents to explicitly allow.
export const AI_CRAWLERS = [
  'GPTBot',
  'PerplexityBot',
  'Claude-Web',
  'anthropic-ai',
  'ClaudeBot',
  'OAI-SearchBot',
  'Google-Extended',
  'Bingbot',
  'Applebot',
  'Amazonbot',
  'CCBot',
  'Meta-ExternalAgent',
  'DuckAssistBot',
  'Google-CloudVertexBot',
  'Bytespider',
]

type GenerateRobotsTxtOptions = {
  noIndex?: boolean
}

export function generateRobotsTxt(
  siteOrigin: string,
  options: GenerateRobotsTxtOptions = {},
): string {
  if (options.noIndex) {
    return 'User-agent: *\nDisallow: /\n'
  }

  let txt = 'User-agent: *\nAllow: /\n'
  for (const p of ROBOTS_DISALLOW_PREFIXES) {
    txt += `Disallow: ${p}\n`
  }
  txt += '\n'

  for (const bot of AI_CRAWLERS) {
    txt += `User-agent: ${bot}\nAllow: /\n`
    for (const p of ROBOTS_DISALLOW_PREFIXES) {
      txt += `Disallow: ${p}\n`
    }
    txt += '\n'
  }

  txt += `Sitemap: ${siteOrigin}/sitemap.xml\nHost: ${siteOrigin}\n`
  return txt
}
