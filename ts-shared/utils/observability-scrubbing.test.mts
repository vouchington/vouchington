import { describe, expect, it } from 'vitest'
import {
  scrubEventBreadcrumbs,
  scrubRequestUrlFields,
  scrubSpanUrlAttributes,
} from './observability-scrubbing.mts'

const heartbeat =
  'https://grafana.example/oncall/integrations/v1/formatted_webhook/bearer/heartbeat/'
const filtered =
  'https://grafana.example/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/'

describe('Grafana heartbeat observability policy', () => {
  it('redacts path credentials on spans', () => {
    expect(scrubSpanUrlAttributes({ 'url.full': heartbeat })).toEqual({ 'url.full': filtered })
  })
  it('redacts path credentials on breadcrumbs', () => {
    expect(scrubEventBreadcrumbs([{ data: { url: heartbeat } }])).toEqual([
      { data: { url: filtered } },
    ])
  })
  it('redacts path credentials in request URLs and referer headers', () => {
    expect(scrubRequestUrlFields({ url: heartbeat, headers: { referer: heartbeat } })).toEqual({
      url: filtered,
      headers: { referer: filtered },
    })
  })
})
