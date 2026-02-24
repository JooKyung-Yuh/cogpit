import { useState, useEffect, useCallback, useRef } from "react"
import {
  GitBranch,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FileCode2,
  Circle,
  ArrowUp,
  ArrowDown,
  FolderOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { authFetch } from "@/lib/auth"
import { useGitStatus } from "@/hooks/useGitStatus"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { GitGraph } from "@/components/GitGraph"
import type { GitStatusInfo, GitBranchInfo, GitFileStatus } from "../../server/routes/git"

// ── Types ──────────────────────────────────────────────────────────────────

interface ProjectOption {
  dirName: string
  shortName: string
  isActive: boolean  // has a running agent process
}

interface GitBranchPanelProps {
  /** dirName from the currently loaded session or selected project */
  defaultDirName: string | null
}

// ── Sub-components ─────────────────────────────────────────────────────────

const statusLabels: Record<string, { label: string; color: string }> = {
  M: { label: "Modified", color: "text-amber-400" },
  A: { label: "Added", color: "text-emerald-400" },
  D: { label: "Deleted", color: "text-red-400" },
  R: { label: "Renamed", color: "text-blue-400" },
  C: { label: "Copied", color: "text-blue-400" },
  U: { label: "Unmerged", color: "text-purple-400" },
}

function FileStatusLine({ file, type }: { file: GitFileStatus; type: "staged" | "changed" }) {
  const statusChar = type === "staged" ? file.indexStatus : file.workStatus
  const info = statusLabels[statusChar] ?? { label: statusChar, color: "text-muted-foreground" }

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono py-0.5 px-1">
      <span className={cn("shrink-0 w-3 text-center", info.color)}>{statusChar}</span>
      <span className="truncate text-foreground/80">{file.path}</span>
    </div>
  )
}

