'use strict'

const { createAccountExportCursorDrainsRule } = require('./account-export-cursor-drains.cjs')

function createPostgresRules(helpers) {
  return {
    'account-export-cursor-drains-serial': createAccountExportCursorDrainsRule(helpers),
  }
}

module.exports = { createPostgresRules }
