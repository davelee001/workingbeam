import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database, emptyDatabase } from '../domain/types.js';

export interface DataStore {
  read(): Database;
  mutate<T>(operation: (database: Database) => T): T;
}

function clone(database: Database): Database {
  return structuredClone(database);
}

export class MemoryStore implements DataStore {
  protected database: Database;

  constructor(initial: Database = emptyDatabase()) {
    this.database = clone(initial);
  }

  read(): Database {
    return clone(this.database);
  }

  mutate<T>(operation: (database: Database) => T): T {
    const draft = clone(this.database);
    const result = operation(draft);
    this.database = draft;
    return result;
  }
}

export class JsonStore extends MemoryStore {
  constructor(private readonly filePath: string) {
    super(JsonStore.load(filePath));
  }

  private static load(filePath: string): Database {
    if (!existsSync(filePath)) return emptyDatabase();
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Database>;
    return { ...emptyDatabase(), ...parsed };
  }

  override mutate<T>(operation: (database: Database) => T): T {
    const result = super.mutate(operation);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.database, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
    return result;
  }
}
