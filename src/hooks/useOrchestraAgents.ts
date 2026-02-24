import { useState, useEffect, useCallback, useRef } from "react"
import { authFetch, authUrl } from "@/lib/auth"

export type AgentType = "claude" | "codex" | "gemini"

export interface OrchestraAgent {
  id: string
  type: AgentType
  name: string
  role: string
  tmuxSession: string
  projectPath: string
  status: "starting" | "running" | "stopped" | "error"
  createdAt: string
}

export interface AgentOutput {
  agentId: string
  lines: string[]
}

export function useOrchestraAgents() {
  const [agents, setAgents] = useState<OrchestraAgent[]>([])
  const [outputs, setOutputs] = useState<Record<string, string[]>>({})
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

  // Spawn a new agent
  const spawnAgent = useCallback(async (opts: {
    type: AgentType
    projectPath: string
    name?: string
    role?: string
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
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSourceRef.current = es
    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [])

  return {
    agents,
    outputs,
    loading,
    spawnAgent,
    sendMessage,
    getOutput,
    killAgent,
    removeAgent,
    refreshAgents: fetchAgents,
  }
}
