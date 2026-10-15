import assert from 'node:assert/strict'

import {
  ChannelAccessError,
  canAccessChannel,
  resolveChannelAccess,
  resolveRequestedChannelId,
} from '../lib/channel-access'
import {
  assertChannelQueueScope,
  assertChannelStorageKey,
  buildChannelStorageKey,
} from '../lib/channel-scope'
import type { SessionUser } from '../lib/auth-shared'

const CHANNEL_A = 'a1000000-0000-4000-8000-000000000001'
const CHANNEL_B = 'a1000000-0000-4000-8000-000000000002'
const USER_ID = 'b2000000-0000-4000-8000-000000000001'

function session(input: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: USER_ID,
    username: 'operator-a',
    role: 'operator',
    channelIds: [CHANNEL_B],
    ...input,
  }
}

function expectChannelAccessError(run: () => unknown, code: string) {
  assert.throws(run, (error: unknown) => {
    assert(error instanceof ChannelAccessError)
    assert.equal(error.code, code)
    return true
  })
}

const operator = resolveChannelAccess(session({ role: 'admin', channelIds: [CHANNEL_B] }), {
  databaseRole: 'operator',
  operatorChannelIds: [CHANNEL_A],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'database',
})
assert(operator)
assert.equal(operator.role, 'operator', 'database role must override the signed session role')
assert.deepEqual(operator.channelIds, [CHANNEL_A], 'database assignment must override session channel claims')
assert.equal(operator.assignedChannelId, CHANNEL_A)
assert.equal(operator.isSuperAdmin, false)
assert.equal(canAccessChannel(operator, CHANNEL_A), true)
assert.equal(canAccessChannel(operator, CHANNEL_B), false)
assert.equal(resolveRequestedChannelId(operator, undefined), CHANNEL_A)
expectChannelAccessError(() => resolveRequestedChannelId(operator, CHANNEL_B), 'CHANNEL_NOT_FOUND')

assert.equal(resolveChannelAccess(session(), {
  databaseRole: 'operator',
  operatorChannelIds: [],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'database',
}), null, 'an operator without an assignment must not authenticate')

assert.equal(resolveChannelAccess(session(), {
  databaseRole: 'operator',
  operatorChannelIds: [CHANNEL_A, CHANNEL_B],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'database',
}), null, 'an operator with multiple assignments must not authenticate')

const superAdmin = resolveChannelAccess(session({ role: 'operator', channelIds: [] }), {
  databaseRole: 'super_admin',
  operatorChannelIds: [],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'database',
})
assert(superAdmin)
assert.equal(superAdmin.role, 'admin')
assert.equal(superAdmin.isSuperAdmin, true)
assert.deepEqual(superAdmin.channelIds, [CHANNEL_A, CHANNEL_B])
assert.equal(resolveRequestedChannelId(superAdmin, CHANNEL_B), CHANNEL_B)
expectChannelAccessError(() => resolveRequestedChannelId(superAdmin, 'a1000000-0000-4000-8000-000000000099'), 'CHANNEL_NOT_FOUND')

const configuredOperator = resolveChannelAccess(session({
  userId: 'env:operator-a',
  channelIds: [CHANNEL_A],
}), {
  databaseRole: 'operator',
  operatorChannelIds: [CHANNEL_A],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'trusted_configuration',
})
assert(configuredOperator)
assert.deepEqual(configuredOperator.channelIds, [CHANNEL_A])

assert.equal(resolveChannelAccess(session({
  userId: 'env:operator-a',
  channelIds: [CHANNEL_A, CHANNEL_B],
}), {
  databaseRole: 'operator',
  operatorChannelIds: [CHANNEL_A, CHANNEL_B],
  allChannelIds: [CHANNEL_A, CHANNEL_B],
  identitySource: 'trusted_configuration',
}), null)

const storageKey = buildChannelStorageKey({
  channelId: CHANNEL_A,
  category: 'platform-packages',
  segments: ['package-1', 'clip.mp4'],
})
assert.equal(storageKey, `channels/${CHANNEL_A}/platform-packages/package-1/clip.mp4`)
expectChannelAccessError(
  () => buildChannelStorageKey({
    channelId: CHANNEL_A,
    category: 'platform-packages',
    segments: ['..', 'clip.mp4'],
  }),
  'INVALID_STORAGE_KEY',
)
assert.doesNotThrow(() => assertChannelStorageKey(CHANNEL_A, storageKey))
expectChannelAccessError(
  () => assertChannelStorageKey(CHANNEL_B, storageKey),
  'CROSS_CHANNEL_STORAGE_ACCESS',
)
assert.doesNotThrow(() => assertChannelQueueScope(CHANNEL_A, CHANNEL_A))
expectChannelAccessError(
  () => assertChannelQueueScope(CHANNEL_A, CHANNEL_B),
  'CROSS_CHANNEL_QUEUE_ACCESS',
)

console.log('PASS channel authorization, storage scope, and queue scope isolation')
