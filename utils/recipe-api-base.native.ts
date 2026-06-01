import Constants from 'expo-constants';

export function getDefaultRecipeApiBaseUrl() {
  const hostName = getExpoDevServerHostName();

  return `http://${hostName || 'localhost'}:4874`;
}

function getExpoDevServerHostName() {
  const hostUri = Constants.expoConfig?.hostUri?.trim();

  if (!hostUri) {
    return '';
  }

  try {
    return new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`).hostname;
  } catch {
    return hostUri.split(':')[0] ?? '';
  }
}
