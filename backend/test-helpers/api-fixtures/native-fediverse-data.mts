export const topicId = '00000000-0000-7000-8000-00000000f001'
export const hostnameId = '00000000-0000-7000-8000-00000000f002'
export const unclassifiedTopicId = '00000000-0000-7000-8000-00000000f003'
export const unclassifiedHostnameId = '00000000-0000-7000-8000-00000000f004'
export const unknownRegistrationsTopicId = '00000000-0000-7000-8000-00000000f005'
const unknownRegistrationsHostnameId = '00000000-0000-7000-8000-00000000f006'
const fixtureUser = { __entity_type: 'user', id: 'user-1', username: 'testuser', roles: [] }

export const instanceTopic = {
  __entity_type: 'topic',
  id: topicId,
  name: 'social.example',
  slug: 'social-example',
  markdown: 'A community-run Mastodon instance.',
  aliases: [],
  topic_type: 'fediverse_instance',
  noindex: false,
  allow_reviews: true,
  created_at: '2026-01-01T00:00:00Z',
  hostname_id: hostnameId,
  hostname: {
    __entity_type: 'hostname',
    id: hostnameId,
    hostname: 'social.example',
    topic_id: topicId,
  },
  homepage_url_id: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  referral_program_slug: null,
  lingua_rs_detected_language: null,
  created_by: fixtureUser,
  updated_by: fixtureUser,
}

export const instanceAttributes = {
  software: 'mastodon',
  protocol: 'activitypub',
  nodeinfo_software_version: '4.4.0',
  total_users: 1200,
  monthly_active_users: 340,
  open_registrations: true,
  nodeinfo_raw: null,
  integration_status: 'approved',
}
export const publicInstanceAttributes = {
  software: instanceAttributes.software,
  protocol: instanceAttributes.protocol,
  nodeinfo_software_version: instanceAttributes.nodeinfo_software_version,
  total_users: instanceAttributes.total_users,
  monthly_active_users: instanceAttributes.monthly_active_users,
  open_registrations: instanceAttributes.open_registrations,
}

export const unclassifiedTopic = makeInstanceTopic({
  id: unclassifiedTopicId,
  hostnameId: unclassifiedHostnameId,
  hostname: 'unknown.example',
  markdown: '',
})
export const unknownRegistrationsTopic = makeInstanceTopic({
  id: unknownRegistrationsTopicId,
  hostnameId: unknownRegistrationsHostnameId,
  hostname: 'lemmy.example',
  markdown: '',
})
export const unclassifiedAttributes = {
  software: null,
  protocol: null,
  nodeinfo_software_version: null,
  total_users: null,
  monthly_active_users: null,
  open_registrations: false,
  nodeinfo_raw: null,
  integration_status: 'pending',
}
export const publicUnclassifiedAttributes = {
  software: unclassifiedAttributes.software,
  protocol: unclassifiedAttributes.protocol,
  nodeinfo_software_version: unclassifiedAttributes.nodeinfo_software_version,
  total_users: unclassifiedAttributes.total_users,
  monthly_active_users: unclassifiedAttributes.monthly_active_users,
  open_registrations: unclassifiedAttributes.open_registrations,
}
export const unknownRegistrationsAttributes = {
  software: 'lemmy',
  protocol: 'activitypub',
  nodeinfo_software_version: '0.19.12',
  total_users: 500,
  monthly_active_users: 80,
  open_registrations: null,
  nodeinfo_raw: null,
  integration_status: 'approved',
}
export const publicUnknownRegistrationsAttributes = {
  software: unknownRegistrationsAttributes.software,
  protocol: unknownRegistrationsAttributes.protocol,
  nodeinfo_software_version: unknownRegistrationsAttributes.nodeinfo_software_version,
  total_users: unknownRegistrationsAttributes.total_users,
  monthly_active_users: unknownRegistrationsAttributes.monthly_active_users,
  open_registrations: unknownRegistrationsAttributes.open_registrations,
}
export const topicElection = {
  __entity_type: 'topic_election',
  id: topicId,
  votes_score_net: 8,
  votes_count_up: 10,
  votes_count_down: 2,
}

function makeInstanceTopic(input: {
  id: string
  hostnameId: string
  hostname: string
  markdown: string
}) {
  return {
    ...instanceTopic,
    id: input.id,
    name: input.hostname,
    slug: input.hostname.replace('.', '-'),
    markdown: input.markdown,
    hostname_id: input.hostnameId,
    hostname: {
      __entity_type: 'hostname',
      id: input.hostnameId,
      hostname: input.hostname,
      topic_id: input.id,
    },
  }
}
