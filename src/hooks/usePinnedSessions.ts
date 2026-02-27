import { useState, useEffect, useCallback } from "react"
import { authFetch } from "@/lib/auth"

interface PinnedSession {
  dirName: string
  fileName: string
  pinnedAt: string
}

export function usePinnedSessions() {
  const [pins, setPins] = useState<PinnedSession[]>([])

  const fetchPins = useCallback(async () => {
    try {
      const res = await authFetch("/api/session-pins")
      if (res.ok) {
        setPins(await res.json())
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchPins()
  }, [fetchPins])

  const isPinned = useCallback(
    (dirName: string, fileName: string) =>
      pins.some((p) => p.dirName === dirName && p.fileName === fileName),
    [pins]
  )

  const togglePin = useCallback(
    async (dirName: string, fileName: string) => {
      try {
        const res = await authFetch("/api/session-pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dirName, fileName }),
        })
        if (res.ok) {
          await fetchPins()
        }
      } catch { /* ignore */ }
    },
    [fetchPins]
  )

  return { pins, isPinned, togglePin, refetchPins: fetchPins }
}
