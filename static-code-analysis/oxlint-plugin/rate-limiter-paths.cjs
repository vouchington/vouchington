'use strict'

function normalizeFilename(context) {
  const filename = context.filename.replaceAll('\\', '/')
  const cwd = context.cwd?.replaceAll('\\', '/').replace(/\/$/, '')
  return cwd && filename.startsWith(`${cwd}/`) ? filename.slice(cwd.length + 1) : filename
}

function isProtectedFile(context) {
  const filename = normalizeFilename(context)
  if (
    filename.endsWith('backend/services/valkey-admin/flush.mts') ||
    filename.endsWith('playwright/global-setup.mts')
  ) {
    return false
  }
  return (
    /(?:^|\/)backend\/.*\.(?:test|spec)\.mts$/.test(filename) ||
    /(?:^|\/)backend\/.*\/__tests__\/.*\.mts$/.test(filename) ||
    /(?:^|\/)backend\/(?:.*\/)?test-helpers\/.*\.mts$/.test(filename) ||
    /(?:^|\/)backend\/(?:.*\/)?test-support(?:\/.*)?\.mts$/.test(filename) ||
    /(?:^|\/)backend\/.*(?:\.test-helpers|-test-support)\.mts$/.test(filename) ||
    /(?:^|\/)integration-tests\/.*\.mts$/.test(filename) ||
    /(?:^|\/)playwright\/.*\.mts$/.test(filename)
  )
}

module.exports = { isProtectedFile, normalizeFilename }
