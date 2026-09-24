import { useEffect, useRef } from 'react';
import type { Task } from '../types';
import { isNative } from './native';
import { planNotifications, repeatEvery, type PlannedNotification } from './reminders';

const SYNC_DEBOUNCE_MS = 400;
const ACTION_TYPE_ID = 'reminder';

/** What a tapped notification asks the app to do. */
export type NotificationAction =
  | { kind: 'open'; taskId: string }
  | { kind: 'done'; taskId: string }
  | { kind: 'snooze'; taskId: string };

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/**
 * Ask for notification permission. Called the first time a reminder is actually
 * set rather than at launch — a permission dialog with no context just gets
 * dismissed, and a denial is sticky.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const LocalNotifications = await plugin();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Android 12+ gates precise alarms behind a separate setting. Without it reminders
 * still fire, just potentially minutes late under Doze — so this reports the state
 * for the UI to explain rather than blocking anything.
 */
export async function checkExactAlarms(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const LocalNotifications = await plugin();
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

export async function requestExactAlarms(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const LocalNotifications = await plugin();
    const status = await LocalNotifications.changeExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

function toScheduleOptions(item: PlannedNotification) {
  const every = repeatEvery(item.repeat);
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    actionTypeId: ACTION_TYPE_ID,
    smallIcon: 'ic_stat_reminder',
    extra: { taskId: item.taskId },
    schedule: {
      at: new Date(item.at),
      // Fire through Doze; without this a reminder can slip until the next
      // maintenance window, which for an alarm is the whole point missed.
      allowWhileIdle: true,
      ...(every ? { every, repeats: true } : {}),
    },
  };
}

/**
 * Make the OS's pending set match what the tasks say it should be. Diffing rather
 * than cancel-all-then-reschedule keeps untouched alarms untouched, so editing one
 * task can't disturb another's exact timing.
 */
export async function syncNotifications(tasks: Task[]): Promise<void> {
  if (!isNative()) return;
  try {
    const LocalNotifications = await plugin();
    const granted = (await LocalNotifications.checkPermissions()).display === 'granted';
    const desired = granted ? planNotifications(tasks) : [];

    const pending = await LocalNotifications.getPending();
    const desiredById = new Map(desired.map((item) => [item.id, item]));

    const stale = pending.notifications.filter((n) => !desiredById.has(n.id));
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
    }

    // A pending alarm exposes no fire time to compare against, so every desired
    // one is re-scheduled; scheduling an existing id replaces it in place.
    if (desired.length > 0) {
      await LocalNotifications.schedule({ notifications: desired.map(toScheduleOptions) });
    }
  } catch {
    // A device that refuses to schedule shouldn't take the app down with it.
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const LocalNotifications = await plugin();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    /* nothing to do */
  }
}

type ReminderOptions = {
  tasks: Task[];
  onAction: (action: NotificationAction) => void;
};

/**
 * Keeps scheduled notifications in step with the task list and routes taps back
 * into the app. No-ops entirely on web, where nothing can fire with the tab shut.
 */
export function useReminders({ tasks, onAction }: ReminderOptions): void {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Register the Snooze / Mark done buttons and listen for taps. Set up once:
  // the handler reads through a ref so re-renders don't churn the listener.
  useEffect(() => {
    if (!isNative()) return;
    let disposed = false;
    let remove: (() => void) | undefined;

    void (async () => {
      try {
        const LocalNotifications = await plugin();
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: ACTION_TYPE_ID,
              actions: [
                { id: 'snooze', title: 'Snooze 10 min' },
                { id: 'done', title: 'Mark done' },
              ],
            },
          ],
        });

        const handle = await LocalNotifications.addListener(
          'localNotificationActionPerformed',
          (event) => {
            const taskId = event.notification.extra?.taskId;
            if (typeof taskId !== 'string') return;
            if (event.actionId === 'done') onActionRef.current({ kind: 'done', taskId });
            else if (event.actionId === 'snooze') onActionRef.current({ kind: 'snooze', taskId });
            else onActionRef.current({ kind: 'open', taskId });
          },
        );

        if (disposed) {
          void handle.remove();
          return;
        }
        remove = () => void handle.remove();
      } catch {
        /* notifications unavailable on this device */
      }
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, []);

  // Re-sync whenever the task list settles.
  useEffect(() => {
    if (!isNative()) return;
    const timer = window.setTimeout(() => void syncNotifications(tasks), SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [tasks]);

  // Repeating reminders roll forward while the app is backgrounded, so reconcile
  // on resume too.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    let disposed = false;
    const latest = () => tasksRef.current;

    void (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('resume', () => void syncNotifications(latest()));
      if (disposed) {
        void handle.remove();
        return;
      }
      remove = () => void handle.remove();
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
}
