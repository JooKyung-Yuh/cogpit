import { useRef, useState, useCallback, useEffect } from "react"
import type { ParsedSession } from "@/lib/types"

interface UseChatScrollOpts {
  session: ParsedSession | null
  isLive: boolean
  pendingMessage: string | null
  clearPending: () => void
  sessionChangeKey: number
}

export function useChatScroll({ session, isLive, pendingMessage, clearPending, sessionChangeKey }: UseChatScrollOpts) {
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const chatIsAtBottomRef = useRef(true)
  const chatScrollOnNextRef = useRef(false)
  const prevTurnCountRef = useRef(0)

  // Sticky-to-bottom: only disengage when user intentionally scrolls up.
  // This prevents smooth-scroll race conditions from breaking auto-scroll.
  const stickToBottomRef = useRef(true)
  const prevScrollTopRef = useRef(0)

  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const scrollToBottomInstant = useCallback(() => {
    const doScroll = () => {
      const el = chatScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      chatIsAtBottomRef.current = true
      stickToBottomRef.current = true
      chatScrollOnNextRef.current = false
    }
    // Scroll immediately for instant feedback
    doScroll()
    // Then again after next frame (React may not have rendered yet)
    requestAnimationFrame(() => {
      doScroll()
      // And once more after layout settles (virtualized lists, images, etc.)
      requestAnimationFrame(doScroll)
    })
  }, [])

  // Avoid triggering rerenders when scroll indicators haven't actually changed
  const canScrollUpRef = useRef(false)
  const canScrollDownRef = useRef(false)

  const updateScrollIndicators = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    const up = el.scrollTop > 10
    const down = el.scrollHeight - el.scrollTop - el.clientHeight > 30
    if (up !== canScrollUpRef.current) {
      canScrollUpRef.current = up
      setCanScrollUp(up)
    }
    if (down !== canScrollDownRef.current) {
      canScrollDownRef.current = down
      setCanScrollDown(down)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    chatIsAtBottomRef.current = distFromBottom < 50

    // Detect user scrolling UP → disengage stick-to-bottom.
    // Our programmatic scroll always sets scrollTop = scrollHeight (instant),
    // which lands at distFromBottom ≈ 0. Any upward scroll after that is
    // the user intentionally reading above, so disengage immediately.
    const scrolledUp = el.scrollTop < prevScrollTopRef.current - 2
    if (scrolledUp) {
      stickToBottomRef.current = false
    }
    // User scrolled back to bottom → re-engage
    if (distFromBottom < 30) {
      stickToBottomRef.current = true
    }
    prevScrollTopRef.current = el.scrollTop

    updateScrollIndicators()
  }, [updateScrollIndicators])

  const resetTurnCount = useCallback((count: number) => {
    prevTurnCountRef.current = count
  }, [])

  // Session changed → force scroll to bottom after React renders new content
  const prevSessionChangeKeyRef = useRef(sessionChangeKey)
  useEffect(() => {
    if (sessionChangeKey === prevSessionChangeKeyRef.current) return
    prevSessionChangeKeyRef.current = sessionChangeKey

    // The DOM now has the new session content. Scroll aggressively:
    // 1) Immediate (layout is committed)
    // 2) Next frame (virtualizer may still be measuring)
    // 3) After a short delay (covers lazy rendering, image loads, etc.)
    const doScroll = () => {
      const el = chatScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      chatIsAtBottomRef.current = true
      stickToBottomRef.current = true
      chatScrollOnNextRef.current = false
    }
    doScroll()
    requestAnimationFrame(() => {
      doScroll()
      requestAnimationFrame(doScroll)
    })
    const timer = setTimeout(doScroll, 150)
    return () => clearTimeout(timer)
  }, [sessionChangeKey])

  // Pending message → scroll to bottom
  useEffect(() => {
    if (pendingMessage) {
      chatScrollOnNextRef.current = true
      requestAnimationFrame(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
      })
    }
  }, [pendingMessage])

  // New turns → auto-scroll
  const turnCount = session?.turns.length ?? 0
  useEffect(() => {
    if (turnCount === 0) return
    if (turnCount > prevTurnCountRef.current) {
      if (pendingMessage) {
        clearPending()
      }
      if (chatScrollOnNextRef.current || stickToBottomRef.current) {
        requestAnimationFrame(() => {
          const el = chatScrollRef.current
          if (el) {
            el.scrollTop = el.scrollHeight
            chatIsAtBottomRef.current = true
          }
        })
        chatScrollOnNextRef.current = false
      }
    }
    prevTurnCountRef.current = turnCount
  }, [turnCount, pendingMessage, clearPending])

  // Live content → auto-scroll
  useEffect(() => {
    if (!session || !isLive) return
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => {
        const el = chatScrollRef.current
        if (el) {
          el.scrollTop = el.scrollHeight
          chatIsAtBottomRef.current = true
        }
      })
    }
    requestAnimationFrame(updateScrollIndicators)
  }, [session, isLive, updateScrollIndicators])

  const scrollToBottomSmooth = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    chatIsAtBottomRef.current = true
    stickToBottomRef.current = true
    chatScrollOnNextRef.current = false
  }, [])

  return {
    chatScrollRef,
    scrollEndRef,
    canScrollUp,
    canScrollDown,
    handleScroll,
    scrollToBottomInstant,
    scrollToBottomSmooth,
    resetTurnCount,
  }
}
