import { randomUUID } from 'node:crypto';

export interface WalletTransfer {
  address: string;
  amountBeam: number;
  comment: string;
}

export interface WalletStatus {
  status: 'pending' | 'confirmed' | 'failed';
  rawStatus: string;
}

export interface BeamWallet {
  readonly mode: 'mock' | 'live';
  send(transfer: WalletTransfer): Promise<string>;
  transactionStatus(transactionId: string): Promise<WalletStatus>;
  health(): Promise<{ available: boolean; mode: 'mock' | 'live'; detail: string }>;
}

export class MockBeamWallet implements BeamWallet {
  readonly mode = 'mock' as const;

  async send(): Promise<string> {
    return `mock-${randomUUID().replace(/-/g, '')}`;
  }

  async transactionStatus(): Promise<WalletStatus> {
    return { status: 'confirmed', rawStatus: 'mock-completed' };
  }

  async health() {
    return { available: true, mode: this.mode, detail: 'Local mock wallet is active' };
  }
}

type JsonRpcResponse = {
  result?: unknown;
  error?: { code?: number; message?: string; data?: string };
};

export class BeamWalletRpc implements BeamWallet {
  readonly mode = 'live' as const;
  private requestId = 0;

  constructor(
    private readonly endpoint: string,
    private readonly aclKey: string | undefined,
    private readonly grothPerBeam: number,
    private readonly feeGroth: number,
  ) {}

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body: Record<string, unknown> = {
      jsonrpc: '2.0', id: ++this.requestId, method,
    };
    if (params) body.params = params;
    if (this.aclKey) body.key = this.aclKey;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Beam Wallet API returned HTTP ${response.status}`);
    const payload = await response.json() as JsonRpcResponse;
    if (payload.error) {
      throw new Error(payload.error.data ?? payload.error.message ?? `Beam RPC error ${payload.error.code}`);
    }
    return payload.result;
  }

  async send(transfer: WalletTransfer): Promise<string> {
    const value = Math.round(transfer.amountBeam * this.grothPerBeam);
    const result = await this.call('tx_send', {
      value,
      fee: this.feeGroth,
      address: transfer.address,
      comment: transfer.comment,
      asset_id: 0,
    });
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const object = result as Record<string, unknown>;
      const id = object.txId ?? object.tx_id ?? object.id;
      if (typeof id === 'string') return id;
    }
    throw new Error('Beam Wallet API did not return a transaction ID');
  }

  async transactionStatus(transactionId: string): Promise<WalletStatus> {
    const result = await this.call('tx_status', { txId: transactionId });
    const object = (result ?? {}) as Record<string, unknown>;
    const raw = String(object.status_string ?? object.status ?? 'unknown');
    const normalized = raw.toLowerCase();
    if (/complete|confirmed|received|sent/.test(normalized)) return { status: 'confirmed', rawStatus: raw };
    if (/fail|cancel|expired/.test(normalized)) return { status: 'failed', rawStatus: raw };
    return { status: 'pending', rawStatus: raw };
  }

  async health() {
    try {
      await this.call('wallet_status');
      return { available: true, mode: this.mode, detail: 'Beam Wallet API is reachable' };
    } catch (error) {
      return {
        available: false,
        mode: this.mode,
        detail: error instanceof Error ? error.message : 'Beam Wallet API is unavailable',
      };
    }
  }
}

export function createBeamWallet(): BeamWallet {
  const endpoint = process.env.BEAM_WALLET_API_URL;
  if (!endpoint) return new MockBeamWallet();
  return new BeamWalletRpc(
    endpoint,
    process.env.BEAM_WALLET_API_KEY,
    Number(process.env.BEAM_GROTH_PER_BEAM ?? 100_000_000),
    Number(process.env.BEAM_TX_FEE_GROTH ?? 100_000),
  );
}
