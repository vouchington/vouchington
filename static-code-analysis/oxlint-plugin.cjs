'use strict'

const { isProtectedFile, normalizeFilename } = require('./oxlint-plugin/rate-limiter-paths.cjs')
const {
  memberIsRead,
  patternPropertyName,
  propertyName,
} = require('./oxlint-plugin/rate-limiter-extractions.cjs')
const {
  createTypescriptProgramConstructionRule,
} = require('./oxlint-plugin/typescript-program-construction.cjs')
const { createPostgresRules } = require('./oxlint-plugin/postgres-rules.cjs')

const VALKEY_CACHE_MODULE = '@data-stores/valkey/cache'
const MESSAGE =
  "Do not read an '.invalidate' member in protected test or support code. Use an explicit domain reset function, a fresh identity, or delete only the exact keys owned by the test."

function unwrap(node) {
  let current = node
  while (
    current &&
    (current.type === 'ChainExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression')
  ) {
    current = current.expression
  }
  return current
}

function findVariable(context, identifier) {
  let scope = context.sourceCode.getScope(identifier)
  while (scope) {
    const variable =
      (typeof scope.set?.get === 'function' && scope.set.get(identifier.name)) ||
      scope.variables?.find(candidate => candidate.name === identifier.name)
    if (variable) return variable
    scope = scope.upper
  }
  return null
}

function isCanonicalValkeyCache(context, identifier) {
  if (identifier?.type !== 'Identifier') return false
  return Boolean(
    findVariable(context, identifier)?.defs?.some(definition => {
      const specifier = definition.node
      const declaration = definition.parent || specifier?.parent
      return (
        definition.type === 'ImportBinding' &&
        specifier?.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        (specifier.imported?.name ?? specifier.imported?.value) === 'ValkeyCache' &&
        declaration?.type === 'ImportDeclaration' &&
        declaration.importKind !== 'type' &&
        declaration.source?.value === VALKEY_CACHE_MODULE
      )
    }),
  )
}

function objectHasEffectivePrefix(object, expected) {
  if (object?.type !== 'ObjectExpression') return false
  let matches = false
  for (const property of object.properties) {
    if (property.type === 'SpreadElement') {
      matches = false
      continue
    }
    const name = patternPropertyName(property)
    if (name === 'prefix') {
      matches = property.value.type === 'Literal' && property.value.value === expected
    } else if (name == null && property.computed) {
      matches = false
    }
  }
  return matches
}

function isEmailDomainCache(context, identifier) {
  if (identifier?.type !== 'Identifier') return false
  return Boolean(
    findVariable(context, identifier)?.defs?.some(definition => {
      const declaration = definition.node
      const initializer = unwrap(declaration?.init)
      const variable = findVariable(context, identifier)
      return (
        definition.type === 'Variable' &&
        declaration?.type === 'VariableDeclarator' &&
        declaration.id?.type === 'Identifier' &&
        declaration.parent?.kind === 'const' &&
        initializer?.type === 'NewExpression' &&
        unwrap(initializer.callee)?.type === 'Identifier' &&
        unwrap(initializer.callee).name === 'ValkeyCache' &&
        isCanonicalValkeyCache(context, unwrap(initializer.callee)) &&
        objectHasEffectivePrefix(unwrap(initializer.arguments[0]), 'email-domain-validation') &&
        !variable.references.some(
          reference =>
            reference.identifier !== declaration.id &&
            reference.isWrite() &&
            (reference.identifier.range?.[0] ?? reference.identifier.start) >
              (declaration.range?.[1] ?? declaration.end),
        )
      )
    }),
  )
}

function isLiteralConstant(context, identifier, name, value) {
  if (identifier?.type !== 'Identifier' || identifier.name !== name) return false
  return Boolean(
    findVariable(context, identifier)?.defs?.some(definition => {
      const declaration = definition.node
      return (
        definition.type === 'Variable' &&
        declaration?.type === 'VariableDeclarator' &&
        declaration.id?.type === 'Identifier' &&
        declaration.id.name === name &&
        declaration.parent?.kind === 'const' &&
        declaration.init?.type === 'Literal' &&
        declaration.init.value === value
      )
    }),
  )
}

function isEntityCacheException(context, member) {
  const filename = normalizeFilename(context)
  const object = unwrap(member.object)
  const call = member.parent
  if (
    filename.endsWith('backend/test-helpers/entities/memberships.mts') &&
    call?.type === 'CallExpression' &&
    call.callee === member &&
    call.arguments.length === 1 &&
    object?.type === 'Identifier' &&
    object.name === 'ValkeyCache' &&
    isLiteralConstant(
      context,
      call.arguments[0],
      'ACTIVE_PLANS_CACHE_PREFIX',
      'membership_products:provider-v1:active_plans',
    )
  ) {
    return isCanonicalValkeyCache(context, object)
  }
  return (
    filename.endsWith('backend/test-helpers/entities/email-addresses.mts') &&
    call?.type === 'CallExpression' &&
    call.callee === member &&
    !call.optional &&
    !member.optional &&
    call.arguments.length === 0 &&
    isEmailDomainCache(context, object)
  )
}

const typescriptProgramConstructionRule = createTypescriptProgramConstructionRule({
  findVariable,
  propertyName,
  unwrap,
})
const postgresRules = createPostgresRules({ findVariable, normalizeFilename, propertyName, unwrap })
const noInvalidateMemberReadRule = {
  meta: {
    type: 'problem',
    docs: { description: "ban '.invalidate' reads in protected tests" },
    schema: [],
    messages: { protectedRead: MESSAGE },
  },
  create(context) {
    if (!isProtectedFile(context)) return {}
    return {
      MemberExpression(node) {
        if (
          propertyName(node) === 'invalidate' &&
          memberIsRead(node) &&
          !isEntityCacheException(context, node)
        ) {
          context.report({ node, messageId: 'protectedRead' })
        }
      },
      Property(node) {
        if (node.parent?.type === 'ObjectPattern' && patternPropertyName(node) === 'invalidate') {
          context.report({ node, messageId: 'protectedRead' })
        }
      },
    }
  },
}
module.exports = {
  meta: { name: 'eslint-plugin-voucha', version: '1.0.0' },
  rules: {
    ...postgresRules,
    'backend-contract-program-construction-location': typescriptProgramConstructionRule,
    'no-prefix-wide-rate-limiter-invalidate': noInvalidateMemberReadRule,
  },
}
