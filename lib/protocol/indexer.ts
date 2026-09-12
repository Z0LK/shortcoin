/**
 * Indexer-backed adapter, for testnet and mainnet.
 *
 * SPEC §7.2: the front never reads the chain to build a list; the indexer
 * serves lists, sheets, positions, receipts and HLP. This file is the endpoint
 * map and a typed client for it. The indexer itself does not exist yet, so
 * every read fails with IndexerUnavailable until NEXT_PUBLIC_INDEXER_URL is
 * set, and every write fails with WalletNotConnected until §7.5 (approvals,
 * Permit2, simulation) is wired to a real wallet.
 *
 * Endpoints — the contract the backend is expected to honour:
 *
 *   GET  /v1/account/:owner                    → Account
 *   GET  /v1/tokens?openable&sort&newest&cursor → TokenRow[]
 *   GET  /v1/tokens/:address                   → TokenRow | 404
 *   GET  /v1/search?q=                         → SearchResult[]
 *   GET  /v1/tokens/:address/history?interval= → PriceHistory
 *   POST /v1/quotes/open  { token, collateral } → OpenQuote
 *   GET  /v1/positions?owner=                  → Position[]
 *   GET  /v1/positions/:id                     → Position
 *   GET  /v1/positions/:id/samples             → PriceSample[]
 *   GET  /v1/receipts?owner=                   → SettlementReceipt[]
 *   GET  /v1/receipts/:positionId              → SettlementReceipt
 *   GET  /v1/hlp?owner=                        → { pool: HlpState, account: HlpAccount }
 *   POST /v1/listing-requests { address }      → 204
 *   GET  /v1/events?owner=  (server-sent events) → ProtocolEvent
 *
 * bigint fields travel as decimal strings and are revived by field name.
 */

import {
  ProtocolError,
  type HistoryInterval,
  type Mode,
  type PriceHistory,
  type ProtocolAdapter,
  type TokenQuery,
} from './adapter'
import type {
  Account,
  Address,
  HlpAccount,
  HlpState,
  OpenQuote,
  Position,
  PriceSample,
  ProtocolEvent,
  SearchResult,
  SettlementReceipt,
  TokenRow,
  Holding,
  SwapQuote,
  Trade,
} from './types'

/** Fields that are bigint in the contracts and strings on the wire. */
const BIGINT_FIELDS = new Set([
  'quoteDepth',
  'remainingNotional',
  'collateral',
  'notional',
  'maxPayout',
  'accruedPremium',
  'currentValue',
  'equity',
  'pnl',
  'premiumPaid',
  'payout',
  'nav',
  'totalShares',
  'reserved',
  'shares',
  'value',
  'withdrawable',
  'maxDrawdown',
  'usdgBalance',
  'usdgAllowance',
])

function revive(_key: string, value: unknown) {
  return BIGINT_FIELDS.has(_key) && typeof value === 'string' ? BigInt(value) : value
}

