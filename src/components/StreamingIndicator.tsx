import { memo } from "react"
import { Loader2 } from "lucide-react"
import type { Turn } from "@/lib/types"

interface StreamingIndicatorProps {
  turn: Turn
  elapsedSec?: number
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

/** Infer what the agent is currently doing based on the last content block */
function detectActivity(turn: Turn): string {
  const blocks = turn.contentBlocks
  if (blocks.length === 0) return "Working..."

  // Walk backwards to find the most recent meaningful block
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]

    if (block.kind === "tool_calls") {
      const pending = block.toolCalls.find((tc) => tc.result === null)
      if (pending) {
        return `Running ${pending.name}...`
      }
    }

    if (block.kind === "thinking") {
      // Check if the last thinking block is still being written
      // (no subsequent text or tool_calls)
      const hasLaterContent = blocks.slice(i + 1).some(
        (b) => b.kind === "text" || b.kind === "tool_calls"
      )
      if (!hasLaterContent) return "Thinking..."
    }

    if (block.kind === "text") {
      // Text block at the end means agent is still writing
      const hasLaterToolCalls = blocks.slice(i + 1).some(
        (b) => b.kind === "tool_calls"
      )
      if (!hasLaterToolCalls) return "Writing..."
    }
  }

  return "Working..."
}

export const StreamingIndicator = memo(function StreamingIndicator({
  turn,
  elapsedSec,
}: StreamingIndicatorProps) {
  const activity = detectActivity(turn)

  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <div className="relative flex items-center justify-center w-5 h-5">
        <Loader2 className="size-3.5 text-blue-400 animate-spin" />
      </div>
      <span className="text-xs text-muted-foreground">{activity}</span>
      {elapsedSec !== undefined && elapsedSec > 0 && (
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
          {formatElapsed(elapsedSec)}
        </span>
      )}
      {/* Streaming dots animation */}
      <div className="flex items-center gap-0.5 ml-auto">
        <span className="w-1 h-1 rounded-full bg-blue-400/60 animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 rounded-full bg-blue-400/60 animate-pulse" style={{ animationDelay: "300ms" }} />
        <span className="w-1 h-1 rounded-full bg-blue-400/60 animate-pulse" style={{ animationDelay: "600ms" }} />
      </div>
    </div>
  )
})
