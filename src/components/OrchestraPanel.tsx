import { useState, useCallback, useRef, useEffect, memo } from "react"
import {
  Plus,
  Send,
  Square,
  Trash2,
  Bot,
  Terminal,
  ChevronDown,
  ChevronRight,
  Circle,
  User,
  ArrowDown,
  ArrowRight,
  Link,
  Unlink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { OrchestraAgent, AgentType, AgentRoute } from "@/hooks/useOrchestraAgents"

// ── Agent type metadata ───────────────────────────────────────────────────

const AGENT_META: Record<AgentType, { label: string; color: string; bgColor: string; barColor: string }> = {
  claude: { label: "Claude", color: "text-green-400", bgColor: "bg-green-500/20", barColor: "bg-green-400" },
  codex: { label: "Codex", color: "text-blue-400", bgColor: "bg-blue-500/20", barColor: "bg-blue-400" },
  gemini: { label: "Gemini", color: "text-yellow-400", bgColor: "bg-yellow-500/20", barColor: "bg-yellow-400" },
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  starting: { color: "text-yellow-400", label: "Starting..." },
  running: { color: "text-green-400", label: "Running" },
  stopped: { color: "text-muted-foreground", label: "Stopped" },
  error: { color: "text-red-400", label: "Error" },
}

// ── Tracked user messages ─────────────────────────────────────────────────

interface SentMessage {
  id: string
  timestamp: number
  agentId: string
  agentName: string
  agentType: AgentType
  content: string
}

// ── Model options per agent type ─────────────────────────────────────────

const MODEL_OPTIONS: Record<AgentType, Array<{ value: string; label: string }>> = {
  claude: [
    { value: "", label: "Default" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-opus-4-6", label: "Opus 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { value: "", label: "Default" },
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "codex-mini-latest", label: "codex-mini" },
  ],
  gemini: [
    { value: "", label: "Default" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
}

// ── Spawn Dialog ──────────────────────────────────────────────────────────

interface SpawnDialogProps {
  defaultProjectPath?: string
  onSpawn: (type: AgentType, projectPath: string, name: string, role: string, model: string, systemPrompt: string, enableTeams: boolean, agentsJson: string) => void
  onCancel: () => void
}

function SpawnDialog({ defaultProjectPath, onSpawn, onCancel }: SpawnDialogProps) {
  const [type, setType] = useState<AgentType>("claude")
  const [projectPath, setProjectPath] = useState(defaultProjectPath ?? "")
  const [name, setName] = useState("")
  const [role, setRole] = useState("general")
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [enableTeams, setEnableTeams] = useState(false)
  const [agentsJson, setAgentsJson] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset model when agent type changes
  useEffect(() => {
    setModel("")
  }, [type])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectPath.trim()) return
    onSpawn(type, projectPath.trim(), name.trim() || `${type}-agent`, role, model, systemPrompt.trim(), enableTeams, agentsJson.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border/50 rounded-lg bg-elevation-2 p-3 space-y-3">
      <div className="text-xs font-medium text-foreground">Spawn New Agent</div>

      {/* Agent type selector */}
      <div className="flex gap-1">
        {(["claude", "codex", "gemini"] as AgentType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
              type === t
                ? `${AGENT_META[t].bgColor} ${AGENT_META[t].color} ring-1 ring-current/20`
                : "text-muted-foreground hover:text-foreground bg-elevation-1"
            )}
          >
            {AGENT_META[t].label}
          </button>
        ))}
      </div>

      {/* Project path */}
      <input
        ref={inputRef}
        type="text"
        value={projectPath}
        onChange={(e) => setProjectPath(e.target.value)}
        placeholder="Project path (e.g. /Users/you/project)"
        className="w-full rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      />

      {/* Name, role, and model */}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name"
          className="flex-1 rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-border/50 bg-elevation-1 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        >
          <option value="general">General</option>
          <option value="planner">Planner</option>
          <option value="coder">Coder</option>
          <option value="reviewer">Reviewer</option>
          <option value="tester">Tester</option>
        </select>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border/50 bg-elevation-1 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        >
          {MODEL_OPTIONS[type].map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-2">
          {/* System prompt */}
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="System prompt (appended to default prompt)..."
            rows={3}
            className="w-full rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
          />

          {/* Custom agents JSON (Claude only) */}
          {type === "claude" && (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Custom Agents JSON</label>
              <textarea
                value={agentsJson}
                onChange={(e) => setAgentsJson(e.target.value)}
                placeholder={'[{"name":"reviewer","model":"claude-haiku-4-5-20251001","prompt":"Review code for bugs"}]'}
                rows={3}
                className="w-full rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
              />
            </div>
          )}

          {/* Agent Teams toggle (Claude only) */}
          {type === "claude" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTeams}
                onChange={(e) => setEnableTeams(e.target.checked)}
                className="rounded border-border/50 bg-elevation-1 text-blue-500 focus:ring-blue-500/50 h-3 w-3"
              />
              <span className="text-[11px] text-muted-foreground">
                Enable Agent Teams
                <span className="ml-1 text-[9px] text-amber-400/80">(experimental)</span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!projectPath.trim()}>
          Spawn
        </Button>
      </div>
    </form>
  )
}

