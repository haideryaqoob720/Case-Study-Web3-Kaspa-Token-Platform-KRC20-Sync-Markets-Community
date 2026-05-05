import { Injectable, BadRequestException } from '@nestjs/common';
import {
  KasplexApiService,
  KasplexKrc20OpRaw,
} from '../kasplex/kasplex-api.service';
import { Krc20OpRepository } from './krc20-op.repository';
import { TokensRepository } from '../tokens/tokens.repository';

export type Krc20TxKind =
  | 'received'
  | 'sent'
  | 'bought'
  | 'sold'
  | 'minted'
  | 'other';

export type Krc20TxDirection = 'in' | 'out' | null;

export interface Krc20WalletTier {
  id:
    | 'shrimp'
    | 'fish'
    | 'dolphin'
    | 'shark'
    | 'whale'
    | 'humpback'
    | 'leviathan';
  emoji: string;
  label: string;
  color: 'gray' | 'green' | 'teal' | 'blue' | 'purple' | 'gold' | 'rose';
  balanceTokens: number;
  balanceRaw: string;
  tooltip: string;
}

export interface Krc20RecentTxItem {
  tick: string;
  type: Krc20TxKind;
  typeLabel: string;
  direction: Krc20TxDirection;
  /** Raw token amount in smallest units (chain `amt` string). */
  amountRaw: string;
  /** Human amount: amountRaw ÷ 10^tokenDecimals (e.g. sompi → whole tokens). */
  amount: number;
  amountDisplay: string;
  /** Present only when there is a KAS price (typically `send` ops). */
  priceKas?: number;
  priceKasDisplay?: string;
  counterparty: string;
  counterpartyFull: string;
  timeMs: number;
  timeAgo: string;
  confirmed: boolean;
  hashRev: string;
  explorerUrl: string;
}

export interface Krc20RecentTxResponse {
  tick: string;
  address: string;
  walletTier: string | null;
  walletTierEmoji: string | null;
  walletBalance: number | null;
  transactions: Krc20RecentTxItem[];
  next?: string;
  total?: number;
  storedCount: number;
}

const KAS_PRICE_DECIMALS = 8;
const KAS_SCALE = 10 ** KAS_PRICE_DECIMALS;

@Injectable()
export class Krc20TransactionsService {
  constructor(
    private readonly kasplex: KasplexApiService,
    private readonly repo: Krc20OpRepository,
    private readonly tokensRepository: TokensRepository,
  ) {}

  normalizeTick(tick: string): string {
    const t = tick?.trim();
    if (!t) throw new BadRequestException('tick is required');
    return t.toUpperCase();
  }

  normalizeAddress(address: string): string {
    const a = address?.trim();
    if (!a || !a.toLowerCase().startsWith('kaspa:')) {
      throw new BadRequestException('address must be a kaspa: address');
    }
    return a.toLowerCase();
  }

  async fetchPageAndPersist(params: {
    tick: string;
    address: string;
    next?: string;
  }): Promise<Krc20RecentTxResponse> {
    const tick = this.normalizeTick(params.tick);
    const wallet = this.normalizeAddress(params.address);

    const [apiPage, tier, tokenDecimals] = await Promise.all([
      this.kasplex.fetchKrc20OpList({
        tick,
        address: wallet,
        next: params.next,
      }),
      this.getBalanceTier(wallet, tick),
      this.getTokenDecimals(tick),
    ]);

    const rows = this.mapRawToEntities(tick, apiPage.result);
    await this.repo.bulkUpsertOps(rows);

    const total = apiPage.total ?? apiPage.totalCount ?? undefined;

    const storedCount = await this.repo.countByTickAndWallet(tick, wallet);

    const transactions = apiPage.result.map((raw) =>
      this.toDto(raw, wallet, tick, tokenDecimals),
    );

    return {
      tick,
      address: wallet,
      walletTier: tier?.id ?? null,
      walletTierEmoji: tier?.emoji ?? null,
      walletBalance: tier?.balanceTokens ?? null,
      transactions,
      next: apiPage.next,
      total,
      storedCount,
    };
  }

