import 'server-only'

import { prisma } from '@/shared/db'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import type { RegisterPushTokenInput, RemovePushTokenInput } from './dto'

/**
 * Device tokens for the push channel (12.3). A token is PERSONAL DATA (`19`): it addresses
 * one person's device, so registration is `owner`-scoped, erasure deletes every row
 * (`performAnonymisation`, asserted in `privacy.integration.test.ts`), and the retention
 * sweeper prunes tokens unseen for 180 days.
 *
 * The upsert re-parents deliberately: a token already registered to ANOTHER account moves
 * to the caller, because a shared or resold device must notify whoever is signed in NOW —
 * the old owner keeping the address would leak the new owner's activity to a stranger's
 * account.
 */
export const registerPushToken = serviceMethod<RegisterPushTokenInput, { registered: true }>(
  'notification',
  'registerPushToken',
  {
    kind: 'owner',
    describe: 'the device token is written against the caller’s own userId, never a payload id',
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('User'))

    await prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId: actor.userId, token: input.token, platform: input.platform },
      update: { userId: actor.userId, platform: input.platform, lastSeenAt: new Date() },
    })

    return ok({ registered: true as const })
  },
)

/** Sign-out's leg: the device stops being an address for this account. Own rows only. */
export const removePushToken = serviceMethod<RemovePushTokenInput, { removed: boolean }>(
  'notification',
  'removePushToken',
  {
    kind: 'owner',
    describe: 'deletes only where token AND userId match — the ownership is the where clause',
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('User'))

    const result = await prisma.pushToken.deleteMany({
      where: { token: input.token, userId: actor.userId },
    })

    return ok({ removed: result.count > 0 })
  },
)
