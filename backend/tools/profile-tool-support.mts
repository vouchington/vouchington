import { nullable, objectSchema, successSchema } from './output-schema-shapes.mts'
import { componentPropertySchema, componentSchema } from './route-response-schema.mts'

export type ProfileLinkToolFields = {
  url?: string | null
  handle?: string | null
  name?: string | null
}

export const PROFILE_LINK_ID_PARAMETER = {
  type: 'string',
  format: 'uuid',
  description: 'The ID of one of the current user’s profile links.',
}

/**
 * The link fields a profile link's owner can set. The link's image is not one of them: an MCP caller
 * has no way to upload an image, so a link tool never needs to name one.
 */
export const PROFILE_LINK_FIELD_PARAMETERS = {
  url: {
    anyOf: [{ type: 'null' }, { type: 'string' }],
    description:
      'An http or https URL without a fragment. Required for a url link; null clears it on a platform link.',
  },
  handle: {
    anyOf: [{ type: 'null' }, { type: 'string', maxLength: 255 }],
    description:
      'The account handle on a platform link: letters, numbers, underscores and hyphens only. Null clears it.',
  },
  name: {
    anyOf: [{ type: 'null' }, { type: 'string', maxLength: 255 }],
    description: 'A label shown for the link, or null for none.',
  },
}

export const PROFILE_LINK_TYPE_PARAMETER = {
  ...componentSchema('ProfileLinkType'),
  description: 'The kind of link: a plain url or a social platform.',
}

export const BIO_PARAMETERS = {
  type: 'object',
  properties: {
    markdown: {
      type: 'string',
      maxLength: 10_000,
      description:
        'The new bio, in Markdown, up to 10,000 characters. It replaces the whole bio; send an empty string to clear it.',
    },
  },
  required: ['markdown'],
  additionalProperties: false,
}

export const REORDER_PARAMETERS = {
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: PROFILE_LINK_ID_PARAMETER,
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      description: 'Every one of the current user’s profile link IDs, in the order to show them.',
    },
  },
  required: ['ids'],
  additionalProperties: false,
}

export const IDENTITY_PARAMETERS = {
  type: 'object',
  properties: {
    use_display_name_from: {
      ...componentPropertySchema('UpdateIdentityRequest', 'use_display_name_from'),
      description:
        'Where the display name comes from: the username, or a connected sign-in account.',
    },
    profile_image_id: {
      anyOf: [{ type: 'null' }, { type: 'string', format: 'uuid' }],
      description:
        'The ID of an image the current user uploaded, to use as the avatar, or null to remove it.',
    },
  },
  minProperties: 1,
  additionalProperties: false,
}

// The profile routes document their bodies inline, so the tools take the documented entities from
// the generated components. A test pins them to those routes.
export const BIO_RESULT_SCHEMA = successSchema({ profile: componentSchema('UserProfile') })
export const PROFILE_LINK_RESULT_SCHEMA = successSchema({
  profile_link: componentSchema('ProfileLink'),
})
export const PROFILE_LINKS_RESULT_SCHEMA = successSchema({
  results: { type: 'array', items: componentSchema('ProfileLink') },
})

const DISPLAY_NAME_SOURCES = componentPropertySchema(
  'UpdateIdentityRequest',
  'use_display_name_from',
)['enum'] as string[]

// The identity route returns the whole private user. The tool returns only the two fields it can
// write, spelled the way that body spells them.
export const IDENTITY_RESULT_SCHEMA = successSchema({
  identity: objectSchema({
    use_display_name_from: {
      anyOf: [...DISPLAY_NAME_SOURCES.map(source => ({ const: source })), { type: 'null' }],
    },
    profile_image_id: nullable({ type: 'string' }),
  }),
})