  /** Worker: first page per tick (no wallet filter on Kasplex). */
  async syncFirstPageForTick(tickerFromDb: string): Promise<void> {
    const tick = this.normalizeTick(tickerFromDb);
    const apiPage = await this.kasplex.fetchKrc20OpList({
      tick,
    });
    const rows = this.mapRawToEntities(tick, apiPage.result);
    await this.repo.bulkUpsertOps(rows);
  }

  /**
   * Worker: paginate Kasplex `oplist` with `next` until oldest op is at least
   * `historyDepthDays` old, or `maxPages` safety cap. Token-wide (no wallet filter).
   * Upserts into `krc20_ops` for historical coverage (≥30 days when API allows).
   */
  async syncHistoricalPagesForTick(
    tickerFromDb: string,
    options?: {
      maxPages?: number;
      historyDepthDays?: number;
      delayBetweenPagesMs?: number;
    },
  ): Promise<void> {
    const tick = this.normalizeTick(tickerFromDb);
    const maxPages = options?.maxPages ?? 60;
    const historyDepthDays = options?.historyDepthDays ?? 30;
    const delayBetweenPagesMs = options?.delayBetweenPagesMs ?? 200;
    const cutoff = Date.now() - historyDepthDays * 24 * 60 * 60 * 1000;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    let next: string | undefined;

    for (let page = 1; page <= maxPages; page++) {
      const apiPage = await this.kasplex.fetchKrc20OpList({ tick, next });
      const list = Array.isArray(apiPage.result) ? apiPage.result : [];
      if (list.length === 0) {
        break;
      }

      const rows = this.mapRawToEntities(tick, list);
      await this.repo.bulkUpsertOps(rows);

      let oldestInPage = Infinity;
      for (const raw of list) {
        const ms = this.toMs(raw.mtsAdd);
        if (ms > 0 && ms < oldestInPage) {
          oldestInPage = ms;
        }
      }

      const reachedDepth =
        oldestInPage !== Infinity && oldestInPage <= cutoff;

      const nextCursor =
        typeof apiPage.next === 'string' && apiPage.next.trim() !== ''
          ? apiPage.next
          : undefined;

      if (reachedDepth || !nextCursor) {
        break;
      }

      next = nextCursor;
      if (page < maxPages) {
        await sleep(delayBetweenPagesMs);
      }
    }
  }

  private async getTokenDecimals(tick: string): Promise<number> {
    const doc = await this.tokensRepository.findByTicker(tick);
    const d = parseInt(String(doc?.decimal ?? '8'), 10);
    return Number.isFinite(d) && d >= 0 ? d : 8;
  }

  private mapRawToEntities(
    tick: string,
    rawList: KasplexKrc20OpRaw[],
  ): Array<{
    tick: string;
    hashRev: string;
    op: string;
    from: string;
    to: string;
    amt: string;
    price?: string;
    mtsAdd: number;
    txAccept?: string;
    opAccept?: string;
    dedupeKey: string;
  }> {
    return rawList.map((raw) => {
      const hashRev = String(raw.hashRev ?? '');
      const op = this.normalizeOp(raw);
      const { from, to } = this.getFromTo(raw);
      const amt = String(raw.amt ?? '0').trim() || '0';
      const price = this.extractPrice(raw);
      const mtsAdd = this.toMs(raw.mtsAdd);
      const txAccept = this.normAccept(raw.txAccept);
      const opAccept = this.normAccept(raw.opAccept);

      const dedupeKey = [
        tick,
        hashRev,
        op,
        from,
        to,
        amt,
        mtsAdd,
        price ?? '',
      ].join('|');

      return {
        tick,
        hashRev,
        op,
        from,
        to,
        amt,
        price,
        mtsAdd,
        txAccept,
        opAccept,
        dedupeKey,
      };
    });
  }

  /** Lowercase kaspa address; empty if missing. */
  private normalizeKaspaField(v: unknown): string {
    if (v === undefined || v === null) return '';
    return String(v).trim().toLowerCase();
  }

  private getFromTo(raw: KasplexKrc20OpRaw): { from: string; to: string } {
    const r = raw as Record<string, unknown>;
    const from = this.normalizeKaspaField(
      raw.from ?? r.fromAddress ?? r.sender ?? r.addrFrom,
    );
    const to = this.normalizeKaspaField(
      raw.to ?? r.toAddress ?? r.receiver ?? r.addrTo,
    );
    return { from, to };
  }

