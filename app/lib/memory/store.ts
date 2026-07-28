import { createDemoMemoryData } from "./mock";
import type {
  AudioAsset,
  CalendarDate,
  CreateAudioAssetInput,
  CreateGardenItemInput,
  CreateSessionRecordInput,
  CreateTurnInput,
  GardenItem,
  ListAudioOptions,
  ListOptions,
  ListSessionOptions,
  MemorySeedData,
  MemorySnapshot,
  SessionRecord,
  Turn,
  UpdateGardenItemInput,
  UpdateSessionRecordInput,
  UpdateTurnInput,
} from "./types";

const DATABASE_NAME = "her-device-memory";
const DATABASE_VERSION = 1;

const STORE_NAMES = {
  gardenItems: "gardenItems",
  sessions: "sessions",
  audioAssets: "audioAssets",
} as const;

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

interface StoredRecord {
  id: string;
}

interface PersistenceBackend {
  get<T extends StoredRecord>(store: StoreName, id: string): Promise<T | undefined>;
  getAll<T extends StoredRecord>(store: StoreName): Promise<T[]>;
  put<T extends StoredRecord>(store: StoreName, value: T): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return value;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

class IndexedDbBackend implements PersistenceBackend {
  constructor(private readonly database: IDBDatabase) {}

  async get<T extends StoredRecord>(
    store: StoreName,
    id: string,
  ): Promise<T | undefined> {
    const transaction = this.database.transaction(store, "readonly");
    const result = await requestResult(
      transaction.objectStore(store).get(id) as IDBRequest<T | undefined>,
    );
    await transactionDone(transaction);
    return result;
  }

  async getAll<T extends StoredRecord>(store: StoreName): Promise<T[]> {
    const transaction = this.database.transaction(store, "readonly");
    const result = await requestResult(
      transaction.objectStore(store).getAll() as IDBRequest<T[]>,
    );
    await transactionDone(transaction);
    return result;
  }

  async put<T extends StoredRecord>(store: StoreName, value: T): Promise<void> {
    const transaction = this.database.transaction(store, "readwrite");
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }

  async delete(store: StoreName, id: string): Promise<void> {
    const transaction = this.database.transaction(store, "readwrite");
    transaction.objectStore(store).delete(id);
    await transactionDone(transaction);
  }

  async clear(store: StoreName): Promise<void> {
    const transaction = this.database.transaction(store, "readwrite");
    transaction.objectStore(store).clear();
    await transactionDone(transaction);
  }

  async count(store: StoreName): Promise<number> {
    const transaction = this.database.transaction(store, "readonly");
    const result = await requestResult(transaction.objectStore(store).count());
    await transactionDone(transaction);
    return result;
  }
}

class InMemoryBackend implements PersistenceBackend {
  private readonly stores: Record<StoreName, Map<string, StoredRecord>> = {
    gardenItems: new Map(),
    sessions: new Map(),
    audioAssets: new Map(),
  };

  async get<T extends StoredRecord>(
    store: StoreName,
    id: string,
  ): Promise<T | undefined> {
    const value = this.stores[store].get(id) as T | undefined;
    return value ? clone(value) : undefined;
  }

  async getAll<T extends StoredRecord>(store: StoreName): Promise<T[]> {
    return Array.from(this.stores[store].values(), (value) =>
      clone(value as T),
    );
  }

  async put<T extends StoredRecord>(store: StoreName, value: T): Promise<void> {
    this.stores[store].set(value.id, clone(value));
  }

  async delete(store: StoreName, id: string): Promise<void> {
    this.stores[store].delete(id);
  }

  async clear(store: StoreName): Promise<void> {
    this.stores[store].clear();
  }

  async count(store: StoreName): Promise<number> {
    return this.stores[store].size;
  }
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAMES.gardenItems)) {
        const store = database.createObjectStore(STORE_NAMES.gardenItems, {
          keyPath: "id",
        });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("updatedAt", "updatedAt");
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.sessions)) {
        const store = database.createObjectStore(STORE_NAMES.sessions, {
          keyPath: "id",
        });
        store.createIndex("gardenItemId", "gardenItemId");
        store.createIndex("createdAt", "createdAt");
        store.createIndex("pinnedDate", "pinnedDate");
        store.createIndex("mode", "mode");
        store.createIndex("saveStatus", "saveStatus");
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.audioAssets)) {
        const store = database.createObjectStore(STORE_NAMES.audioAssets, {
          keyPath: "id",
        });
        store.createIndex("ownerId", "ownerId");
        store.createIndex("ownerType", "ownerType");
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
  });
}

