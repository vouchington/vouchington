import { describe, expect, it } from 'vitest'
import {
  IPV6_ALLOWLIST,
  getConfiguredSentryHost,
  isExemptEgressHost,
  isIpv6AllowlistedHost,
} from './ipv6-allowlist.mts'

const SENTRY_DSN = `https://${'a'.repeat(32)}@o${12345}.ingest.eu.sentry.io/${67890}`
const SENTRY_HOST = new URL(SENTRY_DSN).hostname
const SENTRY_DSN_WITH_PORT = `https://${'a'.repeat(32)}@o${12345}.ingest.eu.sentry.io:8443/${67890}`
const SENTRY_IPV6_DSN_WITH_PORT = `https://${'a'.repeat(32)}@[2001:db8::1]:8443/${67890}`

describe('isIpv6AllowlistedHost', () => {
  it('allows every audited fixed IPv6 API hostname exactly', () => {
    expect(IPV6_ALLOWLIST).toEqual([
      'challenges.cloudflare.com',
      'recaptchaenterprise.googleapis.com',
      'webrisk.googleapis.com',
      'www.googleapis.com',
      'graph.facebook.com',
      'www.linkedin.com',
      'api.linkedin.com',
      'login.microsoftonline.com',
      'graph.microsoft.com',
      'firehose.us-west-2.api.aws',
      'email.us-west-2.api.aws',
      'monitoring.us-west-2.api.aws',
    ])
    for (const host of IPV6_ALLOWLIST) expect(isIpv6AllowlistedHost(host)).toBe(true)
  })

  it('allows audited AWS dual-stack endpoint hostnames', () => {
    expect(isIpv6AllowlistedHost('monitoring.us-west-2.api.aws')).toBe(true)
    expect(isIpv6AllowlistedHost('firehose.us-west-2.api.aws')).toBe(true)
    expect(isIpv6AllowlistedHost('email.us-west-2.api.aws')).toBe(true)
    expect(isIpv6AllowlistedHost('s3.dualstack.us-west-2.amazonaws.com')).toBe(true)
    expect(isIpv6AllowlistedHost('example-images.s3.dualstack.us-west-2.amazonaws.com')).toBe(true)
  })

  it('derives the optional Sentry verification host without treating it as audited', () => {
    expect(getConfiguredSentryHost({ SENTRY_DSN: SENTRY_DSN })).toBe(SENTRY_HOST)
    expect(getConfiguredSentryHost({ SENTRY_DSN: SENTRY_DSN_WITH_PORT })).toBe(
      `${SENTRY_HOST}:8443`,
    )
    expect(getConfiguredSentryHost({ SENTRY_DSN: SENTRY_IPV6_DSN_WITH_PORT })).toBe(
      '[2001:db8::1]:8443',
    )
    expect(getConfiguredSentryHost({ SENTRY_DSN: 'not-a-dsn' })).toBeUndefined()
    expect(isIpv6AllowlistedHost(SENTRY_HOST)).toBe(false)
  })

  it('rejects subdomains of audited fixed API hostnames', () => {
    expect(isIpv6AllowlistedHost(`child.${SENTRY_HOST}`)).toBe(false)
    expect(isIpv6AllowlistedHost('child.graph.facebook.com')).toBe(false)
  })

  it('rejects ordinary AWS IPv4 endpoint hostname classes', () => {
    expect(isIpv6AllowlistedHost('sts.amazonaws.com')).toBe(false)
    expect(isIpv6AllowlistedHost('s3.us-west-2.amazonaws.com')).toBe(false)
    expect(isIpv6AllowlistedHost('example-images.s3.us-west-2.amazonaws.com')).toBe(false)
    expect(isIpv6AllowlistedHost('attacker-amazonaws.com')).toBe(false)
    expect(isIpv6AllowlistedHost('bedrock-runtime.us-east-1.api.aws')).toBe(false)
    expect(isIpv6AllowlistedHost('unaudited.us-west-2.api.aws')).toBe(false)
  })

  it('does not allow a parent domain of an audited exact host', () => {
    expect(isIpv6AllowlistedHost('sentry.io')).toBe(false)
  })

  it('does not match an unrelated host that merely contains an allowlisted suffix', () => {
    expect(isIpv6AllowlistedHost('notamazonaws.com')).toBe(false)
  })

  it('does not match a non-allowlisted host like api.stripe.com', () => {
    expect(isIpv6AllowlistedHost('api.stripe.com')).toBe(false)
  })

  it('does not match a non-allowlisted host like api.openai.com', () => {
    expect(isIpv6AllowlistedHost('api.openai.com')).toBe(false)
  })
})

describe('isExemptEgressHost', () => {
  it('exempts IPv4 loopback', () => {
    expect(isExemptEgressHost('127.0.0.1')).toBe(true)
  })

  it('exempts IPv6 loopback', () => {
    expect(isExemptEgressHost('::1')).toBe(true)
  })

  it('exempts bracketed IPv6 loopback literals', () => {
    expect(isExemptEgressHost('[::1]')).toBe(true)
  })

  it('exempts private 10.x addresses', () => {
    expect(isExemptEgressHost('10.0.0.5')).toBe(true)
  })

  it('exempts private 192.168.x addresses', () => {
    expect(isExemptEgressHost('192.168.1.1')).toBe(true)
  })

  it('exempts private 172.16-31.x addresses', () => {
    expect(isExemptEgressHost('172.20.0.1')).toBe(true)
  })

  it('does not exempt 172.x addresses outside the 16-31 private range', () => {
    expect(isExemptEgressHost('172.32.0.1')).toBe(false)
  })

  it('exempts link-local IPv4 addresses', () => {
    expect(isExemptEgressHost('169.254.0.1')).toBe(true)
  })

  it('exempts unique-local IPv6 addresses', () => {
    expect(isExemptEgressHost('fd00::1')).toBe(true)
  })

  it('exempts link-local IPv6 addresses', () => {
    expect(isExemptEgressHost('fe80::1')).toBe(true)
  })

  it('exempts localhost', () => {
    expect(isExemptEgressHost('localhost')).toBe(true)
  })

  it('exempts .internal suffixed hosts', () => {
    expect(isExemptEgressHost('service.internal')).toBe(true)
  })

  it('exempts .local suffixed hosts', () => {
    expect(isExemptEgressHost('service.local')).toBe(true)
  })

  it('exempts .test suffixed hosts', () => {
    expect(isExemptEgressHost('service.test')).toBe(true)
  })

  it('does not exempt a normal public host', () => {
    expect(isExemptEgressHost('api.stripe.com')).toBe(false)
  })

  it('does not exempt a public hostname that begins with the fc unique-local IPv6 prefix', () => {
    expect(isExemptEgressHost('fcm.googleapis.com')).toBe(false)
  })

  it('does not exempt a public hostname that begins with the fd unique-local IPv6 prefix', () => {
    expect(isExemptEgressHost('fdroid.org')).toBe(false)
  })

  it('does not exempt a public hostname whose label looks like a private IPv4 prefix', () => {
    expect(isExemptEgressHost('10.example.com')).toBe(false)
  })

  it('does not exempt a public IPv6 literal', () => {
    expect(isExemptEgressHost('2001:4860:4860::8888')).toBe(false)
  })
})
