import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

function readHostFromScriptUrl() {
  const scriptUrl = NativeModules?.SourceCode?.scriptURL || '';
  if (!scriptUrl) {
    return '';
  }

  try {
    const parsed = new URL(scriptUrl);
    return parsed.hostname || '';
  } catch (_error) {
    const match = scriptUrl.match(/https?:\/\/([^/:]+)/i);
    return match?.[1] || '';
  }
}

function readHostFromExpoConstants() {
  const hostCandidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.manifest?.debuggerHost,
    Constants?.manifest2?.extra?.expoClient?.hostUri,
  ].filter(Boolean);

  for (const candidate of hostCandidates) {
    const host = String(candidate).split(':')[0]?.trim();
    if (host) {
      return host;
    }
  }

  return '';
}

function isLocalHost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) {
    return false;
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  if (host.startsWith('10.')) {
    return true;
  }

  if (host.startsWith('192.168.')) {
    return true;
  }

  const match172 = host.match(/^172\.(\d{1,2})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function toApiUrl(hostname) {
  return `http://${hostname}:4000/api`;
}

function addUnique(list, value) {
  if (!value || list.includes(value)) {
    return;
  }
  list.push(value);
}

function resolveApiUrls() {
  const envApiUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim();
  const urls = [];

  const expoHost = readHostFromExpoConstants();
  if (expoHost && isLocalHost(expoHost)) {
    addUnique(urls, toApiUrl(expoHost));
  }

  // Keep env URL as high-priority override, but still include fallbacks if it is stale.
  addUnique(urls, envApiUrl);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    addUnique(urls, toApiUrl(window.location.hostname));
  }

  const metroHost = readHostFromScriptUrl();
  if (metroHost && isLocalHost(metroHost)) {
    addUnique(urls, toApiUrl(metroHost));
  }

  if (Platform.OS === 'android') {
    addUnique(urls, 'http://10.0.2.2:4000/api');
  }

  addUnique(urls, 'http://localhost:4000/api');
  addUnique(urls, 'http://127.0.0.1:4000/api');

  return urls;
}

export const API_BASE_URLS = resolveApiUrls();
export const API_URL = API_BASE_URLS[0] || 'http://localhost:4000/api';

if (__DEV__) {
  console.log('[API CONFIG]', {
    platform: Platform.OS,
    scriptURL: NativeModules?.SourceCode?.scriptURL || '',
    expoHostUri: Constants?.expoConfig?.hostUri || Constants?.manifest?.debuggerHost || '',
    envApiUrl: process.env.EXPO_PUBLIC_API_URL || '',
    apiCandidates: API_BASE_URLS,
    resolvedApiUrl: API_URL,
  });
}
