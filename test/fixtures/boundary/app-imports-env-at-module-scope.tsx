/**
 * The second committed boundary violation: the shape that actually shipped twice.
 *
 * Both bugs looked exactly like this — a perfectly ordinary static import at the top of a
 * route file. Next evaluates it while collecting page data, which is build time, so
 * `pnpm build` starts demanding production secrets and the fix in
 * `23-deployment-and-environments.md` §Configuration is silently undone.
 *
 * `test/module-boundary.test.ts` lints this and expects both imports to be reported.
 * Not compiled, not routed, not shipped.
 */
import { env } from '@/shared/config/env'
import { checkHealth } from '@/modules/platform/application/health-service'

export default function Page() {
  return { env, checkHealth }
}
