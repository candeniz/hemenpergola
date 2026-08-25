import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'

import { SessionProvider } from '../src/state/session'
import { colors } from '../src/theme'

/**
 * The root layout — providers plus one stack (`ADR-032`).
 *
 * expo-router's file tree IS the linking table: every screen below gets a URL under the
 * `hemenpergola://` scheme for free, which is the property Phase 13's push notifications
 * were bought against — a notification tap becomes `router.push(url)` and nothing more.
 *
 * The query client is deliberately mild: data on these screens is personal and small, so
 * a 30 s staleness window keeps back-navigation instant without a refetch storm, and ONE
 * retry — the API client already does the 401-refresh dance, and piling query retries on
 * auth retries is how a dead session hammers the rate limit.
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.panel },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.page },
          }}
        />
        <StatusBar style="auto" />
      </SessionProvider>
    </QueryClientProvider>
  )
}
