/**
 * Orchestra agent management routes.
 *
 * Spawns and manages AI coding agents (Claude Code, Codex CLI, Gemini CLI)
 * via tmux sessions, providing a unified interface for multi-agent orchestration.
 */
import { spawn, execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { UseFn } from "../helpers"

// ── Types ──────────────────────────────────────────────────────────────────

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
  /** Buffered output lines from tmux capture-pane */
  outputBuffer: string[]
}

// ── In-memory stores ──────────────────────────────────────────────────────

const agents = new Map<string, OrchestraAgent>()

/** Routing rules: sourceAgentId → Set of targetAgentIds */
const routes = new Map<string, Set<string>>()

/** Previous output snapshot per agent (for diffing) */
const prevOutput = new Map<string, string[]>()

// ── Helpers ────────────────────────────────────────────────────────────────

function isTmuxAvailable(): boolean {
  try {
    execSync("which tmux", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function tmuxSessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function captureOutput(tmuxSession: string): string[] {
  try {
    const output = execSync(
      `tmux capture-pane -t ${tmuxSession} -p -S -50`,
      { encoding: "utf-8", timeout: 3000 }
    )
    return output.split("\n").filter((line) => line.trim() !== "")
  } catch {
    return []
  }
}

/** Diff two snapshots and return only lines that are new */
function diffLines(prev: string[], current: string[]): string[] {
  if (prev.length === 0) return current
  // Find where old snapshot ends in new snapshot
  const lastOld = prev[prev.length - 1]
  const idx = current.lastIndexOf(lastOld)
  if (idx === -1 || idx === current.length - 1) return []
  return current.slice(idx + 1)
}

/** Send text to a tmux session */
function sendToAgent(agent: OrchestraAgent, text: string) {
  if (!tmuxSessionExists(agent.tmuxSession)) return
  spawn("tmux", ["send-keys", "-t", agent.tmuxSession, text, "Enter"], {
    stdio: "ignore",
  })
}

function buildSpawnCommand(type: AgentType, projectPath: string): string {
  switch (type) {
    case "claude":
      return `cd "${projectPath}" && claude --print`
    case "codex":
      return `cd "${projectPath}" && codex`
    case "gemini":
      return `cd "${projectPath}" && gemini`
  }
}

// ── JSON body parser ──────────────────────────────────────────────────────

function parseBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
    req.on("error", reject)
  })
}

// ── Route registration ────────────────────────────────────────────────────

