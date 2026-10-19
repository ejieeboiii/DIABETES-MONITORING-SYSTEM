import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Hosts used by Expo Metro tunnel — not your FastAPI server */
function isTunnelOrInvalidHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.includes('exp.direct') ||
    h.includes('exp.host') ||
    h.includes('ngrok') ||
    h.includes('tunnel')
  );
}

/** Private LAN IPv4 only (e.g. 192.168.x.x, 10.14.x.x) */
function isPrivateLanIpv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const [, a, b] = match.map(Number);
  if (match.slice(1).some((part) => Number(part) > 255)) return false;
  if (a === 192 && b === 168) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function hostFromDebugger() {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost;

  if (!debuggerHost) return null;
  const host = debuggerHost.split(':')[0];
  if (isTunnelOrInvalidHost(host)) return null;
  if (isPrivateLanIpv4(host)) return host;
  return null;
}

function hostFromManifest() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (isTunnelOrInvalidHost(host)) return null;
  return isPrivateLanIpv4(host) ? host : null;
}

/**
 * Backend URL for FastAPI (port 8001).
 * Set EXPO_PUBLIC_API_URL in frontend-mobile/.env — required when using Expo Tunnel.
 */
export function getApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    let val = fromEnv.replace(/\/$/, '');
    // Common mistake: users sometimes write the host like
    //  http://10.14.156.61.8001 (dot before port) — try to fix it.
    // If the string ends with .<digits> and doesn't already contain a :port,
    // replace the final dot with a colon.
    try {
      const afterProto = val.replace(/^https?:\/\//, '');
      // if there's no colon after hostname but ends with .<portdigits>
      if (!/:[0-9]+$/.test(val) && /^\d+\.\d+\.\d+\.\d+\.[0-9]{2,5}$/.test(afterProto)) {
        const parts = afterProto.split('.');
        const port = parts.pop();
        const host = parts.join('.');
        // Only apply if port looks numeric
        if (/^[0-9]{2,5}$/.test(port)) {
          // preserve protocol if present
          const protoMatch = val.match(/^(https?:\/\/)/);
          const proto = protoMatch ? protoMatch[1] : '';
          val = `${proto}${host}:${port}`;
        }
      }
    } catch (e) {
      // fallback: use raw value
    }
    return val;
  }

  const lanHost = hostFromDebugger() || hostFromManifest();
  if (lanHost) {
    return `http://${lanHost}:8001`;
  }

  if (Platform.OS === 'android' && !Constants.isDevice) {
    return 'http://10.0.2.2:8001';
  }

  return 'http://127.0.0.1:8001';
}

export function getApiSetupHint() {
  const url = getApiBaseUrl();
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    return 'Create frontend-mobile/.env with EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_IP:8001 then restart Expo (npm run start:clear). Use LAN mode, not Tunnel.';
  }
  return `Ensure backend is running: uvicorn main:app --host 0.0.0.0 --port 8001`;
}
