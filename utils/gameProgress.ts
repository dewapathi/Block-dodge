/**
 * Persists adventure progress to device storage via expo-secure-store.
 * Survives back-navigation AND app kills / restarts.
 * Progress is cleared only on Game Over.
 */

import * as SecureStore from 'expo-secure-store';

export interface AdventureProgress {
  stage: number;
  lives: number;
}

const KEY = 'enchanted_maze_progress';

// In-memory cache so reads within a session are instant.
let _cache: AdventureProgress | null = null;
let _loaded = false;

export const GameProgress = {
  /**
   * Load progress from disk into the in-memory cache.
   * Call once on app start (e.g. home screen mount).
   */
  async load(): Promise<AdventureProgress | null> {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      _cache = raw ? (JSON.parse(raw) as AdventureProgress) : null;
    } catch {
      _cache = null;
    }
    _loaded = true;
    return _cache;
  },

  /** Synchronous read from the in-memory cache (call load() first). */
  get(): AdventureProgress | null {
    return _cache;
  },

  /** Save stage + lives to both cache and disk. Fire-and-forget. */
  save(stage: number, lives: number): void {
    _cache = { stage, lives };
    SecureStore.setItemAsync(KEY, JSON.stringify(_cache)).catch(() => {});
  },

  /** Wipe progress from cache and disk. */
  reset(): void {
    _cache = null;
    SecureStore.deleteItemAsync(KEY).catch(() => {});
  },

  get isLoaded(): boolean {
    return _loaded;
  },
};

// ── Time Attack best score ────────────────────────────────────────────────────
const TA_KEY = 'enchanted_maze_ta_best';
let _taBest = 0;

export const TimeAttackBest = {
  async load(): Promise<number> {
    try {
      const raw = await SecureStore.getItemAsync(TA_KEY);
      _taBest = raw ? parseInt(raw, 10) : 0;
    } catch {
      _taBest = 0;
    }
    return _taBest;
  },
  get(): number { return _taBest; },
  save(score: number): void {
    _taBest = score;
    SecureStore.setItemAsync(TA_KEY, String(score)).catch(() => {});
  },
};