  /**
   * Kasplex / indexer variants: `op`, `opType`, strings with mixed case, or legacy labels.
   */
  private normalizeOp(raw: KasplexKrc20OpRaw): string {
    const r = raw as Record<string, unknown>;
    const candidates = [raw.op, r.opType, r.operation, r.type, r.action];
    for (const c of candidates) {
      if (c === undefined || c === null) continue;
      let s = String(c).trim().toLowerCase();
      if (!s) continue;
      const map: Record<string, string> = {
        xfer: 'transfer',
        trnsfer: 'transfer',
        tansfer: 'transfer',
        listings: 'list',
        listing: 'list',
        marketplace_send: 'send',
      };
      s = map[s] ?? s;
      return s;
    }
    return '';
  }

  private extractPrice(raw: KasplexKrc20OpRaw): string | undefined {
    const r = raw as Record<string, unknown>;
    const candidates = [raw.price, r.pri, r.kasPrice, r.kas, r.priceKas];
    for (const c of candidates) {
      if (c === undefined || c === null) continue;
      const s = String(c).trim();
      if (s !== '') return s;
    }
    return undefined;
  }

  private toMs(v: number | string | undefined): number {
    if (v === undefined || v === null) return 0;
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    return Number.isFinite(n) ? n : 0;
  }

  private normAccept(v: string | number | undefined): string | undefined {
    if (v === undefined || v === null) return undefined;
    return String(v);
  }

  private formatTimeAgo(ms: number): string {
    const diff = Date.now() - ms;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec} sec${sec === 1 ? '' : 's'} ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
    const d = Math.floor(hr / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  /** Human-readable token amount from raw `amt` and token decimals. */
  private toHumanTokenAmount(amtStr: string, decimals: number): number {
    try {
      const bi = BigInt(amtStr || '0');
      let div = 1n;
      for (let i = 0; i < decimals; i++) div *= 10n;
      const whole = bi / div;
      const rem = bi % div;
      return Number(whole) + Number(rem) / Number(div);
    } catch {
      return 0;
    }
  }

  private toDto(
    raw: KasplexKrc20OpRaw,
    wallet: string,
    tick: string,
    tokenDecimals: number,
  ): Krc20RecentTxItem {
    const w = wallet.toLowerCase();
    const { from, to } = this.getFromTo(raw);
    const op = this.normalizeOp(raw);

    const { type, typeLabel } = this.classify(op, from, to, w);

    const amtStr = String(raw.amt ?? '0').trim() || '0';
    const amtRaw = amtStr;
    const amount = this.toHumanTokenAmount(amtStr, tokenDecimals);
    const amountDisplay = `${this.formatHumanTokenAmount(amount, tokenDecimals)} ${tick}`;

    const direction = this.directionFromType(type);

    const priceStr = this.extractPrice(raw);
    let priceKas: number | undefined;
    let priceKasDisplay: string | undefined;
    if (op === 'send' && priceStr !== undefined) {
      try {
        const pRaw = BigInt(priceStr);
        priceKas = Number(pRaw) / KAS_SCALE;
        priceKasDisplay = this.formatKas(priceKas);
      } catch {
        /* ignore malformed price */
      }
    }

    const counterpartyFull = this.counterpartyForType(type, from, to);
    const counterparty = this.shortAddr(counterpartyFull);

    const timeMs = this.toMs(raw.mtsAdd);
    const txOk = String(raw.txAccept ?? '') === '1';
    const opOk = String(raw.opAccept ?? '') === '1';
    const confirmed = txOk && opOk;

    const hashRev = String(raw.hashRev ?? '');
    const explorerUrl = hashRev
      ? `https://explorer.kaspa.org/transactions/${hashRev}`
      : '';

    const item: Krc20RecentTxItem = {
      tick,
      type,
      typeLabel,
      direction,
      amountRaw: amtRaw,
      amount,
      amountDisplay,
      counterparty,
      counterpartyFull,
      timeMs,
      timeAgo: this.formatTimeAgo(timeMs),
      confirmed,
      hashRev,
      explorerUrl,
    };

    if (priceKas !== undefined && priceKasDisplay !== undefined) {
      item.priceKas = priceKas;
      item.priceKasDisplay = priceKasDisplay;
    }

    return item;
  }

  private directionFromType(type: Krc20TxKind): Krc20TxDirection {
    if (type === 'received' || type === 'bought' || type === 'minted')
      return 'in';
    if (type === 'sent' || type === 'sold') return 'out';
    return null;
  }

  private counterpartyForType(
    type: Krc20TxKind,
    from: string,
    to: string,
  ): string {
    if (type === 'received' || type === 'bought') return from;
    if (type === 'sent' || type === 'sold') return to;
    if (type === 'minted') return from;
    return from || to;
  }

  private classify(
    op: string,
    from: string,
    to: string,
    wallet: string,
  ): { type: Krc20TxKind; typeLabel: string } {
    if (op === 'transfer' && to === wallet) {
      return { type: 'received', typeLabel: 'Received' };
    }
    if (op === 'transfer' && from === wallet) {
      return { type: 'sent', typeLabel: 'Sent' };
    }
    if (op === 'send' && to === wallet) {
      return { type: 'bought', typeLabel: 'Bought' };
    }
    if (op === 'send' && from === wallet) {
      return { type: 'sold', typeLabel: 'Sold' };
    }
    if (op === 'mint' && to === wallet) {
      return { type: 'minted', typeLabel: 'Minted' };
    }
    return { type: 'other', typeLabel: this.formatOpLabel(op) };
  }

  private formatOpLabel(op: string): string {
    if (!op) return 'Other';
    return op.charAt(0).toUpperCase() + op.slice(1);
  }

  private shortAddr(addr: string): string {
    if (!addr || addr.length <= 14) return addr || '—';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  }

  private formatInt(n: number): string {
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  }

  /** Display string for human token amount (matches integer-style UI when whole). */
  private formatHumanTokenAmount(n: number, decimals: number): string {
    if (!Number.isFinite(n)) return '0';
    const rounded = Number(n.toFixed(Math.min(decimals, 18)));
    if (Math.abs(rounded - Math.round(rounded)) < 1e-10) {
      return this.formatInt(Math.round(rounded));
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.min(decimals, 18),
    }).format(rounded);
  }

