/**
 * The server action written the wrong way — and the wrong way is subtle enough that it
 * shipped once.
 *
 * Moving an action out of `modules/*​/application/` and into `app/` is necessary (an action
 * is an adapter, and `05-system-architecture.md` §ActorContext defines `application/` as
 * framework-agnostic) but it is not *sufficient*. A page imports the action file statically,
 * and this file imports `auth-service` statically, so `auth-service` — and therefore `env`
 * and the Prisma client — is still in the page's build-time module graph. The file moved;
 * the graph did not.
 *
 * What kept the build secret-free was never the file's location. It was laziness deep in
 * the chain.
 *
 * `test/module-boundary.test.ts` lints this and expects the error.
 * Not compiled, not routed, not shipped.
 */
'use server'

import { login } from '@/modules/iam/application/auth-service'
import { loginSchema } from '@/modules/iam/application/dto'

export async function loginAction(input: unknown) {
  return login({} as never, loginSchema.parse(input))
}
