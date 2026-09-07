import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Native-shell glue for the Android build. Everything here is a no-op in a
 * browser: the plugins are only touched behind `Capacitor.isNativePlatform()`,
 * and their modules are loaded dynamically so the web bundle never pulls in
 * native code it cannot run.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** What the hardware Back button should dismiss, most-nested first. */
export type BackHandler = () => 'handled' | 'exit';

type NativeShellOptions = {
  onBack: BackHandler;
};

export function useNativeShell({ onBack }: NativeShellOptions): void {
  // Match the system bars to the app's palette and follow theme changes.
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = async () => {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      if (cancelled) return;
      const dark = media.matches;
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      // Android colours the bar itself, so it must be set explicitly per theme.
      await StatusBar.setBackgroundColor({ color: dark ? '#0f1116' : '#f5f6f8' });
    };

    void apply().catch(() => {
      // A device without a themeable status bar is not worth failing over.
    });
    media.addEventListener('change', apply);
    return () => {
      cancelled = true;
      media.removeEventListener('change', apply);
    };
  }, []);

  // Back should peel off one layer of UI at a time and only then leave the app.
  // Without this, Android's default is to kill the activity from anywhere.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        if (onBack() === 'exit') void App.minimizeApp();
      });
      if (cancelled) {
        void handle.remove();
        return;
      }
      remove = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [onBack]);
}