function replace(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

export class IndexerAdapter implements ProtocolAdapter {
  constructor(
    readonly mode: Mode,
    private readonly baseUrl: string | undefined,
    private readonly owner: Address | null,
  ) {}

  private async get<T>(path: string): Promise<T> {
    if (!this.baseUrl) throw new ProtocolError('IndexerUnavailable')
    const res = await fetch(`${this.baseUrl}${path}`)
    if (!res.ok) throw new ProtocolError(res.status === 404 ? 'TokenNotEligible' : 'IndexerUnavailable')
    return JSON.parse(await res.text(), revive) as T
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.baseUrl) throw new ProtocolError('IndexerUnavailable')
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body, replace),
    })
    if (!res.ok) {
      const text = await res.text()
      const match = /"error"\s*:\s*"([A-Za-z]+)"/.exec(text)
      throw new ProtocolError((match?.[1] as ProtocolError['code']) ?? 'Unknown')
    }
    const text = await res.text()
    return (text ? JSON.parse(text, revive) : undefined) as T
  }

  private requireOwner(): Address {
    if (!this.owner) throw new ProtocolError('WalletNotConnected')
    return this.owner
  }

  account(): Promise<Account> {
    return this.get(`/v1/account/${this.requireOwner()}`)
  }

  listTokens(q: TokenQuery = {}): Promise<TokenRow[]> {
    const params = new URLSearchParams()
    if (q.openableOnly) params.set('openable', '1')
    if (q.sort) params.set('sort', q.sort)
    if (q.newest) params.set('newest', `${q.newest.offset},${q.newest.limit}`)
    if (q.addresses) params.set('addresses', q.addresses.join(','))
    return this.get(`/v1/tokens?${params}`)
  }

  async getToken(addressOrSymbol: string): Promise<TokenRow | null> {
    try {
      return await this.get(`/v1/tokens/${encodeURIComponent(addressOrSymbol)}`)
    } catch (e) {
      if (e instanceof ProtocolError && e.code === 'TokenNotEligible') return null
      throw e
    }
  }

  search(input: string): Promise<SearchResult[]> {
    return this.get(`/v1/search?q=${encodeURIComponent(input)}`)
  }

  history(token: Address, interval: HistoryInterval): Promise<PriceHistory> {
    return this.get(`/v1/tokens/${token}/history?interval=${interval}`)
  }

  listPositions(): Promise<Position[]> {
    return this.get(`/v1/positions?owner=${this.requireOwner()}`)
  }

  getPosition(id: string): Promise<Position | null> {
    return this.get(`/v1/positions/${id}`)
  }

  positionSamples(id: string): Promise<PriceSample[]> {
    return this.get(`/v1/positions/${id}/samples`)
  }

  listReceipts(): Promise<SettlementReceipt[]> {
    return this.get(`/v1/receipts?owner=${this.requireOwner()}`)
  }

  getReceipt(positionId: string): Promise<SettlementReceipt | null> {
    return this.get(`/v1/receipts/${positionId}`)
  }

  hlp(): Promise<{ pool: HlpState; account: HlpAccount }> {
    return this.get(`/v1/hlp?owner=${this.requireOwner()}`)
  }

  quoteOpen(token: Address, collateral: bigint): Promise<OpenQuote> {
    return this.post('/v1/quotes/open', { token, collateral })
  }

  // Writes need a wallet, USDG approval / Permit2 and pre-send simulation —
  // SPEC §7.5. None of that exists yet, so they refuse cleanly rather than
  // pretending.
  // Spot routing is not decided yet (docs/OPEN-QUESTIONS.md §9): no pool
  // reads and no swap writes until it is.
  async quoteSwap(): Promise<SwapQuote> {
    throw new ProtocolError('IndexerUnavailable')
  }
  async executeSwap(): Promise<Trade> {
    throw new ProtocolError('WalletNotConnected')
  }
  async listHoldings(): Promise<Holding[]> {
    throw new ProtocolError('IndexerUnavailable')
  }
  async listTrades(): Promise<Trade[]> {
    throw new ProtocolError('IndexerUnavailable')
  }

  async simulateOpen(): Promise<ProtocolError | null> {
    return new ProtocolError('WalletNotConnected')
  }
  async approveUsdg(): Promise<void> {
    throw new ProtocolError('WalletNotConnected')
  }
  async openPosition(): Promise<Position> {
    throw new ProtocolError('WalletNotConnected')
  }
  async closePosition(): Promise<SettlementReceipt> {
    throw new ProtocolError('WalletNotConnected')
  }
  async hlpDeposit(): Promise<void> {
    throw new ProtocolError('WalletNotConnected')
  }
  async hlpWithdraw(): Promise<void> {
    throw new ProtocolError('WalletNotConnected')
  }

  requestListing(address: Address): Promise<void> {
    return this.post('/v1/listing-requests', { address })
  }

  subscribe(listener: (e: ProtocolEvent) => void) {
    if (!this.baseUrl || !this.owner || typeof EventSource === 'undefined') return () => {}
    const source = new EventSource(`${this.baseUrl}/v1/events?owner=${this.owner}`)
    source.onmessage = (msg) => listener(JSON.parse(msg.data, revive) as ProtocolEvent)
    return () => source.close()
  }

  onChange(listener: () => void) {
    return this.subscribe(() => listener())
  }
}
