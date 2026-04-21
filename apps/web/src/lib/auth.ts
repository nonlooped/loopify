import { useQuery } from "@tanstack/react-query"

import { apiFetch } from "./api.js"

export type AuthState = {
  isSignedIn: boolean
  isLoading: boolean
  userId: string | null
}

export function useAuth(): AuthState {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await apiFetch("/api/me")
      if (r.status === 401) {
        return { userId: null as string | null }
      }
      if (!r.ok) {
        throw new Error("me")
      }
      const data = (await r.json()) as { userId: string }
      return { userId: data.userId }
    },
    retry: false,
    staleTime: 30_000,
  })

  return {
    isSignedIn: Boolean(q.data?.userId),
    isLoading: q.isPending,
    userId: q.data?.userId ?? null,
  }
}
