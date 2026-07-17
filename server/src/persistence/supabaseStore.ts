import { Database, emptyDatabase } from '../domain/types.js';
import { MemoryStore } from './jsonStore.js';

type SupabaseRow = {
  id: string;
  data: Partial<Database>;
};

export class SupabaseStore extends MemoryStore {
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly rowId: string,
    initial: Database,
  ) {
    super(initial);
  }

  static async create(options: { url: string; serviceRoleKey: string; rowId?: string }): Promise<SupabaseStore> {
    const rowId = options.rowId ?? 'default';
    const loaded = await SupabaseStore.load(options.url, options.serviceRoleKey, rowId);
    return new SupabaseStore(options.url, options.serviceRoleKey, rowId, loaded);
  }

  private static headers(serviceRoleKey: string) {
    return {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    };
  }

  private static endpoint(url: string, rowId?: string): string {
    const base = `${url.replace(/\/$/, '')}/rest/v1/workingbeam_state`;
    return rowId ? `${base}?id=eq.${encodeURIComponent(rowId)}&select=id,data` : base;
  }

  private static async load(url: string, serviceRoleKey: string, rowId: string): Promise<Database> {
    const response = await fetch(SupabaseStore.endpoint(url, rowId), {
      headers: SupabaseStore.headers(serviceRoleKey),
    });
    if (!response.ok) {
      throw new Error(`Supabase load failed with HTTP ${response.status}. Run the schema SQL and check credentials.`);
    }
    const rows = await response.json() as SupabaseRow[];
    if (rows.length === 0) {
      const initial = emptyDatabase();
      await SupabaseStore.upsert(url, serviceRoleKey, rowId, initial);
      return initial;
    }
    return { ...emptyDatabase(), ...rows[0].data };
  }

  private static async upsert(url: string, serviceRoleKey: string, rowId: string, database: Database): Promise<void> {
    const response = await fetch(SupabaseStore.endpoint(url), {
      method: 'POST',
      headers: {
        ...SupabaseStore.headers(serviceRoleKey),
        prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: rowId, data: database, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`Supabase write failed with HTTP ${response.status}. ${message}`);
    }
  }

  override mutate<T>(operation: (database: Database) => T): T {
    const result = super.mutate(operation);
    const snapshot = this.read();
    this.pendingWrite = this.pendingWrite
      .then(() => SupabaseStore.upsert(this.url, this.serviceRoleKey, this.rowId, snapshot))
      .catch((error) => {
        console.error(error);
        throw error;
      });
    return result;
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }
}
