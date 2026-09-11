import { describe, expect, it } from 'vitest'
import { getBotTier } from './bot-tier.mts'

describe('getBotTier', () => {
  describe('known bots — search engines', () => {
    it.each<[string, string]>([
      ['Googlebot', 'Googlebot/2.1 (+http://www.google.com/bot.html)'],
      ['Google-InspectionTool', 'Google-InspectionTool/1.0'],
      ['Storebot-Google', 'Storebot-Google/1.0'],
      ['GoogleOther', 'GoogleOther'],
      ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
      ['msnbot', 'msnbot/2.0b (+http://search.msn.com/msnbot.htm)'],
      ['YandexBot', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
      [
        'Baiduspider',
        'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
      ],
      ['DuckDuckBot', 'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)'],
      ['Applebot', 'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)'],
      [
        'Slurp',
        'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
      ],
      [
        'ia_archiver',
        'ia_archiver (+http://www.alexa.com/site/help/webmasters; crawler@alexa.com)',
      ],
    ])('%s is classified as known when Cloudflare verifies it', (_name, ua) => {
      expect(getBotTier(ua, { verifiedBot: true })).toBe('known')
    })
  })

  describe('known bots — AI search engines', () => {
    it.each<[string, string]>([
      ['ChatGPT-User', 'ChatGPT-User/1.0'],
      ['PerplexityBot', 'PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)'],
      ['ClaudeBot', 'ClaudeBot/0.1 (+https://anthropic.com)'],
      ['anthropic-ai', 'anthropic-ai/1.0'],
      ['Amazonbot', 'Amazonbot/0.1 (+https://developer.amazon.com/support/amazonbot)'],
    ])('%s is classified as known when Cloudflare verifies it', (_name, ua) => {
      expect(getBotTier(ua, { verifiedBot: true })).toBe('known')
    })
  })

  describe('known bots — social previewers', () => {
    it.each<[string, string]>([
      [
        'facebookexternalhit',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      ],
      ['Twitterbot', 'Twitterbot/1.0'],
      [
        'LinkedInBot',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)',
      ],
      ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
      ['Discordbot', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
      ['WhatsApp', 'WhatsApp/2.21.1 A'],
      ['TelegramBot', 'TelegramBot (https://core.telegram.org/bots/api)'],
    ])('%s is classified as known when Cloudflare verifies it', (_name, ua) => {
      expect(getBotTier(ua, { verifiedBot: true })).toBe('known')
    })
  })

  describe('known bots — monitoring', () => {
    it.each<[string, string]>([
      ['UptimeRobot', 'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)'],
      ['Pingdom', 'Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)'],
      ['Site24x7', 'Mozilla/5.0 (compatible; Site24x7/1.0; http://www.site24x7.com)'],
      ['StatusCake', 'StatusCake Internet Speed Test'],
      ['BetterUptime', 'BetterUptime/1.0 (monitoring)'],
    ])('%s is classified as known when Cloudflare verifies it', (_name, ua) => {
      expect(getBotTier(ua, { verifiedBot: true })).toBe('known')
    })
  })

  describe('unknown bots', () => {
    it('classifies a known-bot UA without Cloudflare verification as unknown', () => {
      expect(getBotTier('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe('unknown')
    })

    it.each<[string, string]>([
      ['generic bot keyword', 'MyGenericBot/1.0'],
      ['crawler keyword', 'MyCrawler/1.0 (+http://example.com/crawler)'],
      ['spider keyword', 'MySpider/2.0 (tests+spider@voucha.ai)'],
    ])('%s is classified as unknown', (_name, ua) => {
      expect(getBotTier(ua)).toBe('unknown')
    })
  })

  describe('humans (null result)', () => {
    it.each<[string, string | null]>([
      [
        'Chrome',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
      ['Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/117.0'],
      [
        'Safari',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
      ],
      ['null UA', null],
      ['empty UA', ''],
    ])('%s is classified as human (null)', (_name, ua) => {
      expect(getBotTier(ua)).toBeNull()
    })
  })
})
