import { useState } from "react"
import { ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScrollToBottomButtonProps {
  onClick: () => void
  /** Show expanded pill with label text (e.g. "New response") */
  showLabel?: boolean
  /** Label text (default: "New response") */
  label?: string
  /** Agent is actively streaming */
  isStreaming?: boolean
}

export function ScrollToBottomButton({
  onClick,
  showLabel = false,
  label = "New response",
  isStreaming = false,
}: ScrollToBottomButtonProps) {
  const [hovered, setHovered] = useState(false)

  // Expand pill when: completed label requested, OR hovering during streaming
  const expanded = showLabel || (isStreaming && hovered)
  const pillText = showLabel ? label : "Streaming..."

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute left-1/2 -translate-x-1/2 bottom-3 z-20",
        "flex items-center justify-center overflow-hidden",
        "rounded-full bg-elevation-3/90 backdrop-blur-md border border-border/60",
        "text-muted-foreground hover:text-foreground hover:bg-elevation-2",
        "shadow-lg shadow-black/20",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        // Streaming breathe: subtle opacity pulse
        isStreaming && !showLabel && "animate-[breathe_2.5s_ease-in-out_infinite]",
        expanded
          ? "h-8 gap-1.5 pl-2.5 pr-3"
          : "h-8 w-8 gap-0"
      )}
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="size-4 shrink-0" />
      <span
        className={cn(
          "text-[11px] font-medium whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          expanded
            ? "w-auto opacity-100"
            : "w-0 opacity-0"
        )}
      >
        {pillText}
      </span>
    </button>
  )
}
