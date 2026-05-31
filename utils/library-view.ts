import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type LibraryViewMode = 'grid' | 'list';
export type LibrarySortMode = 'recent' | 'alphabetical';

const VIEW_MODE_KEY = 'recipe-library:view-mode:v1';
const SORT_MODE_KEY = 'recipe-library:sort-mode:v1';
const listeners = new Set<() => void>();

let viewModeLoaded = false;
let viewModeLoading: Promise<void> | null = null;
let viewModeRevision = 0;
let viewModeSnapshot: LibraryViewMode = 'grid';
let sortModeLoaded = false;
let sortModeLoading: Promise<void> | null = null;
let sortModeRevision = 0;
let sortModeSnapshot: LibrarySortMode = 'recent';

function emit() {
  listeners.forEach((listener) => listener());
}

function readViewMode(): LibraryViewMode {
  if (viewModeLoaded) {
    return viewModeSnapshot;
  }

  void loadViewMode();
  return viewModeSnapshot;
}

function readSortMode(): LibrarySortMode {
  if (sortModeLoaded) {
    return sortModeSnapshot;
  }

  void loadSortMode();
  return sortModeSnapshot;
}

function loadViewMode() {
  if (viewModeLoaded || viewModeLoading) {
    return viewModeLoading;
  }

  const revision = viewModeRevision;
  viewModeLoading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(VIEW_MODE_KEY);
      const nextMode = raw === 'list' ? 'list' : 'grid';

      if (revision === viewModeRevision && viewModeSnapshot !== nextMode) {
        viewModeSnapshot = nextMode;
        emit();
      }
    } catch (error) {
      console.error('Failed to read library view mode from async storage.', error);
    } finally {
      viewModeLoaded = true;
      viewModeLoading = null;
    }
  })();

  return viewModeLoading;
}

function loadSortMode() {
  if (sortModeLoaded || sortModeLoading) {
    return sortModeLoading;
  }

  const revision = sortModeRevision;
  sortModeLoading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(SORT_MODE_KEY);
      const nextMode = raw === 'alphabetical' ? 'alphabetical' : 'recent';

      if (revision === sortModeRevision && sortModeSnapshot !== nextMode) {
        sortModeSnapshot = nextMode;
        emit();
      }
    } catch (error) {
      console.error('Failed to read library sort mode from async storage.', error);
    } finally {
      sortModeLoaded = true;
      sortModeLoading = null;
    }
  })();

  return sortModeLoading;
}

function writeViewMode(mode: LibraryViewMode) {
  viewModeSnapshot = mode;
  viewModeLoaded = true;
  viewModeRevision += 1;

  void AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch((error: unknown) => {
    console.error('Failed to persist library view mode to async storage.', error);
  });

  emit();
}

function writeSortMode(mode: LibrarySortMode) {
  sortModeSnapshot = mode;
  sortModeLoaded = true;
  sortModeRevision += 1;

  void AsyncStorage.setItem(SORT_MODE_KEY, mode).catch((error: unknown) => {
    console.error('Failed to persist library sort mode to async storage.', error);
  });

  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibraryViewMode() {
  return readViewMode();
}

export function getLibrarySortMode() {
  return readSortMode();
}

export function setLibraryViewMode(mode: LibraryViewMode) {
  if (readViewMode() === mode) {
    return;
  }

  writeViewMode(mode);
}

export function setLibrarySortMode(mode: LibrarySortMode) {
  if (readSortMode() === mode) {
    return;
  }

  writeSortMode(mode);
}

export function useLibraryViewMode() {
  return useSyncExternalStore(subscribe, getLibraryViewMode, () => 'grid' as LibraryViewMode);
}

export function useLibrarySortMode() {
  return useSyncExternalStore(subscribe, getLibrarySortMode, () => 'recent' as LibrarySortMode);
}
