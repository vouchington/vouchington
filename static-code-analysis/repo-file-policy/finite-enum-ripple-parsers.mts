import ts from 'typescript'

import {
  collectCallExpressions,
  findConstObjectLiteral,
  findTypeAliasDeclaration,
  getCallExpressionName,
  getPropertyNameText,
  getStringLiteralValue,
  unwrapExpression,
} from './finite-enum-ripple-ast.mts'

export interface TopicTypeEntry {
  value: string
  slug: string
  slugPlural: string
}

export interface PostRouteConfigEntry {
  key: string
  postTypes: string[]
  pluralPath: string
  singularPath: string
}

export interface TopicRouteConfigEntry {
  key: string
  topicTypes: string[]
  pluralPath: string
  singularPath: string
  spendingCategory: boolean
}

export interface PostDetailRouteFactoryArgs {
  postType: string
  slug: string
}

export interface TopicRouteFactoryArgs {
  slug: string
}

export function parseTopicTypeEntries(content: string, file: string): TopicTypeEntry[] {
  const object = findConstObjectLiteral(content, 'topicTypes', file)
  const entries: TopicTypeEntry[] = []
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const value = getPropertyNameText(property.name)
    if (!value) continue
    const body = unwrapExpression(property.initializer)
    if (!ts.isObjectLiteralExpression(body)) continue
    const slug = getStringProperty(body, 'slug')
    const slugPlural = getStringProperty(body, 'slugPlural')
    if (!slug) throw new Error(`${file}: topicTypes.${value} is missing slug`)
    if (!slugPlural) throw new Error(`${file}: topicTypes.${value} is missing slugPlural`)
    entries.push({ value, slug, slugPlural })
  }
  if (entries.length === 0) throw new Error(`${file}: could not parse topicTypes entries`)
  return entries
}

export function parsePostSlugToType(content: string, file: string): Map<string, string> {
  const object = findConstObjectLiteral(content, 'postSlugToType', file)
  const entries = new Map<string, string>()
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = getPropertyNameText(property.name)
    if (!key) continue
    const value = getStringLiteralValue(property.initializer)
    if (!value) continue
    entries.set(key, value)
  }
  if (entries.size === 0) throw new Error(`${file}: could not parse postSlugToType entries`)
  return entries
}

export function parsePostTypeUnion(content: string, file: string): string[] {
  const typeAlias = findTypeAliasDeclaration(content, 'PostType', file)
  const values = collectStringLiteralsFromType(typeAlias.type)
  if (values.length === 0) throw new Error(`${file}: PostType union has no values`)
  return values
}

export function parsePostRouteConfigEntries(content: string, file: string): PostRouteConfigEntry[] {
  return parseRouteConfigEntries(content, 'postRouteConfigs', file).map(entry => ({
    ...entry,
    postTypes: parseStringArray(entry.body, 'postTypes'),
  }))
}

export function parseTopicRouteConfigEntries(
  content: string,
  file: string,
): TopicRouteConfigEntry[] {
  return parseRouteConfigEntries(content, 'topicRouteConfigs', file).map(entry => ({
    ...entry,
    topicTypes: parseStringArray(entry.body, 'topicTypes'),
    spendingCategory: hasTrueProperty(entry.body, 'spendingCategory'),
  }))
}

export function parsePostDetailRouteFactoryArgs(
  content: string,
  file: string,
): PostDetailRouteFactoryArgs[] {
  const args: PostDetailRouteFactoryArgs[] = []
  for (const call of collectCallExpressions(content, file)) {
    if (!getCallExpressionName(call.expression)?.match(/^create[A-Za-z]+Page$/)) continue
    const postType = getStringLiteralValue(call.arguments[0])
    const slug = getStringLiteralValue(call.arguments[1])
    if (postType && slug) args.push({ postType, slug })
  }
  return args
}

export function parseTopicRouteFactoryArgs(content: string, file: string): TopicRouteFactoryArgs[] {
  const args: TopicRouteFactoryArgs[] = []
  for (const call of collectCallExpressions(content, file)) {
    if (!getCallExpressionName(call.expression)?.match(/^create[A-Za-z]+Page$/)) continue
    const slug = getStringLiteralValue(call.arguments[0])
    if (slug) args.push({ slug })
  }
  return args
}

function parseRouteConfigEntries(content: string, name: string, file: string) {
  const object = findConstObjectLiteral(content, name, file)
  const entries: {
    key: string
    body: ts.ObjectLiteralExpression
    pluralPath: string
    singularPath: string
  }[] = []
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = getPropertyNameText(property.name)
    if (!key) continue
    const body = unwrapExpression(property.initializer)
    if (!ts.isObjectLiteralExpression(body)) continue
    const pluralPath = getStringProperty(body, 'pluralPath')
    const singularPath = getStringProperty(body, 'singularPath')
    if (!pluralPath) throw new Error(`${file}: ${name}.${key} is missing pluralPath`)
    if (!singularPath) throw new Error(`${file}: ${name}.${key} is missing singularPath`)
    entries.push({ key, body, pluralPath, singularPath })
  }
  if (entries.length === 0) throw new Error(`${file}: could not parse ${name} entries`)
  return entries
}

function parseStringArray(content: ts.ObjectLiteralExpression, property: string): string[] {
  const array = getPropertyValue(content, property)
  if (!array || !ts.isArrayLiteralExpression(array)) return []
  return array.elements.flatMap(element => {
    const value = getStringLiteralValue(element)
    return value ? [value] : []
  })
}

function collectStringLiteralsFromType(type: ts.TypeNode): string[] {
  const node = unwrapTypeNode(type)
  if (ts.isUnionTypeNode(node))
    return node.types.flatMap(item => collectStringLiteralsFromType(item))
  const value = ts.isLiteralTypeNode(node) ? getStringLiteralValue(node.literal) : undefined
  return value ? [value] : []
}

function getPropertyValue(
  object: ts.ObjectLiteralExpression,
  property: string,
): ts.Expression | undefined {
  for (const member of object.properties) {
    if (!ts.isPropertyAssignment(member)) continue
    const key = getPropertyNameText(member.name)
    if (key === property) return unwrapExpression(member.initializer)
  }
  return undefined
}

function getStringProperty(
  object: ts.ObjectLiteralExpression,
  property: string,
): string | undefined {
  return getStringLiteralValue(getPropertyValue(object, property))
}

function hasTrueProperty(object: ts.ObjectLiteralExpression, property: string): boolean {
  for (const member of object.properties) {
    if (!ts.isPropertyAssignment(member)) continue
    const key = getPropertyNameText(member.name)
    if (key !== property) continue
    return unwrapExpression(member.initializer).kind === ts.SyntaxKind.TrueKeyword
  }
  return false
}

function unwrapTypeNode(type: ts.TypeNode): ts.TypeNode {
  let current = type
  while (ts.isParenthesizedTypeNode(current)) current = current.type
  return current
}
