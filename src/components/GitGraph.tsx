import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { GitLogEntry } from "../../server/routes/git"

// ── Constants ──────────────────────────────────────────────────────────────

const ROW_H = 26
const LANE_W = 14
const DOT_R = 3.5
const GRAPH_PAD_LEFT = 8

const LANE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
]

// ── Graph layout algorithm ────────────────────────────────────────────────

interface GraphNode {
  entry: GitLogEntry
  lane: number
  /** Which lanes are active (occupied) on this row — used for pass-through lines */
  activeLanes: number[]
}

/**
 * Edge to draw: from (row, lane) to (row, lane).
 * color is the lane color index of the edge.
 */
interface GraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  colorLane: number
}

function computeGraph(entries: GitLogEntry[]): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxLane: number
} {
  if (entries.length === 0) return { nodes: [], edges: [], maxLane: 0 }

  const hashToRow = new Map<string, number>()
  for (let i = 0; i < entries.length; i++) {
    hashToRow.set(entries[i].hash, i)
  }

  // columns[i] = hash expected at lane i, or null if lane is free
  let columns: (string | null)[] = []
  let maxLane = 0
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (let row = 0; row < entries.length; row++) {
    const entry = entries[row]

    // Find which lane this commit occupies
    let lane = columns.indexOf(entry.hash)
    if (lane === -1) {
      // New branch — find first free lane
      lane = columns.indexOf(null)
      if (lane === -1) {
        lane = columns.length
        columns.push(null)
      }
    }

    // Clear this commit from its lane
    columns[lane] = null

    // Record active lanes before updating (for pass-through lines)
    const activeLanes = columns.map((_, i) => i).filter((i) => columns[i] !== null)
    activeLanes.push(lane) // include self

    // Process parents
    const parents = entry.parents.filter((h) => hashToRow.has(h))

    if (parents.length >= 1) {
      const firstParent = parents[0]
      // First parent continues in same lane
      if (columns[lane] === null) {
        columns[lane] = firstParent
      } else {
        // Lane was taken — find new lane for first parent
        let newLane = columns.indexOf(null)
        if (newLane === -1) {
          newLane = columns.length
          columns.push(null)
        }
        columns[newLane] = firstParent
      }
    }

    for (let pi = 1; pi < parents.length; pi++) {
      const parentHash = parents[pi]
      // Check if parent already has a reserved lane
      const existingLane = columns.indexOf(parentHash)
      if (existingLane !== -1) continue // already tracked

      // Allocate new lane for merge parent
      let newLane = columns.indexOf(null)
      if (newLane === -1) {
        newLane = columns.length
        columns.push(null)
      }
      columns[newLane] = parentHash
    }

    // Track max lane
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] !== null && i > maxLane) maxLane = i
    }
    if (lane > maxLane) maxLane = lane

    // Build edges: from this row to parent rows
    for (const parentHash of parents) {
      const parentRow = hashToRow.get(parentHash)!
      const parentLane = columns.indexOf(parentHash)
      if (parentLane === -1) continue

      edges.push({
        fromRow: row,
        fromLane: lane,
        toRow: parentRow,
        toLane: parentLane,
        colorLane: parentLane,
      })
    }

    nodes.push({ entry, lane, activeLanes })

    // Trim trailing nulls from columns
    while (columns.length > 0 && columns[columns.length - 1] === null) {
      columns.pop()
    }
  }

  return { nodes, edges, maxLane }
}

// ── SVG helpers ───────────────────────────────────────────────────────────

function laneX(lane: number): number {
  return GRAPH_PAD_LEFT + lane * LANE_W + LANE_W / 2
}

function rowY(row: number): number {
  return row * ROW_H + ROW_H / 2
}

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]
}

function edgePath(e: GraphEdge): string {
  const x1 = laneX(e.fromLane)
  const y1 = rowY(e.fromRow)
  const x2 = laneX(e.toLane)
  const y2 = rowY(e.toRow)

  if (x1 === x2) {
    // Straight vertical line
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  // Curved: go down one row in current lane, then curve to target lane, then go straight down
  const stepY = ROW_H * 0.8
  if (e.toRow - e.fromRow <= 1) {
    // Adjacent rows — simple curve
    return `M ${x1} ${y1} C ${x1} ${y1 + stepY}, ${x2} ${y2 - stepY}, ${x2} ${y2}`
  }

  // Multi-row: curve out from source, go straight in target lane, arrive at target
  const curveEndY = y1 + ROW_H
  return `M ${x1} ${y1} C ${x1} ${y1 + stepY}, ${x2} ${curveEndY - stepY}, ${x2} ${curveEndY} L ${x2} ${y2}`
}

// ── Component ─────────────────────────────────────────────────────────────

interface GitGraphProps {
  log: GitLogEntry[]
  currentBranch?: string
}

export function GitGraph({ log, currentBranch }: GitGraphProps) {
  const { nodes, edges, maxLane } = useMemo(() => computeGraph(log), [log])

  if (nodes.length === 0) return null

  const graphW = GRAPH_PAD_LEFT + (maxLane + 1) * LANE_W + 4
  const totalH = nodes.length * ROW_H

  return (
    <div className="flex flex-col">
      <div className="overflow-x-hidden overflow-y-auto max-h-[500px] rounded-md border border-border/50 bg-elevation-1/30">
        <div className="flex" style={{ minHeight: totalH }}>
          {/* SVG graph lanes */}
          <svg
            width={graphW}
            height={totalH}
            className="shrink-0"
            style={{ minWidth: graphW }}
          >
            {/* Draw edges */}
            {edges.map((e, i) => (
              <path
                key={i}
                d={edgePath(e)}
                fill="none"
                stroke={laneColor(e.colorLane)}
                strokeWidth={1.5}
                opacity={0.55}
              />
            ))}

            {/* Draw dots */}
            {nodes.map((node, row) => {
              const cx = laneX(node.lane)
              const cy = rowY(row)
              const color = laneColor(node.lane)
              const isMerge = node.entry.parents.length > 1

              return (
                <circle
                  key={node.entry.hashShort}
                  cx={cx}
                  cy={cy}
                  r={DOT_R}
                  fill={isMerge ? "var(--color-elevation-0, #0d1117)" : color}
                  stroke={color}
                  strokeWidth={isMerge ? 2 : 0}
                />
              )
            })}
          </svg>

          {/* Commit info rows */}
          <div className="flex-1 min-w-0">
            {nodes.map((node) => {
              const { entry } = node
              const isHead = entry.refs.includes(currentBranch ?? "")

              return (
                <div
                  key={entry.hashShort}
                  className="flex items-center gap-1.5 px-1.5 hover:bg-elevation-1/50 transition-colors"
                  style={{ height: ROW_H }}
                >
                  {/* Ref badges */}
                  {entry.refs.length > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {entry.refs.map((ref) => {
                        const isCurrent = ref === currentBranch
                        const isTag = ref.startsWith("tag: ")
                        const isHEAD = ref === "HEAD"
                        if (isHEAD) return null
                        return (
                          <span
                            key={ref}
                            className={cn(
                              "rounded px-1 py-px text-[9px] font-medium leading-tight truncate max-w-[80px]",
                              isCurrent
                                ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
                                : isTag
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-muted/50 text-muted-foreground"
                            )}
                          >
                            {ref.replace("tag: ", "")}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Message */}
                  <span className={cn(
                    "text-[11px] truncate flex-1",
                    isHead ? "text-foreground font-medium" : "text-foreground/70"
                  )}>
                    {entry.message}
                  </span>

                  {/* Hash */}
                  <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                    {entry.hashShort}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
