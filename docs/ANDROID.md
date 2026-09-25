# Android build

The app ships as an Android APK: the same React build, wrapped in a native WebView by
[Capacitor](https://capacitorjs.com). There's no rewrite and no server — tasks live in
the WebView's `localStorage`, exactly as they do in the browser.

- Application ID: `com.hakansilsupur.tasks`
- Min SDK 24 (Android 7.0) · target/compile SDK 36
- Permissions: `INTERNET` for Capacitor's local asset server, plus
  `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` and
  `WAKE_LOCK` for reminders. Nothing leaves the device.

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
that source.

`-r` reinstalls over an existing copy, keeping its data. That works because every build
shares one signing certificate (see below); if you get "App not installed" or
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed copy predates that fix and has to be
uninstalled once.

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

## Signing, and why updates work

Android identifies an app by the certificate it was signed with, and refuses to install an
update signed by a different key. That makes the signing key the thing that decides
whether a new APK installs *over* the old one or is rejected with "App not installed"
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).

By default Gradle signs debug builds with `~/.android/debug.keystore`, generating one with
a **random** key pair if the machine has none. CI runners are wiped between runs, so that
produced a different certificate on every build — each APK looked like a different app to
Android.

So the debug key is pinned: `android/app/debug.keystore` is committed, and
`android/app/build.gradle` points the `debug` build type at it. Every build, on CI or on
your machine, now signs identically.

**That keystore is deliberately public.** Its password is the well-known `android` and it
is in the repository, so it grants no security: anyone with the repo can build an APK that
installs over yours. That is an acceptable trade for a personal sideloaded app and nothing
more — it is not a Play-publishable key, and it is not a security boundary. For a key only
you hold, set up release signing below; CI then uses it for every build automatically.

Each CI run prints the APK's certificate and checks it against the committed keystore, so
if the signing config ever regresses the build fails rather than shipping an APK that
cannot be installed. Every debug APK carries this certificate:

```
SHA-256  23:38:1C:DC:F5:C3:C3:79:2F:86:1C:F2:67:8F:45:2E:EF:F1:D6:7F:0F:49:92:7C:EC:DF:D2:13:A5:95:67:E7
```

To check an APK yourself:

```bash
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs tasks-*.apk
```

Two APKs showing that same digest will install over each other.

### Switching keys costs one uninstall

Any change of signing key — including moving from the shared debug key to your own release
key — means the next APK cannot install over what's on the phone. You have to uninstall
first, which **erases the app's tasks**: they live in the WebView's private storage, which
Android deletes with the app.

### Backing up

The app has **Export backup** and **Import backup** in the sidebar under *Data*.

Export writes every list and task to a JSON file. On Android it goes through the system
share sheet, so you can drop it in Drive, Files or send it to yourself — deliberately not
into the app's own storage, which Android deletes along with the app. Import replaces
everything after asking, so it doubles as moving your tasks to another phone.

Back up before anything that reinstalls the app. A file copied out through DevTools (below)
imports too — the importer accepts both the export format and a raw `todo:v1:state` dump.

### Rescuing your tasks before an uninstall

Debug builds are debuggable, so the WebView can be inspected from a desktop browser.

1. On the phone: Settings → Developer options → USB debugging on, then connect by USB.
2. On the desktop: open Chrome and go to `chrome://inspect`. The app's WebView appears
   under the device once the app is open — click **inspect**.
3. In the Console, dump the tasks and save the output somewhere:

   ```js
   copy(localStorage.getItem('todo:v1:state'))   // now in your clipboard
   ```

4. Uninstall the old app, install the new APK, and open it.
5. Inspect it the same way and restore:

   ```js
   localStorage.setItem('todo:v1:state', '<paste the JSON>');
   location.reload();
   ```

If you have nothing worth keeping, skip all of this and just uninstall.

## Signed releases

The shared debug key above is public, so it cannot go on Play and gives you no control
over who can publish an update to your install. For a key only you hold, make your own.
Once its secrets exist, CI signs **every** build with it — not just tagged ones — so
updates keep working on that key instead. **Generate it once and never lose it** — Android identifies
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

## Reminders

A task can carry a reminder — a date **and** time — that fires an Android notification
even when the app is closed. Reminders are rescheduled automatically after a reboot.

Set one from the task's detail drawer, or say it in the quick-add bar:

| You type | You get |
| --- | --- |
| `Call the dentist tomorrow at 9am` | reminder tomorrow 09:00 |
| `Standup at 9:15` | today 09:15, or tomorrow if 09:15 has passed |
| `Lunch at noon`, `Bins out tonight` | 12:00 / 20:00 |
| `Take vitamins daily` | repeats every day at 09:00 |
| `Team sync every monday at 10am` | repeats weekly, anchored on the next Monday |
| `Pay rent every month` | repeats monthly |

A bare date never creates a reminder — `Buy milk tomorrow` is due tomorrow and stays
silent. Setting a reminder on a task with no due date fills the due date in, so it
doesn't sit in Someday while quietly waiting to alert you.

**The notification** carries **Snooze 10 min** and **Mark done** buttons; tapping the body
opens the app on that task.

**Permissions.** The app asks for notification permission the first time you actually set
a reminder, not on first launch. If you decline, times are still saved — nothing fires
until you enable notifications for the app in Android settings.

**Exact timing.** Android 12+ gates precise alarms behind a separate setting. Without it
reminders still arrive, but can drift by a few minutes when the phone is dozing. The
detail drawer offers a link to grant it when it's missing.

**Repeating tasks.** Completing a repeating task cancels its next alert but keeps the
repeat; un-completing it schedules the next occurrence again.

**Not available on the web build.** A browser can't alert with the tab closed without a
push server, and this app deliberately has none. The web build shows a reminder's time
on the task and says so in the drawer, but never fires anything.

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
