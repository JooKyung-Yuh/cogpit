import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch, authUrl } from "@/lib/auth"

export type AgentType = "claude" | "codex" | "gemini"

export interface OrchestraAgent {
  id: string
  type: AgentType
  name: string
  role: string
  model: string
  systemPrompt: string
  tmuxSession: string
  projectPath: string
  status: "starting" | "running" | "stopped" | "error"
  createdAt: string
}

export interface AgentOutput {
  agentId: string
  lines: string[]
}

export interface AgentRoute {
  sourceId: string
  targetId: string
}

export function useOrchestraAgents() {
  const [agents, setAgents] = useState<OrchestraAgent[]>([])
  const [outputs, setOutputs] = useState<Record<string, string[]>>({})
  const [routes, setRoutes] = useState<AgentRoute[]>([])
  const [loading, setLoading] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch agent list
  const fetchAgents = useCallback(async () => {
    try {
      const res = await authFetch("/api/orchestra/agents")
      if (res.ok) {
        const list = await res.json()
        setAgents(list)
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch routing rules
  const fetchRoutes = useCallback(async () => {
    try {
      const res = await authFetch("/api/orchestra/routes")
      if (res.ok) {
        const list: AgentRoute[] = await res.json()
        setRoutes(list)
      }
    } catch {
      // ignore
    }
  }, [])

  // Spawn a new agent
  const spawnAgent = useCallback(async (opts: {
    type: AgentType
    projectPath: string
    name?: string
    role?: string
    model?: string
    systemPrompt?: string
    enableTeams?: boolean
    agentsJson?: string
  }) => {
    setLoading(true)
    try {
      const res = await authFetch("/api/orchestra/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      })
      const data = await res.json()
      if (res.ok) {
        // Refresh list after a brief delay to get updated status
        setTimeout(fetchAgents, 1500)
      }
      return data
    } finally {
      setLoading(false)
    }
  }, [fetchAgents])

  // Send message to agent
  const sendMessage = useCallback(async (agentId: string, message: string) => {
    await authFetch("/api/orchestra/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, message }),
    })
  }, [])

  // Get output from agent
  const getOutput = useCallback(async (agentId: string) => {
    try {
      const res = await authFetch(`/api/orchestra/output?agentId=${agentId}`)
      if (res.ok) {
        const data: AgentOutput = await res.json()
        setOutputs((prev) => ({ ...prev, [agentId]: data.lines }))
        return data.lines
      }
    } catch {
      // ignore
    }
    return []
  }, [])

  // Kill an agent
  const killAgent = useCallback(async (agentId: string) => {
    await authFetch("/api/orchestra/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    })
    await fetchAgents()
  }, [fetchAgents])

  // Remove an agent from list
  const removeAgent = useCallback(async (agentId: string) => {
    await authFetch("/api/orchestra/agent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    })
    setAgents((prev) => prev.filter((a) => a.id !== agentId))
    setOutputs((prev) => {
      const next = { ...prev }
      delete next[agentId]
      return next
    })
    // Clean up routes involving this agent
    setRoutes((prev) => prev.filter((r) => r.sourceId !== agentId && r.targetId !== agentId))
  }, [])

  // Add a routing rule (source output → target input)
  const addRoute = useCallback(async (sourceId: string, targetId: string) => {
    try {
      const res = await authFetch("/api/orchestra/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, targetId, action: "add" }),
      })
      if (res.ok) {
        setRoutes((prev) => {
          if (prev.some((r) => r.sourceId === sourceId && r.targetId === targetId)) return prev
          return [...prev, { sourceId, targetId }]
        })
      }
    } catch {
      // ignore
    }
  }, [])

  // Remove a routing rule
  const removeRoute = useCallback(async (sourceId: string, targetId: string) => {
    try {
      const res = await authFetch("/api/orchestra/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, targetId, action: "remove" }),
      })
      if (res.ok) {
        setRoutes((prev) => prev.filter((r) => !(r.sourceId === sourceId && r.targetId === targetId)))
      }
    } catch {
      // ignore
    }
  }, [])

  // SSE stream for real-time updates
  useEffect(() => {
    const es = new EventSource(authUrl("/api/orchestra/stream"))

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "init") {
          setAgents(data.agents)
        } else if (data.type === "output") {
          setOutputs((prev) => ({ ...prev, [data.agentId]: data.lines }))
        } else if (data.type === "status") {
          setAgents((prev) =>
            prev.map((a) => (a.id === data.agentId ? { ...a, status: data.status } : a))
          )
        } else if (data.type === "routed") {
          // Could show a toast or indicator — for now just tracked via routes state
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSourceRef.current = es

    // Fetch initial routes
    fetchRoutes()

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [fetchRoutes])

  return {
    agents,
    outputs,
    routes,
    loading,
    spawnAgent,
    sendMessage,
    getOutput,
    killAgent,
    removeAgent,
    addRoute,
    removeRoute,
    refreshAgents: fetchAgents,
  }
}
