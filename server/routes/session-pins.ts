import { readFile, writeFile, join } from "../helpers"
import type { UseFn } from "../helpers"
import { getConfig } from "../config"

interface PinnedSession {
  dirName: string
  fileName: string
  pinnedAt: string
}

function getPinsPath(): string | null {
  const config = getConfig()
  if (!config) return null
  return join(config.claudeDir, "cogpit-pins.json")
}

async function loadPins(): Promise<PinnedSession[]> {
  const path = getPinsPath()
  if (!path) return []
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function savePins(pins: PinnedSession[]): Promise<void> {
  const path = getPinsPath()
  if (!path) return
  await writeFile(path, JSON.stringify(pins, null, 2), "utf-8")
}

export function registerSessionPinRoutes(use: UseFn) {
  // GET /api/session-pins — list all pinned sessions
  use("/api/session-pins", async (req, res, next) => {
    if (req.method === "GET") {
      // req.url is relative to mount point — "/" for exact match
      if (req.url && req.url !== "/" && req.url !== "" && !req.url.startsWith("?")) return next()

      const pins = await loadPins()
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(pins))
      return
    }

    if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk: Buffer) => { body += chunk.toString() })
      req.on("end", async () => {
        try {
          const { dirName, fileName, action } = JSON.parse(body)
          if (!dirName || !fileName) {
            res.statusCode = 400
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: "dirName and fileName required" }))
            return
          }

          const pins = await loadPins()

          if (action === "unpin") {
            const filtered = pins.filter(
              (p) => !(p.dirName === dirName && p.fileName === fileName)
            )
            await savePins(filtered)
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ pinned: false }))
            return
          }

          // Default: pin (toggle — if already pinned, unpin)
          const existing = pins.findIndex(
            (p) => p.dirName === dirName && p.fileName === fileName
          )
          if (existing >= 0) {
            pins.splice(existing, 1)
            await savePins(pins)
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ pinned: false }))
          } else {
            pins.unshift({ dirName, fileName, pinnedAt: new Date().toISOString() })
            await savePins(pins)
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ pinned: true }))
          }
        } catch {
          res.statusCode = 400
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: "Invalid JSON body" }))
        }
      })
      return
    }

    next()
  })
}
