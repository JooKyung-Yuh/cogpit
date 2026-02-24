import { useState, useEffect, type HTMLAttributes } from "react"
import { highlightCode } from "@/lib/shiki"
import { cn } from "@/lib/utils"

// ── Dark mode detection (reactive via MutationObserver) ─────────────────────

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  )
  useEffect(() => {
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains("dark"))
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

// ── Parse language from className ───────────────────────────────────────────

function parseLang(className: string | undefined): string | null {
  if (!className) return null
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : null
}

// ── MarkdownCodeBlock component ─────────────────────────────────────────────

type CodeProps = HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode
  className?: string
  node?: unknown
}

export function MarkdownCodeBlock({ children, className, node: _node, ...rest }: CodeProps) {
  const isInline = !className && typeof children === "string" && !children.includes("\n")
  const lang = parseLang(className)
  const code = String(children).replace(/\n$/, "")

  if (isInline) {
    return (
      <code
        className={cn(
          "text-foreground bg-elevation-1 px-1 rounded text-[0.85em]",
          className
        )}
        {...rest}
      >
        {children}
      </code>
    )
  }

  return <HighlightedCodeBlock code={code} lang={lang} {...rest} />
}

// ── Highlighted code block with Shiki ───────────────────────────────────────

function HighlightedCodeBlock({
  code,
  lang,
  ...rest
}: {
  code: string
  lang: string | null
} & HTMLAttributes<HTMLElement>) {
  const isDark = useIsDarkMode()
  const [tokens, setTokens] = useState<
    Array<Array<{ content: string; color?: string }>> | null
  >(null)

  useEffect(() => {
    if (!lang) {
      setTokens(null)
      return
    }
    let cancelled = false
    highlightCode(code, lang, isDark).then((result) => {
      if (!cancelled) setTokens(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang, isDark])

  // Fallback: plain code block while Shiki loads or for unknown languages
  if (!tokens) {
    return (
      <code className="block text-foreground" {...rest}>
        {code}
      </code>
    )
  }

  return (
    <code className="block" {...rest}>
      {tokens.map((line, i) => (
        <span key={i}>
          {line.map((token, j) => (
            <span key={j} style={{ color: token.color }}>
              {token.content}
            </span>
          ))}
          {i < tokens.length - 1 && "\n"}
        </span>
      ))}
    </code>
  )
}
