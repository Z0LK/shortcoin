'use client'

/**
 * The launch feed.
 *
 * Pons mints roughly twenty thousand tokens a day, so the coin tab is not a
 * table that ends — it is a tape. This hook owns that tape: it pages backwards
 * through the universe as the user scrolls, and it pushes new launches onto the
 * front on a timer so the top of the list is never the same twice.
 *
 * Live launches use negative indices. Index 0 is the newest token that existed
 * when the page loaded; −1 is the first one to land after that, and so on. The
 * generator stays pure, and "when did this appear" is tracked here rather than
 * baked into the asset.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { coinAt, coinPage } from '@/lib/universe'
import type { Asset } from '@/lib/types'

export const FEED_PAGE = 60

export interface FeedRow {
  asset: Asset
  /** Wall-clock moment this row entered the feed. Null for historical rows. */
  bornAt: number | null
}

export interface LaunchFeed {
  rows: FeedRow[]
  loadMore: () => void
  /** Rows added since mount, for the "N new" badge. */
  liveCount: number
  live: boolean
  setLive: (v: boolean) => void
  /** Increments once a second so age labels stay honest without a global timer. */
  tick: number
}

/** Milliseconds between synthetic launches. The real rate is one every ~3.8s. */
const LAUNCH_MS = 3_800

/**
 * The tape is unbounded; the DOM is not. Rows past this are dropped off the
 * end — fifty pages deep is further than anyone scrolls, and the tail can
 * always be reloaded by scrolling back down.
 */
const MAX_ROWS = 3_000

export function useLaunchFeed(enabled: boolean): LaunchFeed {
  const [rows, setRows] = useState<FeedRow[]>([])
  const [live, setLive] = useState(true)
  const [liveCount, setLiveCount] = useState(0)
  const [tick, setTick] = useState(0)

  const offset = useRef(0)
  const nextLive = useRef(-1)

  // The first page is built after mount, never during render: the feed reads a
  // clock, and the server has no business guessing what it says.
  useEffect(() => {
    if (!enabled) return
    offset.current = FEED_PAGE
    nextLive.current = -1
    setRows(coinPage(0, FEED_PAGE).map((asset) => ({ asset, bornAt: null })))
    setLiveCount(0)
  }, [enabled])

  const loadMore = useCallback(() => {
    if (!enabled) return
    const start = offset.current
    offset.current += FEED_PAGE
    setRows((prev) =>
      [...prev, ...coinPage(start, FEED_PAGE).map((asset) => ({ asset, bornAt: null }))].slice(
        0,
        MAX_ROWS,
      ),
    )
  }, [enabled])

  // New launches.
  useEffect(() => {
    if (!enabled || !live) return
    const t = setInterval(() => {
      if (document.hidden) return
      const asset = coinAt(nextLive.current--)
      setRows((prev) => [{ asset, bornAt: Date.now() }, ...prev].slice(0, MAX_ROWS))
      setLiveCount((n) => n + 1)
    }, LAUNCH_MS)
    return () => clearInterval(t)
  }, [enabled, live])

  // A second hand for the age column. Only the rows that are seconds old care,
  // but they are the ones people watch.
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [enabled])

  return { rows, loadMore, liveCount, live, setLive, tick }
}
