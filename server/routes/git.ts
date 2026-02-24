/**
 * Git branch & status routes.
 *
 * Provides branch listing, current branch, and working tree status
 * for the Git Branch View sidebar panel.
 */
import { execFileSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import {
  dirs,
  isWithinDir,
  readdir,
  readFile,
  open,
  join,
} from "../helpers"
import type { UseFn } from "../helpers"

// ── Types ──────────────────────────────────────────────────────────────────

export interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
  commitHash: string
  commitMessage: string
  upstream: string | null
  ahead: number
  behind: number
}

export interface GitFileStatus {
  path: string
  indexStatus: string  // X in XY
  workStatus: string   // Y in XY
}

export interface GitStatusInfo {
  currentBranch: string
  branches: GitBranchInfo[]
  stagedFiles: GitFileStatus[]
  changedFiles: GitFileStatus[]
  untrackedFiles: string[]
}

export interface GitLogEntry {
  hash: string
  hashShort: string
  parents: string[]
  message: string
  author: string
  date: string
  refs: string[]  // branch/tag labels
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveGitRoot(projectPath: string): string | null {
  try {
    const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim()
    return dirname(resolve(projectPath, commonDir))
  } catch {
    return null
  }
}

async function resolveProjectPath(projectDir: string, dirName: string): Promise<string> {
  try {
    const files = await readdir(projectDir)
    for (const f of files.filter((f: string) => f.endsWith(".jsonl"))) {
      try {
        const fh = await open(join(projectDir, f), "r")
        try {
          // Read enough to find cwd in the first few lines
          const buf = Buffer.alloc(8192)
          const { bytesRead } = await fh.read(buf, 0, 8192, 0)
          const lines = buf.subarray(0, bytesRead).toString("utf-8").split("\n")
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const parsed = JSON.parse(line)
              if (parsed.cwd) return parsed.cwd
            } catch {
              continue
            }
          }
        } finally {
          await fh.close()
        }
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return "/" + dirName.replace(/^-/, "").replace(/-/g, "/")
}

function getBranches(gitRoot: string): GitBranchInfo[] {
  try {
    // format: refname, objectname:short, subject, upstream, ahead, behind, HEAD
    const output = execFileSync(
      "git",
      [
        "for-each-ref",
        "--format=%(refname:short)%09%(objectname:short)%09%(subject)%09%(upstream:short)%09%(upstream:track,nobracket)%09%(HEAD)",
        "refs/heads/",
      ],
      { cwd: gitRoot, encoding: "utf-8", timeout: 5000 }
    ).trim()

    if (!output) return []

    return output.split("\n").map((line) => {
      const [name, hash, message, upstream, track, head] = line.split("\t")

      let ahead = 0
      let behind = 0
      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/)
        const behindMatch = track.match(/behind (\d+)/)
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
        if (behindMatch) behind = parseInt(behindMatch[1], 10)
      }

      return {
        name,
        isCurrent: head === "*",
        isRemote: false,
        commitHash: hash,
        commitMessage: message || "",
        upstream: upstream || null,
        ahead,
        behind,
      }
    })
  } catch {
    return []
  }
}

function getStatus(gitRoot: string): {
  staged: GitFileStatus[]
  changed: GitFileStatus[]
  untracked: string[]
} {
  try {
    const output = execFileSync("git", ["status", "--porcelain=v1", "-u"], {
      cwd: gitRoot,
      encoding: "utf-8",
      timeout: 5000,
    }).trim()

    const staged: GitFileStatus[] = []
    const changed: GitFileStatus[] = []
    const untracked: string[] = []

    if (!output) return { staged, changed, untracked }

    for (const line of output.split("\n")) {
      if (!line || line.length < 3) continue
      const x = line[0] // index status
      const y = line[1] // work-tree status
      const path = line.slice(3)

      if (x === "?" && y === "?") {
        untracked.push(path)
      } else {
        if (x !== " " && x !== "?") {
          staged.push({ path, indexStatus: x, workStatus: y })
        }
        if (y !== " " && y !== "?") {
          changed.push({ path, indexStatus: x, workStatus: y })
        }
      }
    }

    return { staged, changed, untracked }
  } catch {
    return { staged: [], changed: [], untracked: [] }
  }
}

function getLog(gitRoot: string, count = 40): GitLogEntry[] {
  try {
    const SEP = "%x00"
    const output = execFileSync(
      "git",
      [
        "log",
        "--all",
        "--topo-order",
        `--max-count=${count}`,
        `--format=%H${SEP}%h${SEP}%P${SEP}%s${SEP}%an${SEP}%aI${SEP}%D`,
      ],
      { cwd: gitRoot, encoding: "utf-8", timeout: 5000 }
    ).trim()

    if (!output) return []

    return output.split("\n").map((line) => {
      const [hash, hashShort, parentStr, message, author, date, refStr] = line.split("\0")
      const parents = parentStr ? parentStr.split(" ") : []
      const refs = refStr
        ? refStr.split(", ").map((r) => r.replace(/^HEAD -> /, "")).filter(Boolean)
        : []
      return { hash, hashShort, parents, message, author, date, refs }
    })
  } catch {
    return []
  }
}

function getCurrentBranch(gitRoot: string): string {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: gitRoot,
      encoding: "utf-8",
      timeout: 3000,
    }).trim()
  } catch {
    return ""
  }
}

// ── Route registration ────────────────────────────────────────────────────

export function registerGitRoutes(use: UseFn) {
  // GET /api/git/:dirName/status — full git status (branches + changes)
  use("/api/git", async (req, res, next) => {
    if (req.method !== "GET") return next()

    const url = new URL(req.url || "/", "http://localhost")
    const pathParts = url.pathname.split("/").filter(Boolean)

    // /api/git/:dirName/status or /api/git/:dirName/log
    if (pathParts.length !== 2 || (pathParts[1] !== "status" && pathParts[1] !== "log")) return next()

    const dirName = decodeURIComponent(pathParts[0])
    const projectDir = join(dirs.PROJECTS_DIR, dirName)

    if (!isWithinDir(dirs.PROJECTS_DIR, projectDir)) {
      res.statusCode = 403
      res.end(JSON.stringify({ error: "Access denied" }))
      return
    }

    const projectPath = await resolveProjectPath(projectDir, dirName)
    const gitRoot = resolveGitRoot(projectPath)

    const action = pathParts[1] as "status" | "log"
    res.setHeader("Content-Type", "application/json")

    if (!gitRoot) {
      if (action === "log") {
        res.end(JSON.stringify([]))
      } else {
        res.end(JSON.stringify({
          currentBranch: "",
          branches: [],
          stagedFiles: [],
          changedFiles: [],
          untrackedFiles: [],
        }))
      }
      return
    }

    if (action === "log") {
      const count = parseInt(url.searchParams.get("count") ?? "40", 10)
      const log = getLog(gitRoot, Math.min(count, 200))
      res.end(JSON.stringify(log))
      return
    }

    // action === "status"
    const currentBranch = getCurrentBranch(gitRoot)
    const branches = getBranches(gitRoot)
    const { staged, changed, untracked } = getStatus(gitRoot)

    const result: GitStatusInfo = {
      currentBranch,
      branches,
      stagedFiles: staged,
      changedFiles: changed,
      untrackedFiles: untracked,
    }

    res.end(JSON.stringify(result))
  })
}