function BranchItem({ branch }: { branch: GitBranchInfo }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        branch.isCurrent
          ? "bg-blue-500/10 text-blue-400"
          : "text-foreground/80 hover:bg-elevation-1/50"
      )}
    >
      {branch.isCurrent ? (
        <Circle className="size-2 fill-blue-400 text-blue-400 shrink-0" />
      ) : (
        <GitBranch className="size-3 text-muted-foreground shrink-0" />
      )}
      <span className="truncate font-medium">{branch.name}</span>
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {branch.ahead > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
            <ArrowUp className="size-2.5" />
            {branch.ahead}
          </span>
        )}
        {branch.behind > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400">
            <ArrowDown className="size-2.5" />
            {branch.behind}
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">{branch.commitHash}</span>
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function GitBranchPanel({ defaultDirName }: GitBranchPanelProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedDirName, setSelectedDirName] = useState<string | null>(defaultDirName)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const projectPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedRef = useRef(selectedDirName)
  selectedRef.current = selectedDirName
  const defaultRef = useRef(defaultDirName)
  defaultRef.current = defaultDirName

  // Sync selection when default changes (e.g. user loads a different session)
  useEffect(() => {
    if (defaultDirName) setSelectedDirName(defaultDirName)
  }, [defaultDirName])

  // Fetch project list + detect active projects
  const fetchProjects = useCallback(async () => {
    try {
      setProjectsLoading(true)
      const [projRes, sessRes] = await Promise.all([
        authFetch("/api/projects"),
        authFetch("/api/active-sessions"),
      ])
      if (!projRes.ok || !sessRes.ok) return

      const projData: Array<{ dirName: string; shortName: string }> = await projRes.json()
      const sessData: Array<{ dirName: string; isActive?: boolean }> = await sessRes.json()

      const activeDirNames = new Set(
        sessData.filter((s) => s.isActive).map((s) => s.dirName)
      )

      const options: ProjectOption[] = projData.map((p) => ({
        dirName: p.dirName,
        shortName: p.shortName,
        isActive: activeDirNames.has(p.dirName),
      }))

      options.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return a.shortName.localeCompare(b.shortName)
      })

      setProjects(options)

      // Auto-select first active project if nothing selected
      if (!selectedRef.current && !defaultRef.current) {
        const firstActive = options.find((p) => p.isActive)
        if (firstActive) setSelectedDirName(firstActive.dirName)
        else if (options.length > 0) setSelectedDirName(options[0].dirName)
      }
    } catch {
      // ignore
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
    projectPollRef.current = setInterval(fetchProjects, 30_000)
    return () => {
      if (projectPollRef.current) clearInterval(projectPollRef.current)
    }
  }, [fetchProjects])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [dropdownOpen])

  const { status, log, loading, refetch } = useGitStatus(selectedDirName)

  const selectedProject = projects.find((p) => p.dirName === selectedDirName)
  const displayName = selectedProject?.shortName ?? selectedDirName?.split("-").pop() ?? "—"

  return (
    <div className="flex flex-col h-full">
      {/* Header: project selector + current branch + refresh */}
      <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border/50">
        {/* Project selector */}
        <div className="flex items-center gap-1">
          <div className="relative flex-1 min-w-0" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((p) => !p)}
              className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-[11px] font-medium bg-elevation-1 border border-border/50 hover:bg-elevation-2 transition-colors"
            >
              <FolderOpen className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate flex-1 text-left">{displayName}</span>
              {selectedProject?.isActive && (
                <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" title="Agent active" />
              )}
              <ChevronDown className={cn("size-3 text-muted-foreground shrink-0 transition-transform", dropdownOpen && "rotate-180")} />
            </button>

          {/* Dropdown */}
          {dropdownOpen && projects.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-elevation-0 shadow-lg">
              {projects.map((p) => (
                <button
                  key={p.dirName}
                  onClick={() => {
                    setSelectedDirName(p.dirName)
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left transition-colors",
                    p.dirName === selectedDirName
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-foreground/80 hover:bg-elevation-1"
                  )}
                >
                  {p.isActive && (
                    <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  )}
                  {!p.isActive && <span className="w-1.5 shrink-0" />}
                  <span className="truncate">{p.shortName}</span>
                </button>
              ))}
            </div>
          )}
          </div>
          <button
            onClick={fetchProjects}
            disabled={projectsLoading}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-elevation-1 transition-colors shrink-0"
            title="Refresh project list"
          >
            <RefreshCw className={cn("size-3", projectsLoading && "animate-spin")} />
          </button>
        </div>

        {/* Current branch + refresh */}
        {status && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <GitBranch className="size-3 text-blue-400 shrink-0" />
              <span className="text-[11px] font-medium truncate">{status.currentBranch || "detached"}</span>
            </div>
            <button
              onClick={refetch}
              disabled={loading}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-elevation-1 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {!selectedDirName && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <GitBranch className="size-8 mb-2 opacity-40" />
          <p className="text-sm">Select a project to view git status</p>
        </div>
      )}

      {selectedDirName && !status && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <GitBranch className="size-6 mb-2 opacity-40" />
          <p className="text-xs">Not a git repository</p>
        </div>
      )}

      {selectedDirName && loading && !status && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {status && (
        <div className="flex-1 overflow-y-auto">
          {/* ── CHANGES ─────────────────────────────────────── */}
          {(status.stagedFiles.length > 0 || status.changedFiles.length > 0 || status.untrackedFiles.length > 0) && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-elevation-1/50 transition-colors group border-b border-border/30">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                <span>Changes</span>
                <span className="ml-auto text-[10px] font-normal tabular-nums">
                  {status.stagedFiles.length + status.changedFiles.length + status.untrackedFiles.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-2 space-y-1.5 border-b border-border/30">
                  {status.stagedFiles.length > 0 && (
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group w-full px-1">
                        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                        <FileCode2 className="size-3 text-emerald-400" />
                        <span>Staged ({status.stagedFiles.length})</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 rounded-md border border-border/50 bg-elevation-1/50 p-1">
                          {status.stagedFiles.map((f) => (
                            <FileStatusLine key={`s-${f.path}`} file={f} type="staged" />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {status.changedFiles.length > 0 && (
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group w-full px-1">
                        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                        <FileCode2 className="size-3 text-amber-400" />
                        <span>Changed ({status.changedFiles.length})</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 rounded-md border border-border/50 bg-elevation-1/50 p-1">
                          {status.changedFiles.map((f) => (
                            <FileStatusLine key={`c-${f.path}`} file={f} type="changed" />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {status.untrackedFiles.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group w-full px-1">
                        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                        <FileCode2 className="size-3 text-muted-foreground" />
                        <span>Untracked ({status.untrackedFiles.length})</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 rounded-md border border-border/50 bg-elevation-1/50 p-1">
                          {status.untrackedFiles.map((f) => (
                            <div key={f} className="flex items-center gap-2 text-[10px] font-mono py-0.5 px-1">
                              <span className="shrink-0 w-3 text-center text-muted-foreground">?</span>
                              <span className="truncate text-foreground/80">{f}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ── BRANCHES ────────────────────────────────────── */}
          {status.branches.length > 0 && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-elevation-1/50 transition-colors group border-b border-border/30">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                <span>Branches</span>
                <span className="ml-auto text-[10px] font-normal tabular-nums">
                  {status.branches.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-2 space-y-0.5 border-b border-border/30">
                  {status.branches
                    .sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : a.name.localeCompare(b.name)))
                    .map((branch) => (
                      <BranchItem key={branch.name} branch={branch} />
                    ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ── GRAPH ───────────────────────────────────────── */}
          {log.length > 0 && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-elevation-1/50 transition-colors group border-b border-border/30">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                <span>Graph</span>
                <span className="ml-auto text-[10px] font-normal tabular-nums">
                  {log.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-2">
                  <GitGraph log={log} currentBranch={status.currentBranch} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  )
}