  private formatKas(n: number): string {
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    }).format(n);
  }

  async getBalanceTier(
    watchedAddress: string,
    tick: string,
  ): Promise<Krc20WalletTier> {
    const rows = await this.kasplex.fetchKrc20AddressTokenlist(watchedAddress);
    const row = rows.find(
      (r) => String(r.tick ?? '').toUpperCase() === tick.toUpperCase(),
    );
    const dec = parseInt(String(row?.dec ?? '8'), 10) || 8;
    const scale = 10 ** dec;
    const rawStr = String(row?.balance ?? '0');
    const rawBn = BigInt(rawStr || '0');
    const balanceTokens = Number(rawBn) / scale;

    const tier = this.tierFromBalance(balanceTokens);
    const formatted = this.formatInt(balanceTokens);

    return {
      ...tier,
      balanceTokens,
      balanceRaw: rawStr,
      tooltip: `${formatted} ${tick} — ${tier.label} ${tier.emoji}`,
    };
  }

  private tierFromBalance(
    n: number,
  ): Omit<Krc20WalletTier, 'balanceTokens' | 'balanceRaw' | 'tooltip'> {
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n < 1000) {
      return { id: 'shrimp', emoji: '🦐', label: 'Shrimp', color: 'gray' };
    }
    if (n < 10_000) {
      return { id: 'fish', emoji: '🐟', label: 'Fish', color: 'green' };
    }
    if (n < 100_000) {
      return { id: 'dolphin', emoji: '🐬', label: 'Dolphin', color: 'teal' };
    }
    if (n < 1_000_000) {
      return { id: 'shark', emoji: '🦈', label: 'Shark', color: 'blue' };
    }
    if (n < 10_000_000) {
      return { id: 'whale', emoji: '🐋', label: 'Whale', color: 'purple' };
    }
    if (n < 1_000_000_000) {
      return {
        id: 'humpback',
        emoji: '🔱',
        label: 'Humpback',
        color: 'gold',
      };
    }
    return {
      id: 'leviathan',
      emoji: '🐳',
      label: 'Leviathan',
      color: 'rose',
    };
  }
}
