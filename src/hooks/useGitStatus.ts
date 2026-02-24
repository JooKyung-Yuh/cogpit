import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch } from "@/lib/auth"
import type { GitStatusInfo, GitLogEntry } from "../../server/routes/git"

const POLL_INTERVAL = 15_000

export function useGitStatus(dirName: string | null) {
  const [status, setStatus] = useState<GitStatusInfo | null>(null)
  const [log, setLog] = useState<GitLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    if (!dirName) return
    try {
      setLoading(true)
      const encoded = encodeURIComponent(dirName)
      const [statusRes, logRes] = await Promise.all([
        authFetch(`/api/git/${encoded}/status`),
        authFetch(`/api/git/${encoded}/log?count=80`),
      ])
      if (statusRes.ok) {
        setStatus(await statusRes.json())
      }
      if (logRes.ok) {
        setLog(await logRes.json())
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [dirName])

  useEffect(() => {
    if (!dirName) {
      setStatus(null)
      setLog([])
      setLoading(false)
      return
    }

    fetchAll()
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [dirName, fetchAll])

  return { status, log, loading, error, refetch: fetchAll }
}
