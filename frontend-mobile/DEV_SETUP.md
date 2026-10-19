# Mobile App Dev Setup (Fix Tunnel / ngrok errors)

## Fix: "Cannot reach server at ...exp.direct:8000"

That URL is Expo's **Metro tunnel**, not your backend. The app now reads `EXPO_PUBLIC_API_URL` from `.env` instead.

1. Edit `frontend-mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_IP:8001
   ```
2. Restart Expo: `npm run start:clear`
3. Start backend: `uvicorn main:app --host 0.0.0.0 --port 8001`

## Recommended: use LAN (not Tunnel)

Tunnel mode (`expo start --tunnel`) uses ngrok and often shows:

> Tunnel connection has been closed...

Use LAN instead:

```bash
cd frontend-mobile
npm run start:lan
```

Then scan the QR code in **Expo Go** while phone and laptop are on the **same Wi-Fi**.

## Backend must be reachable from phone

Start backend on all interfaces:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Set API URL (replace with your laptop IP):

```bash
# PowerShell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.25:8001"
npm run start:lan
```

Or copy `.env.example` to `.env` and edit `EXPO_PUBLIC_API_URL`.

## Android emulator only

```bash
npm run start:lan
npm run android
```

API default for emulator: `http://10.0.2.2:8001`

## If Expo still fails

1. Stop Expo (`Ctrl+C`)
2. Clear cache: `npm run start:clear`
3. Disable VPN on phone and PC
4. Allow Node.js through Windows Firewall (private network)
5. Only use tunnel if LAN is impossible: `npm run start:tunnel`
