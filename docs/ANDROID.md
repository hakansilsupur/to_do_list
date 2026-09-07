# Android build

The app ships as an Android APK: the same React build, wrapped in a native WebView by
[Capacitor](https://capacitorjs.com). There's no rewrite and no server — tasks live in
the WebView's `localStorage`, exactly as they do in the browser.

- Application ID: `com.hakansilsupur.tasks`
- Min SDK 24 (Android 7.0) · target/compile SDK 36
- The only permission requested is `INTERNET`, which Capacitor's local asset server
  needs; nothing leaves the device.

## Getting an APK without installing anything

Every push builds one. Open the repo's **Actions → Android APK** tab, pick the latest
green run, and download the `tasks-debug-apk` artifact (kept 30 days). Unzip it and you
have an installable `.apk`.

Tagged versions also get a permanent download:

```bash
npm version patch          # bumps package.json, creates the tag
git push --follow-tags
```

The `v*` tag builds the APK and attaches it to a GitHub Release.

## Installing on a phone

Over USB, with developer mode and USB debugging enabled:

```bash
adb install -r tasks-0.1.0-build12-debug.apk
```

Or copy the APK to the device and open it — Android will ask you to allow installs from
that source. Debug APKs are signed with the universal Android debug key, which is fine
for your own device but cannot be published to Play.

## Building locally

Needs a JDK (17+) and the Android SDK. Easiest route is
[Android Studio](https://developer.android.com/studio), which installs both; otherwise
install the command-line tools and set `ANDROID_HOME`.

```bash
npm install
npm run android:apk       # web build → cap sync → gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

Other scripts:

| script | what it does |
| --- | --- |
| `npm run android:sync` | rebuild web assets and copy them into the native project |
| `npm run android:apk` | sync, then build a debug APK |
| `npm run android:release` | sync, then build a release APK |
| `npm run android:open` | open the project in Android Studio |
| `npm run icon` | re-render the launcher icon from the app's check mark |

**Always go through `android:sync` (or `npx cap sync android`) before Gradle.** The web
assets under `android/app/src/main/assets/public` and the
`capacitor-cordova-android-plugins` module are generated, not committed — Gradle will
fail on a fresh clone without a sync first.

## Signed releases

A debug APK can't be upgraded in place by a release build and can't go on Play. For that
you need your own keystore. **Generate it once and never lose it** — Android identifies
an app by its signing key, so a lost key means you can never ship an update to installed
users.

```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias tasks
```

### Locally

Put `release.jks` in `android/`, then create `android/keystore.properties`:

```properties
storeFile=release.jks
storePassword=<store password>
keyAlias=tasks
keyPassword=<key password>
```

Both files are gitignored. Then `npm run android:release`.

### In CI

Add four repository secrets under **Settings → Secrets and variables → Actions**:

| secret | value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `tasks` |
| `ANDROID_KEY_PASSWORD` | key password |

With those set, pushing a `v*` tag produces a signed release APK on the GitHub Release.
Without them the workflow still succeeds — it warns and publishes the debug APK only, so
CI never goes red just because signing isn't set up yet.

`android/app/build.gradle` reads these from `keystore.properties` first, then from
`ANDROID_KEYSTORE_*` environment variables, and skips release signing entirely when
neither is present.

## Versioning

`versionName` comes from `package.json`, so `npm version` is the single place to bump it.
`versionCode` — the integer Android compares to decide what counts as an upgrade — is
passed by CI as the workflow run number, so every CI build installs cleanly over the one
before. A local build without `-PversionCode` uses `1`.

## Notes on behaviour in the app

- **Back button** peels off one layer at a time: detail drawer, then the list drawer,
  then it minimizes the app rather than killing it.
- **Status bar** follows the light/dark palette and repaints when the system theme
  changes.
- **Safe areas** — the layout is inset with `env(safe-area-inset-*)` so nothing hides
  under the status bar or the gesture pill.
- **Data** persists in the WebView's `localStorage`, keyed to the `https://localhost`
  origin Capacitor serves from. It survives app updates. Clearing the app's storage in
  Android settings resets it to the sample tasks. There is no cloud sync and no backup.

## Regenerating the icon

`resources/icon.png` and its adaptive-icon pair are rendered from the same blue check
mark used as the favicon:

```bash
npm run icon
```

That runs `scripts/make-icon.mjs` (headless Chromium via `playwright-core`; point
`CHROMIUM_PATH` at your browser if the default isn't found) and then regenerates the full
Android density set with `@capacitor/assets`.
