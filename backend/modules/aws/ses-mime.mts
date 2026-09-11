import crypto from 'node:crypto'
import type { SendEmailOptions } from '@modules/utils/email'

export function buildRawEmailMessage(options: SendEmailOptions): string {
  const source = process.env.SES_SOURCE_EMAIL || 'no-reply@voucha.ai'
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to]
  const headers = [
    `From: ${source}`,
    `To: ${toAddresses.join(', ')}`,
    'Reply-To: support@voucha.ai',
    `Subject: ${encodeHeaderValue(options.subject)}`,
    'MIME-Version: 1.0',
    ...Object.entries(options.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
  ]

  if (options.text && options.html) {
    const boundary = `voucha-${crypto.randomUUID()}`
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimeBody(options.text),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimeBody(options.html),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  const contentType = options.html ? 'text/html' : 'text/plain'
  return [
    ...headers,
    `Content-Type: ${contentType}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBody(options.html ?? options.text ?? ''),
  ].join('\r\n')
}

function normalizeCrLf(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n')
}

function encodeMimeBody(value: string): string {
  const encoded = Buffer.from(normalizeCrLf(value), 'utf-8').toString('base64')
  return (encoded.match(/.{1,76}/g) ?? ['']).join('\r\n')
}

function encodeHeaderValue(value: string): string {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}
