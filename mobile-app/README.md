# KoobD Mobile App

This folder packages KoobD as a real mobile app shell using Capacitor.

It does **not** replace the PHP/MySQL website. Instead, it wraps the deployed KoobD platform in a native Android or iPhone app container so users install an app with its own icon and app window.

## What this mobile app does

- Opens KoobD inside a native mobile shell
- Uses the existing KoobD backend and database
- Can be built into:
  - Android APK / AAB
  - iPhone app through Xcode

## Before building

KoobD must be hosted on a live URL first, ideally:

- `https://your-domain.com`

The app shell reads the site URL from:

- `KOOBD_APP_URL`

Example:

- `https://koobd.example.com`

## Install dependencies

From this `mobile-app` folder:

```powershell
npm install
```

## Set the KoobD app URL

In PowerShell:

```powershell
$env:KOOBD_APP_URL="https://your-koobd-domain.example.com"
```

For local testing, use the right URL for the target:

- Android emulator: `http://10.0.2.2:8080/log.php`
- Real phone on the same Wi-Fi: `http://192.168.1.14:8080/log.php`
- Hosted deployment: `https://your-koobd-domain.example.com`

Important:

- `http://localhost:8080/log.php` works in your desktop browser
- but it does **not** work as the mobile app URL on a phone
- inside a mobile app, `localhost` points to the phone itself, not your computer

## Create Android project

```powershell
npm run android:add
npm run cap:sync
npm run android:open
```

Then build the APK or AAB from Android Studio.

## Create iPhone project

```powershell
npm run ios:add
npm run cap:sync
npm run ios:open
```

Then build and sign the app from Xcode on macOS.

## Important note

This is the fastest way to get KoobD into an installable mobile app.

If you later want:

- better offline support
- smoother native navigation
- better file and media handling
- stronger App Store / Play Store polish

the next upgrade path is to keep KoobD as backend APIs and build a dedicated mobile frontend on top of it.
