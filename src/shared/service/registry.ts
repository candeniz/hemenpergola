import type { ActorContext } from '@/shared/context/actor'
import { type DomainError, type Result } from '@/shared/result'

import type { Permission } from '@/modules/iam/domain/permissions'

/**
 * The service registry — the mechanism behind *"a service method with no matrix entry fails
 * the build"* (`20-testing-strategy.md` §Integration, `26-execution-plan.md` row 1.8).
 *
 * Two halves, because either alone has a hole:
 *
 *   **The type.** `serviceMethod()` cannot be called without declaring how the method is
 *   authorised. There is no default and no optional field, so "I forgot" is a type error
 *   rather than an unguarded endpoint.
 *
 *   **The scan.** A developer can still export a plain `async function` from an
 *   `application/` file and never call `serviceMethod`. `test/authorisation-matrix.test.ts`
 *   parses every `application/*.ts`, lists its exported functions, and fails on any that is
 *   not registered. That is the half that makes the first half unavoidable.
 *
 * Wired in Phase 1 rather than Phase 6 on purpose: retrofitted later it means auditing
 * sixty methods at once, and every phase gate in between was never real.
 */

/**
 * How a method is authorised. Every service method declares exactly one of these — the
 * union is closed, so a new kind of authorisation is a deliberate change here rather than a
 * quiet omission at a call site.
 */
export type AuthorisationSpec =
  /** Company-scoped: `authorize(actor, permission)` decides. The common case. */
  | { kind: 'permission'; permission: Permission }
  /**
   * Ownership plus state, not a permission (`02` §Customer permissions). The service must
   * express ownership **in the `where` clause**, never as a post-fetch comparison
   * (`12` §Authorization rule 2). `describe` says which row is being scoped.
   */
  | { kind: 'owner'; describe: string }
  /** Global admin only. */
  | { kind: 'admin' }
  /** Requires a signed-in user and nothing more (e.g. "list my own companies"). */
  | { kind: 'authenticated' }
  /**
   * Deliberately reachable without a session — registration, login, public reads. `why` is
   * required so an anonymous method is a sentence somebody wrote, not a blank.
   */
  | { kind: 'anonymous'; why: string }

export type ServiceMethodMeta = {
  service: string
  method: string
  authorisation: AuthorisationSpec
}

export type RegisteredMethod<Input, Output> = ((
  actor: ActorContext,
  input: Input,
) => Promise<Result<Output, DomainError>>) & {
  readonly meta: ServiceMethodMeta
}

const REGISTRY = new Map<string, ServiceMethodMeta>()

export function methodKey(service: string, method: string): string {
  return `${service}.${method}`
}

/**
 * Declare a service method. The returned function is the method; its `meta` is what the
 * matrix suite enumerates.
 */
export function serviceMethod<Input, Output>(
  service: string,
  method: string,
  authorisation: AuthorisationSpec,
  implementation: (actor: ActorContext, input: Input) => Promise<Result<Output, DomainError>>,
): RegisteredMethod<Input, Output> {
  const key = methodKey(service, method)

  if (REGISTRY.has(key)) {
    throw new Error(`Service method ${key} is registered twice`)
  }

  const meta: ServiceMethodMeta = { service, method, authorisation }
  REGISTRY.set(key, meta)

  const wrapped = ((actor, input) => implementation(actor, input)) as RegisteredMethod<
    Input,
    Output
  >

  return Object.assign(wrapped, { meta })
}

/** Every registered method, sorted, for the matrix suite and for the coverage scan. */
export function registeredMethods(): ServiceMethodMeta[] {
  return [...REGISTRY.values()].sort((a, b) =>
    methodKey(a.service, a.method).localeCompare(methodKey(b.service, b.method)),
  )
}

export function isRegistered(service: string, method: string): boolean {
  return REGISTRY.has(methodKey(service, method))
}

/** Test-only: the registry is module state, and a suite that imports modules twice needs it. */
export function resetRegistryForTests(): void {
  REGISTRY.clear()
}
