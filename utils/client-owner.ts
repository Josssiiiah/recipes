import AsyncStorage from '@react-native-async-storage/async-storage';

const CLIENT_ID_KEY = 'recipe-library:client-id:v1';

let clientIdPromise: Promise<string> | null = null;

export async function getRecipeClientId() {
  if (clientIdPromise) {
    return clientIdPromise;
  }

  clientIdPromise = (async () => {
    const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);

    if (existing && /^[A-Za-z0-9._:-]{8,128}$/.test(existing)) {
      return existing;
    }

    const nextId = `install_${createRandomId()}`;
    await AsyncStorage.setItem(CLIENT_ID_KEY, nextId);
    return nextId;
  })().catch((error) => {
    clientIdPromise = null;
    throw error;
  });

  return clientIdPromise;
}

function createRandomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
