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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { OrchestraAgent, AgentType } from "@/hooks/useOrchestraAgents"

// ── Agent type metadata ───────────────────────────────────────────────────

const AGENT_META: Record<AgentType, { label: string; color: string; bgColor: string }> = {
  claude: { label: "Claude", color: "text-green-400", bgColor: "bg-green-500/20" },
  codex: { label: "Codex", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  gemini: { label: "Gemini", color: "text-yellow-400", bgColor: "bg-yellow-500/20" },
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  starting: { color: "text-yellow-400", label: "Starting..." },
  running: { color: "text-green-400", label: "Running" },
  stopped: { color: "text-muted-foreground", label: "Stopped" },
  error: { color: "text-red-400", label: "Error" },
}

// ── Spawn Dialog ──────────────────────────────────────────────────────────

interface SpawnDialogProps {
  onSpawn: (type: AgentType, projectPath: string, name: string, role: string) => void
  onCancel: () => void
}

function SpawnDialog({ onSpawn, onCancel }: SpawnDialogProps) {
  const [type, setType] = useState<AgentType>("claude")
  const [projectPath, setProjectPath] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState("general")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectPath.trim()) return
    onSpawn(type, projectPath.trim(), name.trim() || `${type}-agent`, role)
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

      {/* Name and role */}
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
      </div>

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

// ── Agent Card ────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: OrchestraAgent
  output: string[]
  onSend: (agentId: string, message: string) => void
  onKill: (agentId: string) => void
  onRemove: (agentId: string) => void
}

const AgentCard = memo(function AgentCard({ agent, output, onSend, onKill, onRemove }: AgentCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [message, setMessage] = useState("")
  const outputRef = useRef<HTMLDivElement>(null)
  const meta = AGENT_META[agent.type]
  const statusInfo = STATUS_INDICATOR[agent.status] ?? STATUS_INDICATOR.error

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current && expanded) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, expanded])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    onSend(agent.id, message.trim())
    setMessage("")
  }

  return (
    <div className="border border-border/50 rounded-lg bg-elevation-2 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-elevation-3/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}

        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", meta.bgColor)}>
          <Bot className={cn("size-3", meta.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">{agent.name}</span>
          <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 h-4">{agent.role}</Badge>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <Circle className={cn("size-2 fill-current", statusInfo.color)} />
          <span className={cn("text-[10px]", statusInfo.color)}>{statusInfo.label}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {agent.status === "running" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
                  onClick={() => onKill(agent.id)}
                >
                  <Square className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop agent</TooltipContent>
            </Tooltip>
          )}
          {agent.status === "stopped" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
                  onClick={() => onRemove(agent.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove agent</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border/30">
          {/* Output area */}
          <div
            ref={outputRef}
            className="h-48 overflow-y-auto bg-elevation-0 px-3 py-2 font-mono text-[11px] text-foreground/80 leading-relaxed"
          >
            {output.length > 0 ? (
              output.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                <Terminal className="size-4 mr-2 opacity-50" />
                {agent.status === "starting" ? "Starting agent..." : "No output yet"}
              </div>
            )}
          </div>

          {/* Message input */}
          {agent.status === "running" && (
            <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border/30 px-3 py-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Send to ${agent.name}...`}
                className="flex-1 rounded-md border border-border/50 bg-elevation-1 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <Button type="submit" size="sm" className="h-7 w-7 p-0" disabled={!message.trim()}>
                <Send className="size-3" />
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
})

// ── Main OrchestraPanel ───────────────────────────────────────────────────

interface OrchestraPanelProps {
  agents: OrchestraAgent[]
  outputs: Record<string, string[]>
  loading: boolean
  onSpawn: (type: AgentType, projectPath: string, name: string, role: string) => void
  onSend: (agentId: string, message: string) => void
  onKill: (agentId: string) => void
  onRemove: (agentId: string) => void
}

export function OrchestraPanel({
  agents,
  outputs,
  loading,
  onSpawn,
  onSend,
  onKill,
  onRemove,
}: OrchestraPanelProps) {
  const [showSpawn, setShowSpawn] = useState(false)

  const handleSpawn = useCallback((type: AgentType, projectPath: string, name: string, role: string) => {
    onSpawn(type, projectPath, name, role)
    setShowSpawn(false)
  }, [onSpawn])

  const runningCount = agents.filter((a) => a.status === "running").length

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

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Spawn dialog */}
          {showSpawn && (
            <SpawnDialog onSpawn={handleSpawn} onCancel={() => setShowSpawn(false)} />
          )}

          {/* Agent cards */}
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              output={outputs[agent.id] ?? []}
              onSend={onSend}
              onKill={onKill}
              onRemove={onRemove}
            />
          ))}

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
        </div>
      </ScrollArea>
    </div>
  )
}
