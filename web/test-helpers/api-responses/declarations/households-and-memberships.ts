import nativeHouseholdMembershipsDeleteDefault from '../../../../api-fixtures/v1/responses/native.household-memberships.delete.default.json'
import nativeHouseholdMembershipsEmpty from '../../../../api-fixtures/v1/responses/native.household-memberships.empty.json'
import nativeHouseholdMembershipsMultiple from '../../../../api-fixtures/v1/responses/native.household-memberships.multiple.json'
import nativeHouseholdMembershipsPage1 from '../../../../api-fixtures/v1/responses/native.household-memberships.page-1.json'
import nativeHouseholdMembershipsPage2 from '../../../../api-fixtures/v1/responses/native.household-memberships.page-2.json'
import nativeHouseholdMembershipsSingle from '../../../../api-fixtures/v1/responses/native.household-memberships.single.json'
import nativeHouseholdsCreateDefault from '../../../../api-fixtures/v1/responses/native.households.create.default.json'
import nativeHouseholdsEmpty from '../../../../api-fixtures/v1/responses/native.households.empty.json'
import nativeHouseholdsMemberDefault from '../../../../api-fixtures/v1/responses/native.households.member.default.json'
import nativeHouseholdsMemberPage2 from '../../../../api-fixtures/v1/responses/native.households.member.page-2.json'
import nativeHouseholdsMultiple from '../../../../api-fixtures/v1/responses/native.households.multiple.json'
import nativeHouseholdsOwned from '../../../../api-fixtures/v1/responses/native.households.owned.json'
import nativeHouseholdsSingleOwned from '../../../../api-fixtures/v1/responses/native.households.single-owned.json'
import type { HouseholdResponseBody, ListResponse } from '@/types/api-responses'
import type { Household, HouseholdMembership as Membership } from '@/types/my'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const HOUSEHOLDS_AND_MEMBERSHIPS_DECLARATIONS = [
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.empty',
    nativeHouseholdsEmpty,
    context => context.server.households.getHouseholds(),
    [context => context.client.households.getHouseholdsClient()],
  ),
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.single-owned',
    nativeHouseholdsSingleOwned,
    context => context.server.households.getHouseholds(),
    [context => context.client.households.getHouseholdsClient()],
  ),
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.multiple',
    nativeHouseholdsMultiple,
    context => context.server.households.getHouseholds(),
    [context => context.client.households.getHouseholdsClient()],
  ),
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.owned',
    nativeHouseholdsOwned,
    context => context.server.households.getHouseholds({ access: 'owned', limit: 1 }),
    [context => context.client.households.getHouseholdsClient({ access: 'owned', limit: 1 })],
  ),
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.member.default',
    nativeHouseholdsMemberDefault,
    context => context.server.households.getHouseholds({ access: 'member', limit: 1 }),
    [context => context.client.households.getHouseholdsClient({ access: 'member', limit: 1 })],
  ),
  defineWebApiFixture<ListResponse<Household>>()(
    'native.households.member.page-2',
    nativeHouseholdsMemberPage2,
    context =>
      context.server.households.getHouseholds({
        access: 'member',
        after:
          'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDAwOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiIsInNjb3BlIjoiaG91c2Vob2xkczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDE6YWNjZXNzPW1lbWJlcjp1cGRhdGVkX2F0LWRlc2MsaWQtZGVzYyJ9',
        limit: 1,
      }),
    [
      context =>
        context.client.households.getHouseholdsClient({
          access: 'member',
          after:
            'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDAwOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiIsInNjb3BlIjoiaG91c2Vob2xkczowMDAwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDE6YWNjZXNzPW1lbWJlcjp1cGRhdGVkX2F0LWRlc2MsaWQtZGVzYyJ9',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<HouseholdResponseBody>()(
    'native.households.create.default',
    nativeHouseholdsCreateDefault,
    context => context.client.households.createHousehold({}),
  ),
  defineWebApiFixture<ListResponse<Membership>>()(
    'native.household-memberships.empty',
    nativeHouseholdMembershipsEmpty,
    context =>
      context.client.households.getHouseholdMembershipsClient(
        '00000000-0000-7000-8000-000000000101',
      ),
    [
      context =>
        context.server.households.getHouseholdMemberships('00000000-0000-7000-8000-000000000101'),
    ],
  ),
  defineWebApiFixture<ListResponse<Membership>>()(
    'native.household-memberships.single',
    nativeHouseholdMembershipsSingle,
    context =>
      context.client.households.getHouseholdMembershipsClient(
        '00000000-0000-7000-8000-000000000101',
      ),
    [
      context =>
        context.server.households.getHouseholdMemberships('00000000-0000-7000-8000-000000000101'),
    ],
  ),
  defineWebApiFixture<ListResponse<Membership>>()(
    'native.household-memberships.multiple',
    nativeHouseholdMembershipsMultiple,
    context =>
      context.client.households.getHouseholdMembershipsClient(
        '00000000-0000-7000-8000-000000000101',
      ),
    [
      context =>
        context.server.households.getHouseholdMemberships('00000000-0000-7000-8000-000000000101'),
    ],
  ),
  defineWebApiFixture<ListResponse<Membership>>()(
    'native.household-memberships.page-1',
    nativeHouseholdMembershipsPage1,
    context =>
      context.client.households.getHouseholdMembershipsClient(
        '00000000-0000-7000-8000-000000000101',
        { limit: 1 },
      ),
    [
      context =>
        context.server.households.getHouseholdMemberships('00000000-0000-7000-8000-000000000101', {
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<Membership>>()(
    'native.household-memberships.page-2',
    nativeHouseholdMembershipsPage2,
    context =>
      context.client.households.getHouseholdMembershipsClient(
        '00000000-0000-7000-8000-000000000101',
        {
          after:
            'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAyVDAwOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSIsInNjb3BlIjoiaG91c2Vob2xkLW1lbWJlcnNoaXBzOjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMTp1cGRhdGVkX2F0LWRlc2MsaWQtZGVzYyJ9',
          limit: 1,
        },
      ),
    [
      context =>
        context.server.households.getHouseholdMemberships('00000000-0000-7000-8000-000000000101', {
          after:
            'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAyVDAwOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSIsInNjb3BlIjoiaG91c2Vob2xkLW1lbWJlcnNoaXBzOjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMTp1cGRhdGVkX2F0LWRlc2MsaWQtZGVzYyJ9',
          limit: 1,
        }),
    ],
  ),
  defineWebApiFixture<null>()(
    'native.household-memberships.delete.default',
    nativeHouseholdMembershipsDeleteDefault,
    context =>
      context.client.households.removeHouseholdMembership(
        '00000000-0000-7000-8000-000000000101',
        '00000000-0000-7000-8000-000000000201',
      ),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