// ── Agent Pill ────────────────────────────────────────────────────────────

const AgentPill = memo(function AgentPill({
  agent,
  selected,
  onSelect,
  onKill,
  onRemove,
}: {
  agent: OrchestraAgent
  selected: boolean
  onSelect: () => void
  onKill: (id: string) => void
  onRemove: (id: string) => void
}) {
  const meta = AGENT_META[agent.type]
  const statusInfo = STATUS_INDICATOR[agent.status] ?? STATUS_INDICATOR.error

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 border cursor-pointer transition-all",
        selected
          ? `${meta.bgColor} border-current/20 ${meta.color}`
          : "border-border/40 bg-elevation-1 hover:bg-elevation-2"
      )}
      onClick={onSelect}
    >
      <Circle className={cn("size-1.5 fill-current", statusInfo.color)} />
      <span className={cn("text-[11px] font-medium", selected ? meta.color : "text-foreground")}>
        {agent.name}
      </span>
      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{agent.role}</Badge>

      <div className="flex items-center gap-0.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
        {agent.status === "running" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="text-muted-foreground hover:text-red-400 transition-colors"
                onClick={() => onKill(agent.id)}
              >
                <Square className="size-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stop agent</TooltipContent>
          </Tooltip>
        )}
        {agent.status === "stopped" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="text-muted-foreground hover:text-red-400 transition-colors"
                onClick={() => onRemove(agent.id)}
              >
                <Trash2 className="size-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Remove agent</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
})

// ── User Message Bubble ──────────────────────────────────────────────────

function UserMessageBubble({ msg }: { msg: SentMessage }) {
  const meta = AGENT_META[msg.agentType]

  return (
    <div className="flex gap-0">
      <div className="w-[3px] shrink-0 rounded-full bg-blue-400" />
      <div className="flex-1 min-w-0 pl-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <User className="size-3 text-blue-400" />
          </div>
          <span className="text-xs font-medium text-blue-400">You</span>
          <span className="text-[10px] text-muted-foreground">
            → <span className={meta.color}>{msg.agentName}</span>
          </span>
        </div>
        <div className="rounded-md bg-blue-500/[0.06] border border-blue-500/10 px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    </div>
  )
}

// ── Agent Output Block ───────────────────────────────────────────────────

