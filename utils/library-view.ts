import '@/utils/install-local-storage';

import { useSyncExternalStore } from 'react';

export type LibraryViewMode = 'grid' | 'list';

const VIEW_MODE_KEY = 'recipe-library:view-mode:v1';
const listeners = new Set<() => void>();

let loaded = false;
let snapshot: LibraryViewMode = 'grid';

function emit() {
  listeners.forEach((listener) => listener());
}

function readViewMode(): LibraryViewMode {
  if (loaded) {
    return snapshot;
  }

  loaded = true;

  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    snapshot = raw === 'list' ? 'list' : 'grid';
  } catch {
    snapshot = 'grid';
  }

  return snapshot;
}

function writeViewMode(mode: LibraryViewMode) {
  snapshot = mode;
  loaded = true;

  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Ignore persistence failures; in-memory mode still updates.
  }

  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibraryViewMode() {
  return readViewMode();
}

export function setLibraryViewMode(mode: LibraryViewMode) {
  if (readViewMode() === mode) {
    return;
  }

  writeViewMode(mode);
}

export function useLibraryViewMode() {
  return useSyncExternalStore(subscribe, getLibraryViewMode, () => 'grid' as LibraryViewMode);
}
