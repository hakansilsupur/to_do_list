import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hakansilsupur.tasks',
  appName: 'Tasks',
  webDir: 'dist',
  android: {
    // Keep the default https://localhost origin. localStorage is keyed by origin,
    // so changing this in a later release would orphan every existing task.
    backgroundColor: '#f5f6f8',
  },
};

export default config;
