'use strict'

const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race'])
const EAGER_ITERATORS = new Set(['flatMap', 'forEach', 'map'])
const OWNERS = new Set(['writeBookmarksCsv', 'writeEntityRelationsCsv'])

function enclosingFunctionName(node) {
  let current = node.parent
  while (current) {
    if (current.type === 'FunctionDeclaration') return current.id?.name ?? null
    if (
      (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
      current.parent?.type === 'VariableDeclarator' &&
      current.parent.id?.type === 'Identifier'
    ) {
      return current.parent.id.name
    }
    current = current.parent
  }
  return null
}

function isUnshadowedPromise(context, identifier, findVariable) {
  if (identifier?.type !== 'Identifier' || identifier.name !== 'Promise') return false
  const variable = findVariable(context, identifier)
  return !variable || variable.defs?.length === 0
}

function createAccountExportCursorDrainsRule(helpers) {
  return {
    meta: {
      type: 'problem',
      docs: { description: 'keep account-export PostgreSQL cursor drains serial' },
      schema: [],
      messages: {
        serial:
          'Drain account-export cursor streams serially so each PostgreSQL client is released before the next drain.',
      },
    },
    create(context) {
      if (
        !helpers
          .normalizeFilename(context)
          .endsWith('backend/services/account-data-requests/export.mts')
      ) {
        return {}
      }
      return {
        CallExpression(node) {
          const callee = helpers.unwrap(node.callee)
          if (
            callee?.type !== 'MemberExpression' ||
            !COMBINATORS.has(helpers.propertyName(callee)) ||
            !isUnshadowedPromise(context, helpers.unwrap(callee.object), helpers.findVariable) ||
            !OWNERS.has(enclosingFunctionName(node))
          ) {
            return
          }
          const mapped = helpers.unwrap(node.arguments?.[0])
          const mappedCallee = helpers.unwrap(mapped?.callee)
          if (
            mapped?.type === 'CallExpression' &&
            mappedCallee?.type === 'MemberExpression' &&
            EAGER_ITERATORS.has(helpers.propertyName(mappedCallee))
          ) {
            context.report({ messageId: 'serial', node })
          }
        },
      }
    },
  }
}

module.exports = { createAccountExportCursorDrainsRule }