export function registerOrchestraRoutes(use: UseFn) {
  // GET /api/orchestra/agents — list all agents
  use("/api/orchestra/agents", (req, res, next) => {
    if (req.method !== "GET") return next()
    // Update status for each agent
    for (const agent of agents.values()) {
      if (agent.status === "running" && !tmuxSessionExists(agent.tmuxSession)) {
        agent.status = "stopped"
      }
    }
    const list = Array.from(agents.values()).map(({ outputBuffer: _, ...rest }) => rest)
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify(list))
  })

  // POST /api/orchestra/spawn — spawn a new agent
  use("/api/orchestra/spawn", async (req, res, next) => {
    if (req.method !== "POST") return next()
    try {
      const body = await parseBody(req)
      const type = body.type as AgentType
      const projectPath = body.projectPath as string
      const name = (body.name as string) || `${type}-agent`
      const role = (body.role as string) || "general"

      if (!type || !projectPath) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "type and projectPath are required" }))
        return
      }

      if (!isTmuxAvailable()) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: "tmux is not installed. Install it with: brew install tmux" }))
        return
      }

      const id = randomUUID().slice(0, 8)
      const tmuxSession = `cogpit-${type}-${id}`
      const cmd = buildSpawnCommand(type, projectPath)

      // Create tmux session with the agent command
      spawn("tmux", ["new-session", "-d", "-s", tmuxSession, "-x", "200", "-y", "50", cmd], {
        stdio: "ignore",
        detached: true,
      }).unref()

      const agent: OrchestraAgent = {
        id,
        type,
        name,
        role,
        tmuxSession,
        projectPath,
        status: "starting",
        createdAt: new Date().toISOString(),
        outputBuffer: [],
      }

      agents.set(id, agent)

      // Check status after a brief delay
      setTimeout(() => {
        if (tmuxSessionExists(tmuxSession)) {
          agent.status = "running"
        } else {
          agent.status = "error"
        }
      }, 1000)

      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ id, tmuxSession, status: "starting" }))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  // POST /api/orchestra/send — send a message to an agent
  use("/api/orchestra/send", async (req, res, next) => {
    if (req.method !== "POST") return next()
    try {
      const body = await parseBody(req)
      const agentId = body.agentId as string
      const message = body.message as string

      if (!agentId || !message) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "agentId and message are required" }))
        return
      }

      const agent = agents.get(agentId)
      if (!agent) {
        res.statusCode = 404
        res.end(JSON.stringify({ error: "Agent not found" }))
        return
      }

      if (!tmuxSessionExists(agent.tmuxSession)) {
        agent.status = "stopped"
        res.statusCode = 400
        res.end(JSON.stringify({ error: "Agent session is not running" }))
        return
      }

      // Send keys to tmux session
      spawn("tmux", ["send-keys", "-t", agent.tmuxSession, message, "Enter"], {
        stdio: "ignore",
      })

      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  // GET /api/orchestra/output/:agentId — get recent output from an agent
  use("/api/orchestra/output", (req, res, next) => {
    if (req.method !== "GET") return next()
    const url = new URL(req.url ?? "", `http://${req.headers.host}`)
    const agentId = url.searchParams.get("agentId")

    if (!agentId) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: "agentId query param is required" }))
      return
    }

    const agent = agents.get(agentId)
    if (!agent) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: "Agent not found" }))
      return
    }

    const lines = captureOutput(agent.tmuxSession)
    agent.outputBuffer = lines

    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ agentId, lines }))
  })

  // POST /api/orchestra/kill — kill an agent
  use("/api/orchestra/kill", async (req, res, next) => {
    if (req.method !== "POST") return next()
    try {
      const body = await parseBody(req)
      const agentId = body.agentId as string

      if (!agentId) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "agentId is required" }))
        return
      }

      const agent = agents.get(agentId)
      if (!agent) {
        res.statusCode = 404
        res.end(JSON.stringify({ error: "Agent not found" }))
        return
      }

      // Kill tmux session
      if (tmuxSessionExists(agent.tmuxSession)) {
        spawn("tmux", ["kill-session", "-t", agent.tmuxSession], { stdio: "ignore" })
      }

      agent.status = "stopped"
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  // DELETE /api/orchestra/agent — remove an agent from the list
  use("/api/orchestra/agent", async (req, res, next) => {
    if (req.method !== "DELETE") return next()
    try {
      const body = await parseBody(req)
      const agentId = body.agentId as string

      if (!agentId) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "agentId is required" }))
        return
      }

      const agent = agents.get(agentId)
      if (agent && tmuxSessionExists(agent.tmuxSession)) {
        spawn("tmux", ["kill-session", "-t", agent.tmuxSession], { stdio: "ignore" })
      }

      agents.delete(agentId)
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ success: true }))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  // GET /api/orchestra/routes — list all routing rules
  use("/api/orchestra/routes", (req, res, next) => {
    if (req.method !== "GET") return next()
    const result: Array<{ sourceId: string; targetId: string }> = []
    for (const [sourceId, targets] of routes.entries()) {
      for (const targetId of targets) {
        result.push({ sourceId, targetId })
      }
    }
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify(result))
  })

  // POST /api/orchestra/route — add or remove a routing rule
  use("/api/orchestra/route", async (req, res, next) => {
    if (req.method !== "POST") return next()
    try {
      const body = await parseBody(req)
      const sourceId = body.sourceId as string
      const targetId = body.targetId as string
      const action = (body.action as string) || "add"

      if (!sourceId || !targetId) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "sourceId and targetId are required" }))
        return
      }
      if (sourceId === targetId) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "Cannot route an agent to itself" }))
        return
      }
      if (!agents.has(sourceId) || !agents.has(targetId)) {
        res.statusCode = 404
        res.end(JSON.stringify({ error: "Source or target agent not found" }))
        return
      }

      if (action === "remove") {
        const set = routes.get(sourceId)
        if (set) {
          set.delete(targetId)
          if (set.size === 0) routes.delete(sourceId)
        }
      } else {
        let set = routes.get(sourceId)
        if (!set) {
          set = new Set()
          routes.set(sourceId, set)
        }
        set.add(targetId)
      }

      // Return updated routes for this source
      const targets = routes.get(sourceId)
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ sourceId, targets: targets ? Array.from(targets) : [] }))
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  // GET /api/orchestra/stream — SSE stream of agent outputs (all agents)
  use("/api/orchestra/stream", (req, res, next) => {
    if (req.method !== "GET") return next()

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")

    // Send initial agent list
    const list = Array.from(agents.values()).map(({ outputBuffer: _, ...rest }) => rest)
    res.write(`data: ${JSON.stringify({ type: "init", agents: list })}\n\n`)

    // Poll agent outputs every 2 seconds
    const interval = setInterval(() => {
      for (const agent of agents.values()) {
        // Update status
        if (agent.status === "running" && !tmuxSessionExists(agent.tmuxSession)) {
          agent.status = "stopped"
          res.write(`data: ${JSON.stringify({ type: "status", agentId: agent.id, status: "stopped" })}\n\n`)
          continue
        }

        if (agent.status === "running" || agent.status === "starting") {
          if (agent.status === "starting" && tmuxSessionExists(agent.tmuxSession)) {
            agent.status = "running"
          }
          const lines = captureOutput(agent.tmuxSession)
          if (lines.length > 0) {
            // Auto-forward new output to routed targets
            const prev = prevOutput.get(agent.id) ?? []
            const newLines = diffLines(prev, lines)
            prevOutput.set(agent.id, lines)

            if (newLines.length > 0) {
              const targets = routes.get(agent.id)
              if (targets) {
                const combined = newLines.join("\n")
                for (const targetId of targets) {
                  const target = agents.get(targetId)
                  if (target && target.status === "running") {
                    sendToAgent(target, `[From ${agent.name}]: ${combined}`)
                    res.write(`data: ${JSON.stringify({ type: "routed", sourceId: agent.id, targetId, lineCount: newLines.length })}\n\n`)
                  }
                }
              }
            }

            res.write(`data: ${JSON.stringify({ type: "output", agentId: agent.id, lines })}\n\n`)
          }
        }
      }
    }, 2000)

    req.on("close", () => {
      clearInterval(interval)
    })
  })
}
