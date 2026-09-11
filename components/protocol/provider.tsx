'use client'

/**
 * React access to the protocol adapter.
 *
 * Screens never import an adapter. They call these hooks, which run a read,
 * re-run it whenever the adapter says something moved, and hand back
 * `{ data, loading, error }`. Swapping paper for testnet changes nothing here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { getRuntime } from '@/lib/protocol/runtime'
import { decodeError, type ProtocolAdapter, type ProtocolError, type Mode } from '@/lib/protocol/adapter'
import type { PaperAdapter } from '@/lib/protocol/paper'
import type { ProtocolEvent } from '@/lib/protocol/types'
import type { MarketEngine } from '@/lib/sim'

interface RuntimeValue {
  adapter: ProtocolAdapter
  mode: Mode
  engine: MarketEngine
  paper: PaperAdapter | null
}

const RuntimeContext = createContext<RuntimeValue | null>(null)

export function ProtocolProvider({ children }: { children: ReactNode }) {
  // Constructed on the client only. On the server this context is null and
  // every hook reports `loading` until hydration hands it a runtime.
  const [value, setValue] = useState<RuntimeValue | null>(null)
  useEffect(() => {
    const rt = getRuntime()
    rt.engine.start()
    setValue({ adapter: rt.adapter, mode: rt.mode, engine: rt.engine, paper: rt.paper })
    const onVisibility = () => (document.hidden ? rt.engine.stop() : rt.engine.start())
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}

export function useRuntime(): RuntimeValue | null {
  return useContext(RuntimeContext)
}

export interface Query<T> {
  data: T | undefined
  loading: boolean
  error: ProtocolError | null
  refresh: () => void
}

/**
 * Run an adapter read and keep it current. `live` re-runs it on every change
 * the adapter reports (throttled to `everyMs`); leave it off for reads whose
 * result cannot move, like a settled receipt.
 */
export function useAdapterQuery<T>(
  read: ((a: ProtocolAdapter) => Promise<T>) | null,
  deps: DependencyList,
  { live = true, everyMs = 1500 }: { live?: boolean; everyMs?: number } = {},
): Query<T> {
  const rt = useRuntime()
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ProtocolError | null>(null)
  const readRef = useRef(read)
  readRef.current = read
  const seq = useRef(0)

  const run = useCallback(() => {
    if (!rt || !readRef.current) return
    const id = ++seq.current
    readRef.current(rt.adapter).then(
      (value) => {
        if (id !== seq.current) return
        setData(value)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (id !== seq.current) return
        setError(decodeError(err))
        setLoading(false)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, ...deps])

  useEffect(() => {
    setLoading(true)
    run()
  }, [run])

  useEffect(() => {
    if (!rt || !live) return
    let last = 0
    let pending: ReturnType<typeof setTimeout> | null = null
    const off = rt.adapter.onChange(() => {
      const since = Date.now() - last
      if (since >= everyMs) {
        last = Date.now()
        run()
      } else if (!pending) {
        pending = setTimeout(() => {
          pending = null
          last = Date.now()
          run()
        }, everyMs - since)
      }
    })
    return () => {
      off()
      if (pending) clearTimeout(pending)
    }
  }, [rt, live, everyMs, run])

  return { data, loading, error, refresh: run }
}

export function useProtocolEvents(listener: (e: ProtocolEvent) => void) {
  const rt = useRuntime()
  const ref = useRef(listener)
  ref.current = listener
  useEffect(() => {
    if (!rt) return
    return rt.adapter.subscribe((e) => ref.current(e))
  }, [rt])
}

/** Re-renders once a second — for countdowns, which must not lie. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