async function createBackend(): Promise<PersistenceBackend> {
  if (typeof globalThis.indexedDB === "undefined") {
    return new InMemoryBackend();
  }

  try {
    return new IndexedDbBackend(await openIndexedDb());
  } catch {
    // Private browsing policies and storage denial can make IndexedDB present but
    // unusable. The demo remains interactive for the lifetime of the page.
    return new InMemoryBackend();
  }
}

function randomId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return `${prefix}-${id}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function compareCreatedAt<T extends { createdAt: string }>(
  direction: "newest" | "oldest",
): (left: T, right: T) => number {
  const multiplier = direction === "newest" ? -1 : 1;
  return (left, right) =>
    left.createdAt.localeCompare(right.createdAt) * multiplier;
}

function applyWindow<T>(records: T[], options?: ListOptions): T[] {
  const offset = Math.max(0, options?.offset ?? 0);
  const end =
    options?.limit === undefined
      ? undefined
      : offset + Math.max(0, options.limit);
  return records.slice(offset, end);
}

export class MemoryIntegrityError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "GARDEN_NOT_FOUND"
      | "GARDEN_HAS_SESSIONS"
      | "SESSION_NOT_FOUND"
      | "TURN_NOT_FOUND",
  ) {
    super(message);
    this.name = "MemoryIntegrityError";
  }
}

export type MemoryStoreChange =
  | { entity: "garden"; action: "put" | "delete"; id: string }
  | { entity: "session"; action: "put" | "delete"; id: string }
  | { entity: "audio"; action: "put" | "delete"; id: string }
  | { entity: "store"; action: "seed" | "clear" };

export interface InitializeMemoryStoreOptions {
  /** Defaults to true. Seed records are inserted only if every store is empty. */
  seedDemo?: boolean;
}

export interface DeleteGardenItemOptions {
  /** Defaults to false. Without this flag, linked sessions protect the item. */
  cascadeSessions?: boolean;
}

export class MemoryStore {
  private readonly backendPromise: Promise<PersistenceBackend>;
  private readonly listeners = new Set<(change: MemoryStoreChange) => void>();
  private initializePromise?: Promise<void>;

  constructor() {
    this.backendPromise = createBackend();
  }

  subscribe(listener: (change: MemoryStoreChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(options: InitializeMemoryStoreOptions = {}): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = (async () => {
      await this.backendPromise;
      if (options.seedDemo ?? true) await this.seedDemoIfEmpty();
    })();
    return this.initializePromise;
  }

  async seedDemoIfEmpty(now = new Date()): Promise<boolean> {
    const backend = await this.backendPromise;
    const counts = await Promise.all([
      backend.count(STORE_NAMES.gardenItems),
      backend.count(STORE_NAMES.sessions),
      backend.count(STORE_NAMES.audioAssets),
    ]);
    if (counts.some((count) => count !== 0)) return false;

    await this.putSeedData(createDemoMemoryData(now), backend);
    this.emit({ entity: "store", action: "seed" });
    return true;
  }

  async createGardenItem(input: CreateGardenItemInput): Promise<GardenItem> {
    const now = new Date().toISOString();
    const item: GardenItem = {
      ...input,
      id: input.id ?? randomId("garden"),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    await this.putGardenItem(item);
    return clone(item);
  }

  async putGardenItem(item: GardenItem): Promise<GardenItem> {
    const backend = await this.backendPromise;
    await backend.put(STORE_NAMES.gardenItems, clone(item));
    this.emit({ entity: "garden", action: "put", id: item.id });
    return clone(item);
  }

  async getGardenItem(id: string): Promise<GardenItem | undefined> {
    const backend = await this.backendPromise;
    return backend.get<GardenItem>(STORE_NAMES.gardenItems, id);
  }

  async updateGardenItem(
    id: string,
    update: UpdateGardenItemInput,
  ): Promise<GardenItem> {
    const current = await this.requireGardenItem(id);
    const next: GardenItem = {
      ...current,
      ...update,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    return this.putGardenItem(next);
  }

  async listGardenItems(options: ListOptions = {}): Promise<GardenItem[]> {
    const backend = await this.backendPromise;
    const records = await backend.getAll<GardenItem>(STORE_NAMES.gardenItems);
    records.sort(compareCreatedAt(options.sort ?? "newest"));
    return applyWindow(records, options);
  }

  async deleteGardenItem(
    id: string,
    options: DeleteGardenItemOptions = {},
  ): Promise<void> {
    const linkedSessions = await this.listSessionRecords({ gardenItemId: id });
    if (linkedSessions.length > 0 && !options.cascadeSessions) {
      throw new MemoryIntegrityError(
        `Garden item ${id} has ${linkedSessions.length} linked session(s)`,
        "GARDEN_HAS_SESSIONS",
      );
    }

    if (options.cascadeSessions) {
      for (const session of linkedSessions) {
        await this.deleteSessionRecord(session.id);
      }
    }

    const item = await this.getGardenItem(id);
    if (item?.musicAssetId) await this.deleteAudioAsset(item.musicAssetId);

    const backend = await this.backendPromise;
    await backend.delete(STORE_NAMES.gardenItems, id);
    this.emit({ entity: "garden", action: "delete", id });
  }

  async createSessionRecord(
    input: CreateSessionRecordInput,
  ): Promise<SessionRecord> {
    await this.requireGardenItem(input.gardenItemId);
    const now = new Date().toISOString();
    const base = {
      ...input,
      id: input.id ?? randomId("session"),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    const session: SessionRecord = { ...base, mode: "conversation" };
    await this.putSessionRecord(session);
    return clone(session);
  }

  async putSessionRecord(session: SessionRecord): Promise<SessionRecord> {
    await this.requireGardenItem(session.gardenItemId);
    const backend = await this.backendPromise;
    await backend.put(STORE_NAMES.sessions, clone(session));
    this.emit({ entity: "session", action: "put", id: session.id });
    return clone(session);
  }

  async getSessionRecord(id: string): Promise<SessionRecord | undefined> {
    const backend = await this.backendPromise;
    return backend.get<SessionRecord>(STORE_NAMES.sessions, id);
  }

  async updateSessionRecord(
    id: string,
    update: UpdateSessionRecordInput,
  ): Promise<SessionRecord> {
    const current = await this.requireSessionRecord(id);
    const next = {
      ...current,
      ...update,
      id: current.id,
      gardenItemId: current.gardenItemId,
      mode: current.mode,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    } as SessionRecord;
    return this.putSessionRecord(next);
  }

  async listSessionRecords(
    options: ListSessionOptions = {},
  ): Promise<SessionRecord[]> {
    const backend = await this.backendPromise;
    let records = await backend.getAll<SessionRecord>(STORE_NAMES.sessions);
    if (options.gardenItemId !== undefined) {
      records = records.filter(
        (session) => session.gardenItemId === options.gardenItemId,
      );
    }
    if (options.mode !== undefined) {
      records = records.filter((session) => session.mode === options.mode);
    }
    if (options.pinnedDate !== undefined) {
      records = records.filter(
        (session) => session.pinnedDate === options.pinnedDate,
      );
    }
    if (options.saveStatus !== undefined) {
      records = records.filter(
        (session) => session.saveStatus === options.saveStatus,
      );
    }
    records.sort(compareCreatedAt(options.sort ?? "newest"));
    return applyWindow(records, options);
  }

  async appendTurn(sessionId: string, input: CreateTurnInput): Promise<Turn> {
    const session = await this.requireSessionRecord(sessionId);
    const turn: Turn = { ...input, id: input.id ?? randomId("turn") };
    await this.updateSessionRecord(sessionId, {
      turns: [...session.turns, turn],
      durationMs: Math.max(
        session.durationMs,
        turn.offsetEndMs ?? turn.offsetStartMs,
      ),
    });
    return clone(turn);
  }

  async updateTurn(
    sessionId: string,
    turnId: string,
    update: UpdateTurnInput,
  ): Promise<Turn> {
    const session = await this.requireSessionRecord(sessionId);
    const index = session.turns.findIndex((turn) => turn.id === turnId);
    if (index < 0) {
      throw new MemoryIntegrityError(
        `Turn ${turnId} does not exist in session ${sessionId}`,
        "TURN_NOT_FOUND",
      );
    }
    const updated: Turn = { ...session.turns[index], ...update, id: turnId };
    const turns = [...session.turns];
    turns[index] = updated;
    await this.updateSessionRecord(sessionId, { turns });
    return clone(updated);
  }

  async deleteTurn(sessionId: string, turnId: string): Promise<void> {
    const session = await this.requireSessionRecord(sessionId);
    const turn = session.turns.find((candidate) => candidate.id === turnId);
    if (!turn) {
      throw new MemoryIntegrityError(
        `Turn ${turnId} does not exist in session ${sessionId}`,
        "TURN_NOT_FOUND",
      );
    }
    await this.updateSessionRecord(sessionId, {
      turns: session.turns.filter((candidate) => candidate.id !== turnId),
    });
    if (turn.audioAssetId) await this.deleteAudioAsset(turn.audioAssetId);
  }

  async pinSession(id: string, date: CalendarDate): Promise<SessionRecord> {
    return this.updateSessionRecord(id, { pinnedDate: date });
  }

  async unpinSession(id: string): Promise<SessionRecord> {
    const current = await this.requireSessionRecord(id);
    const next = clone(current);
    delete next.pinnedDate;
    next.updatedAt = new Date().toISOString();
    return this.putSessionRecord(next);
  }

  async deleteSessionRecord(id: string): Promise<void> {
    const session = await this.getSessionRecord(id);
    if (session) {
      const audioIds = new Set(
        session.turns.flatMap((turn) =>
          turn.audioAssetId ? [turn.audioAssetId] : [],
        ),
      );
      for (const audioId of audioIds) await this.deleteAudioAsset(audioId);
    }
    const backend = await this.backendPromise;
    await backend.delete(STORE_NAMES.sessions, id);
    this.emit({ entity: "session", action: "delete", id });
  }

  async createAudioAsset(input: CreateAudioAssetInput): Promise<AudioAsset> {
    const asset: AudioAsset = {
      ...input,
      id: input.id ?? randomId("audio"),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    await this.putAudioAsset(asset);
    return clone(asset);
  }

  async putAudioAsset(asset: AudioAsset): Promise<AudioAsset> {
    const backend = await this.backendPromise;
    await backend.put(STORE_NAMES.audioAssets, clone(asset));
    this.emit({ entity: "audio", action: "put", id: asset.id });
    return clone(asset);
  }

  async getAudioAsset(id: string): Promise<AudioAsset | undefined> {
    const backend = await this.backendPromise;
    return backend.get<AudioAsset>(STORE_NAMES.audioAssets, id);
  }

  async listAudioAssets(options: ListAudioOptions = {}): Promise<AudioAsset[]> {
    const backend = await this.backendPromise;
    let records = await backend.getAll<AudioAsset>(STORE_NAMES.audioAssets);
    if (options.ownerId !== undefined) {
      records = records.filter((asset) => asset.ownerId === options.ownerId);
    }
    if (options.ownerType !== undefined) {
      records = records.filter(
        (asset) => asset.ownerType === options.ownerType,
      );
    }
    records.sort(compareCreatedAt(options.sort ?? "newest"));
    return applyWindow(records, options);
  }

  async deleteAudioAsset(id: string): Promise<void> {
    const backend = await this.backendPromise;
    await backend.delete(STORE_NAMES.audioAssets, id);
    this.emit({ entity: "audio", action: "delete", id });
  }

  async exportSnapshot(): Promise<MemorySnapshot> {
    const [gardenItems, sessions, audioAssets] = await Promise.all([
      this.listGardenItems({ sort: "oldest" }),
      this.listSessionRecords({ sort: "oldest" }),
      this.listAudioAssets({ sort: "oldest" }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      gardenItems,
      sessions,
      audioAssets,
    };
  }

  async clearAll(): Promise<void> {
    const backend = await this.backendPromise;
    await Promise.all([
      backend.clear(STORE_NAMES.gardenItems),
      backend.clear(STORE_NAMES.sessions),
      backend.clear(STORE_NAMES.audioAssets),
    ]);
    this.emit({ entity: "store", action: "clear" });
  }

  private async putSeedData(
    seed: MemorySeedData,
    backend: PersistenceBackend,
  ): Promise<void> {
    for (const item of seed.gardenItems) {
      await backend.put(STORE_NAMES.gardenItems, clone(item));
    }
    for (const session of seed.sessions) {
      await backend.put(STORE_NAMES.sessions, clone(session));
    }
    for (const asset of seed.audioAssets) {
      await backend.put(STORE_NAMES.audioAssets, clone(asset));
    }
  }

  private async requireGardenItem(id: string): Promise<GardenItem> {
    const item = await this.getGardenItem(id);
    if (!item) {
      throw new MemoryIntegrityError(
        `Garden item ${id} does not exist`,
        "GARDEN_NOT_FOUND",
      );
    }
    return item;
  }

  private async requireSessionRecord(id: string): Promise<SessionRecord> {
    const session = await this.getSessionRecord(id);
    if (!session) {
      throw new MemoryIntegrityError(
        `Session ${id} does not exist`,
        "SESSION_NOT_FOUND",
      );
    }
    return session;
  }

  private emit(change: MemoryStoreChange): void {
    for (const listener of this.listeners) listener(change);
  }
}

/** Shared client store. Call initializeMemoryStore() once from a client boundary. */
export const memoryStore = new MemoryStore();

export function initializeMemoryStore(
  options?: InitializeMemoryStoreOptions,
): Promise<void> {
  return memoryStore.initialize(options);
}

export async function listMemoriesForDate(
  date: CalendarDate,
  options: ListOptions = {},
): Promise<SessionRecord[]> {
  return memoryStore.listSessionRecords({ ...options, pinnedDate: date });
}