const AgentOutputBlock = memo(function AgentOutputBlock({
  agent,
  lines,
  allAgents,
  routeTargets,
  onAddRoute,
  onRemoveRoute,
}: {
  agent: OrchestraAgent
  lines: string[]
  allAgents: OrchestraAgent[]
  routeTargets: string[]
  onAddRoute: (sourceId: string, targetId: string) => void
  onRemoveRoute: (sourceId: string, targetId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const meta = AGENT_META[agent.type]
  const outputRef = useRef<HTMLDivElement>(null)
  const statusInfo = STATUS_INDICATOR[agent.status] ?? STATUS_INDICATOR.error

  useEffect(() => {
    if (outputRef.current && !collapsed) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines, collapsed])

  return (
    <div className="flex gap-0">
      {/* Left accent bar */}
      <div className={cn("w-[3px] shrink-0 rounded-full", meta.barColor)} />

      <div className="flex-1 min-w-0 pl-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", meta.bgColor)}>
            <Bot className={cn("size-3", meta.color)} />
          </div>
          <span className={cn("text-xs font-medium", meta.color)}>{agent.name}</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{meta.label}</Badge>
          <div className="flex items-center gap-1 ml-auto">
            <Circle className={cn("size-1.5 fill-current", statusInfo.color)} />
            <span className={cn("text-[10px]", statusInfo.color)}>{statusInfo.label}</span>
          </div>
          {lines.length > 0 && (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          )}
        </div>

        {/* Route indicators */}
        {routeTargets.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {routeTargets.map((targetId) => {
              const target = allAgents.find((a) => a.id === targetId)
              if (!target) return null
              const targetMeta = AGENT_META[target.type]
              return (
                <button
                  key={targetId}
                  onClick={() => onRemoveRoute(agent.id, targetId)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 hover:bg-indigo-500/20 transition-colors group"
                >
                  <ArrowRight className="size-2.5" />
                  <span className={targetMeta.color}>{target.name}</span>
                  <Unlink className="size-2.5 opacity-0 group-hover:opacity-100 text-red-400" />
                </button>
              )
            })}
          </div>
        )}

        {/* Route-to dropdown */}
        {agent.status === "running" && allAgents.filter((a) => a.id !== agent.id && a.status === "running").length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Link className="size-3 text-muted-foreground" />
                  <select
                    className="rounded-md border border-border/40 bg-elevation-1 px-1.5 py-0.5 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onAddRoute(agent.id, e.target.value)
                      e.target.value = ""
                    }}
                  >
                    <option value="">Route output to...</option>
                    {allAgents
                      .filter((a) => a.id !== agent.id && a.status === "running" && !routeTargets.includes(a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))
                    }
                  </select>
                </div>
              </TooltipTrigger>
              <TooltipContent>Auto-forward new output to another agent</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Terminal output */}
        {!collapsed && lines.length > 0 && (
          <div
            ref={outputRef}
            className="max-h-64 overflow-y-auto rounded-md bg-elevation-0 border border-border/30 px-3 py-2 font-mono text-[11px] text-foreground/80 leading-relaxed"
          >
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))}
          </div>
        )}

        {/* Empty state for starting agents */}
        {!collapsed && lines.length === 0 && (
          <div className="rounded-md bg-elevation-0 border border-border/30 px-3 py-4 flex items-center justify-center">
            <Terminal className="size-3.5 mr-2 text-muted-foreground opacity-50" />
            <span className="text-xs text-muted-foreground">
              {agent.status === "starting" ? "Starting agent..." : "Waiting for output..."}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

// ── Main OrchestraPanel ───────────────────────────────────────────────────

interface OrchestraPanelProps {
  agents: OrchestraAgent[]
  outputs: Record<string, string[]>
  routes: AgentRoute[]
  loading: boolean
  defaultProjectPath?: string
  onSpawn: (type: AgentType, projectPath: string, name: string, role: string, model: string, systemPrompt: string, enableTeams: boolean, agentsJson: string) => void
  onSend: (agentId: string, message: string) => void
  onKill: (agentId: string) => void
  onRemove: (agentId: string) => void
  onAddRoute: (sourceId: string, targetId: string) => void
  onRemoveRoute: (sourceId: string, targetId: string) => void
}

export function OrchestraPanel({
  agents,
  outputs,
  routes,
  loading,
  defaultProjectPath,
  onSpawn,
  onSend,
  onKill,
  onRemove,
  onAddRoute,
  onRemoveRoute,
}: OrchestraPanelProps) {
  const [showSpawn, setShowSpawn] = useState(false)
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSpawn = useCallback((type: AgentType, projectPath: string, name: string, role: string, model: string, systemPrompt: string, enableTeams: boolean, agentsJson: string) => {
    onSpawn(type, projectPath, name, role, model, systemPrompt, enableTeams, agentsJson)
    setShowSpawn(false)
  }, [onSpawn])

  // Auto-select first running agent when none selected
  useEffect(() => {
    if (!selectedAgentId || !agents.find((a) => a.id === selectedAgentId)) {
      const running = agents.find((a) => a.status === "running")
      if (running) setSelectedAgentId(running.id)
      else if (agents.length > 0) setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  // Auto-scroll when outputs change
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (isAtBottom) {
        scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }
    }
  }, [outputs, sentMessages])

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 40)
  }, [])

  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !selectedAgentId) return
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return

    setSentMessages((prev) => [...prev, {
      id: `msg-${Date.now()}`,
      timestamp: Date.now(),
      agentId: selectedAgentId,
      agentName: agent.name,
      agentType: agent.type,
      content: message.trim(),
    }])
    onSend(selectedAgentId, message.trim())
    setMessage("")
    inputRef.current?.focus()
  }, [message, selectedAgentId, agents, onSend])

  const runningCount = agents.filter((a) => a.status === "running").length
  const runningAgents = agents.filter((a) => a.status === "running")

  // Build timeline: interleave agent outputs with user messages
  // For now: show agent output blocks + user messages in a simple order
  const agentMessages = sentMessages.filter(
    (m) => agents.some((a) => a.id === m.agentId)
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-elevation-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Orchestra</h2>
          {agents.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {runningCount}/{agents.length} running
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setShowSpawn(!showSpawn)}
          disabled={loading}
        >
          <Plus className="size-3" />
          Add Agent
        </Button>
      </div>

      {/* Agent pills bar */}
      {agents.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 bg-elevation-1 overflow-x-auto">
          {agents.map((agent) => (
            <AgentPill
              key={agent.id}
              agent={agent}
              selected={agent.id === selectedAgentId}
              onSelect={() => setSelectedAgentId(agent.id)}
              onKill={onKill}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto"
        >
          <div className="mx-auto max-w-4xl py-4 px-4 space-y-4">
            {/* Spawn dialog */}
            {showSpawn && (
              <SpawnDialog
                defaultProjectPath={defaultProjectPath}
                onSpawn={handleSpawn}
                onCancel={() => setShowSpawn(false)}
              />
            )}

            {/* Timeline entries: agent outputs + user messages */}
            {agents.map((agent) => {
              const agentOutput = outputs[agent.id] ?? []
              const messagesForAgent = agentMessages.filter((m) => m.agentId === agent.id)

              return (
                <div key={agent.id} className="space-y-3">
                  {/* User messages sent to this agent */}
                  {messagesForAgent.map((msg) => (
                    <UserMessageBubble key={msg.id} msg={msg} />
                  ))}

                  {/* Agent output */}
                  <AgentOutputBlock
                    agent={agent}
                    lines={agentOutput}
                    allAgents={agents}
                    routeTargets={routes.filter((r) => r.sourceId === agent.id).map((r) => r.targetId)}
                    onAddRoute={onAddRoute}
                    onRemoveRoute={onRemoveRoute}
                  />
                </div>
              )
            })}

            {/* Empty state */}
            {agents.length === 0 && !showSpawn && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-elevation-2 border border-border/50 flex items-center justify-center mb-3">
                  <Bot className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">No agents yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  Spawn agents to start orchestrating. Each agent runs in its own tmux session
                  and can be Claude Code, Codex CLI, or Gemini CLI.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowSpawn(true)}
                >
                  <Plus className="size-3" />
                  Spawn your first agent
                </Button>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        </div>

        {/* Scroll to bottom */}
        {canScrollDown && (
          <button
            onClick={() => scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-elevation-3 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-elevation-2 shadow-md transition-all"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Shared message input */}
      {runningAgents.length > 0 && (
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5 bg-elevation-2"
        >
          <select
            value={selectedAgentId ?? ""}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="rounded-md border border-border/50 bg-elevation-1 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          >
            {runningAgents.map((a) => {
              const meta = AGENT_META[a.type]
              return (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              )
            })}
          </select>
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              selectedAgentId
                ? `Message ${agents.find((a) => a.id === selectedAgentId)?.name ?? "agent"}...`
                : "Select an agent..."
            }
            className="flex-1 rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <Button type="submit" size="sm" className="h-7 w-7 p-0" disabled={!message.trim() || !selectedAgentId}>
            <Send className="size-3" />
          </Button>
        </form>
      )}
    </div>
  )
}
