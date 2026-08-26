import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as api from './endpoints'
import type { ApiResult } from './client'

/**
 * The query layer (`ADR-032`). Two disciplines, both enforced here rather than remembered
 * per screen:
 *
 *   **Every mutation invalidates the reads its transition staled.** Accepting a lead
 *   changes the inbox AND the detail AND (for the customer) the request list; the
 *   invalidation lists name all of them, because a stale copy on one side is `11`'s
 *   two-parties-reading-different-numbers bug in miniature.
 *
 *   **The server's answer is the truth.** No optimistic status writes anywhere — every
 *   transition helper resolves with what the server returned, and the screens render that.
 */

const keys = {
  leads: (companyId: string) => ['leads', companyId] as const,
  lead: (companyId: string, id: string) => ['lead', companyId, id] as const,
  projects: ['projects'] as const,
  matches: (projectId: string) => ['matches', projectId] as const,
  requests: (projectId: string) => ['requests', projectId] as const,
  offers: (offerRequestId: string) => ['offers', offerRequestId] as const,
  eligibility: (offerRequestId: string) => ['review-eligibility', offerRequestId] as const,
  thread: (offerRequestId: string) => ['thread', offerRequestId] as const,
  preferences: ['preferences'] as const,
}

/** Unwraps the envelope for react-query: an API error becomes a thrown error. */
async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.code)
  return result.data
}

/* ── manufacturer ───────────────────────────────────────────────────────── */

export const useLeads = (companyId: string) =>
  useQuery({ queryKey: keys.leads(companyId), queryFn: () => unwrap(api.listLeads(companyId)) })

export const useLead = (companyId: string, id: string) =>
  useQuery({
    queryKey: keys.lead(companyId, id),
    queryFn: () => unwrap(api.getLead(companyId, id)),
  })

export function useLeadTransition(companyId: string, offerRequestId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (run: () => Promise<ApiResult<unknown>>) => unwrap(run()),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.leads(companyId) })
      void client.invalidateQueries({ queryKey: keys.lead(companyId, offerRequestId) })
    },
  })
}

/* ── customer ───────────────────────────────────────────────────────────── */

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: () => unwrap(api.listProjects()) })

export const useMatches = (projectId: string) =>
  useQuery({ queryKey: keys.matches(projectId), queryFn: () => unwrap(api.getMatches(projectId)) })

export const useRequests = (projectId: string) =>
  useQuery({
    queryKey: keys.requests(projectId),
    queryFn: () => unwrap(api.listRequests(projectId)),
  })

export const useOffers = (offerRequestId: string) =>
  useQuery({
    queryKey: keys.offers(offerRequestId),
    queryFn: () => unwrap(api.getOffers(offerRequestId)),
  })

export const useEligibility = (offerRequestId: string) =>
  useQuery({
    queryKey: keys.eligibility(offerRequestId),
    queryFn: () => unwrap(api.reviewEligibility(offerRequestId)),
  })

export function useCustomerAction(projectId: string | null, offerRequestId: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (run: () => Promise<ApiResult<unknown>>) => unwrap(run()),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.projects })
      if (projectId !== null) {
        void client.invalidateQueries({ queryKey: keys.requests(projectId) })
      }
      if (offerRequestId !== null) {
        void client.invalidateQueries({ queryKey: keys.offers(offerRequestId) })
        void client.invalidateQueries({ queryKey: keys.eligibility(offerRequestId) })
      }
    },
  })
}

/* ── messaging — ADR-009's short-window polling, as configuration ───────── */

export function useThread(
  offerRequestId: string,
  side: 'customer' | 'company',
  companyId: string | null,
) {
  return useQuery({
    queryKey: keys.thread(offerRequestId),
    queryFn: () => unwrap(api.listThread(offerRequestId, side, companyId)),
    // The poll. Focus-aware for free: react-query pauses refetching in background apps,
    // which is exactly the battery argument ADR-009 made against a held-open socket.
    refetchInterval: 5_000,
  })
}

export function useSendMessage(
  offerRequestId: string,
  side: 'customer' | 'company',
  companyId: string | null,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => unwrap(api.sendMessage(offerRequestId, side, companyId, body)),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.thread(offerRequestId) }),
  })
}

/* ── preferences ────────────────────────────────────────────────────────── */

export const usePreferences = () =>
  useQuery({ queryKey: keys.preferences, queryFn: () => unwrap(api.listPreferences()) })

export function useSetPreference() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { channel: 'email' | 'sms' | 'push'; type: string; enabled: boolean }) =>
      unwrap(api.setPreference(input.channel, input.type, input.enabled)),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.preferences }),
  })
}
