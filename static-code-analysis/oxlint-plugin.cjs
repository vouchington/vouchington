'use strict'

const { propertyName } = require('./oxlint-plugin/rate-limiter-extractions.cjs')
const {
  createTypescriptProgramConstructionRule,
} = require('./oxlint-plugin/typescript-program-construction.cjs')

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

const typescriptProgramConstructionRule = createTypescriptProgramConstructionRule({
  findVariable,
  propertyName,
  unwrap,
})

module.exports = {
  meta: { name: 'eslint-plugin-voucha', version: '1.0.0' },
  rules: {
    'backend-contract-program-construction-location': typescriptProgramConstructionRule,
  },
}
