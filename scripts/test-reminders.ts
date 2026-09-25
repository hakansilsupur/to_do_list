/**
 * Table tests for the two pure pieces: quick-add parsing and notification planning.
 * Bundled with esbuild so the real TypeScript source runs, no device needed.
 */
import { EMPTY_DRAFT, mergeQuickAdd, parseQuickAdd } from '../src/lib/parseQuickAdd';
import {
  formatReminder,
  nextOccurrence,
  notificationId,
  planNotifications,
  snoozedReminder,
} from '../src/lib/reminders';
import type { AppState, Reminder, Task } from '../src/types';
import { buildBackup, backupFilename, readBackup } from '../src/lib/backup';
import { parseState } from '../src/store/storage';

let pass = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const lists = [
  { id: 'list-personal', name: 'Personal', color: '#3d7bfb' },
  { id: 'list-work', name: 'Work', color: '#f0973f' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = localDate(new Date());
const tomorrow = localDate(new Date(Date.now() + 86_400_000));

// ---------- quick add: times ----------

const q1 = parseQuickAdd('Call the dentist tomorrow at 9am', lists);
check('title strips date and time', q1.title === 'Call the dentist', `"${q1.title}"`);
check('due date is tomorrow', q1.dueDate === tomorrow, `${q1.dueDate}`);
check('reminder set at 09:00', new Date(q1.reminder!.at).getHours() === 9);
check('reminder minutes zero', new Date(q1.reminder!.at).getMinutes() === 0);
check('reminder on the due day', localDate(new Date(q1.reminder!.at)) === tomorrow);
check('single reminder does not repeat', q1.reminder!.repeat === 'none');

const q2 = parseQuickAdd('Standup at 9:30', lists);
check('9:30 parsed', new Date(q2.reminder!.at).getHours() === 9 && new Date(q2.reminder!.at).getMinutes() === 30);
check('title without time', q2.title === 'Standup', `"${q2.title}"`);

const q3 = parseQuickAdd('Gym at 6pm', lists);
check('pm converts to 18:00', new Date(q3.reminder!.at).getHours() === 18);

const q4 = parseQuickAdd('Lunch at noon', lists);
check('noon is 12:00', new Date(q4.reminder!.at).getHours() === 12);
check('noon stripped from title', q4.title === 'Lunch', `"${q4.title}"`);

// A bare time already past today must roll to tomorrow, never schedule in the past.
const hourAgo = new Date(Date.now() - 3_600_000);
const q5 = parseQuickAdd(`Water plants at ${hourAgo.getHours()}:${pad(hourAgo.getMinutes())}`, lists);
check('past bare time rolls to tomorrow', new Date(q5.reminder!.at).getTime() > Date.now(),
  `${q5.reminder?.at}`);

const q6 = parseQuickAdd('Buy milk tomorrow', lists);
check('a date alone creates no reminder', q6.reminder === null);
check('date-alone still sets due date', q6.dueDate === tomorrow);

const q7 = parseQuickAdd('Take the bins out tonight', lists);
check('tonight implies 20:00', new Date(q7.reminder!.at).getHours() === 20);
check('tonight is today', q7.dueDate === today, `${q7.dueDate}`);

// ---------- quick add: repeats ----------

const r1 = parseQuickAdd('Team sync every monday at 10am', lists);
check('every monday repeats weekly', r1.reminder!.repeat === 'week', `${r1.reminder?.repeat}`);
check('every monday anchors on a Monday', new Date(r1.reminder!.at).getDay() === 1);
check('every monday at 10:00', new Date(r1.reminder!.at).getHours() === 10);
check('repeat words stripped from title', r1.title === 'Team sync', `"${r1.title}"`);

const r2 = parseQuickAdd('Take vitamins daily', lists);
check('daily repeats', r2.reminder!.repeat === 'day');
check('repeat with no time defaults to 09:00', new Date(r2.reminder!.at).getHours() === 9);
check('daily stripped from title', r2.title === 'Take vitamins', `"${r2.title}"`);

const r3 = parseQuickAdd('Pay rent every month', lists);
check('monthly repeats', r3.reminder!.repeat === 'month');

const r4 = parseQuickAdd('Renew passport every year !high', lists);
check('yearly repeats', r4.reminder!.repeat === 'year');
check('repeat composes with priority', r4.priority === 'high');

// Regression: existing behaviour must survive the new rules.
const r5 = parseQuickAdd('Send invoice friday #work !med', lists);
check('weekday date rule still works', r5.dueDate !== null);
check('list tag still works', r5.listId === 'list-work');
check('priority still works', r5.priority === 'medium');
check('no accidental reminder', r5.reminder === null);
check('title intact', r5.title === 'Send invoice', `"${r5.title}"`);

const r6 = parseQuickAdd('Email Mark about the deck', lists);
check('plain text untouched', r6.title === 'Email Mark about the deck' && r6.reminder === null);

// ---------- add-bar chips merged with typed text ----------

const plain = parseQuickAdd('Ceza itiraz', lists);
check('untouched chips change nothing',
  JSON.stringify(mergeQuickAdd(plain, EMPTY_DRAFT)) === JSON.stringify(plain));

const chipDate = mergeQuickAdd(plain, { dueDate: tomorrow, priority: 'none' });
check('chip date fills an undated task', chipDate.dueDate === tomorrow);
check('chip date leaves the title alone', chipDate.title === 'Ceza itiraz');

const chipPriority = mergeQuickAdd(plain, { dueDate: null, priority: 'high' });
check('chip priority applies when text has none', chipPriority.priority === 'high');

// Typed beats tapped, for both fields, so the visible text is never contradicted.
const typedDate = parseQuickAdd('Ceza itiraz today', lists);
check('typed date beats the chip',
  mergeQuickAdd(typedDate, { dueDate: tomorrow, priority: 'none' }).dueDate === today,
  mergeQuickAdd(typedDate, { dueDate: tomorrow, priority: 'none' }).dueDate ?? 'null');

const typedPriority = parseQuickAdd('Ceza itiraz !low', lists);
check('typed priority beats the chip',
  mergeQuickAdd(typedPriority, { dueDate: null, priority: 'high' }).priority === 'low');

// Each field resolves on its own: typed date + chip priority must both survive.
check('typed date and chip priority combine',
  (() => {
    const m = mergeQuickAdd(typedDate, { dueDate: null, priority: 'medium' });
    return m.dueDate === today && m.priority === 'medium';
  })());

check('clearing the chips returns to unset',
  (() => {
    const m = mergeQuickAdd(plain, EMPTY_DRAFT);
    return m.dueDate === null && m.priority === 'none';
  })());

// A reminder parsed out of the text must not be dropped by the merge.
const typedReminder = parseQuickAdd('Ceza itiraz at 9am', lists);
check('merge preserves a parsed reminder',
  mergeQuickAdd(typedReminder, { dueDate: tomorrow, priority: 'high' }).reminder !== null);

// ---------- notification planning ----------

const baseTask = (over: Partial<Task>): Task => ({
  id: 'id-' + (over.title ?? 'x'),
  title: 'Task',
  notes: '',
  done: false,
  dueDate: null,
  reminder: null,
  priority: 'none',
  listId: 'list-personal',
  subtasks: [],
  createdAt: new Date().toISOString(),
  completedAt: null,
  ...over,
});

const now = new Date('2026-06-15T12:00:00Z');
const future: Reminder = { at: '2026-06-15T18:00:00Z', repeat: 'none' };
const past: Reminder = { at: '2026-06-01T09:00:00Z', repeat: 'none' };
const pastDaily: Reminder = { at: '2026-06-01T09:00:00Z', repeat: 'day' };

const planned = planNotifications(
  [
    baseTask({ id: 'a', title: 'Future one-off', reminder: future }),
    baseTask({ id: 'b', title: 'Past one-off', reminder: past }),
    baseTask({ id: 'c', title: 'Repeating', reminder: pastDaily }),
    baseTask({ id: 'd', title: 'Done with reminder', reminder: future, done: true }),
    baseTask({ id: 'e', title: 'No reminder' }),
  ],
  now,
);
const ids = planned.map((p) => p.taskId).sort();
check('plans exactly the right tasks', JSON.stringify(ids) === JSON.stringify(['a', 'c']),
  JSON.stringify(ids));
check('past one-off excluded', !ids.includes('b'));
check('completed task excluded', !ids.includes('d'));

const repeating = planned.find((p) => p.taskId === 'c')!;
check('stale repeat rolls into the future', new Date(repeating.at) > now, repeating.at);
check('repeat interval preserved', repeating.repeat === 'day');

const oneOff = planned.find((p) => p.taskId === 'a')!;
check('one-off keeps its exact time', oneOff.at === new Date(future.at).toISOString());
check('empty notes fall back to a body', oneOff.body === 'Reminder');

const withNotes = planNotifications(
  [baseTask({ id: 'n', title: 'T', notes: 'Bring the form', reminder: future })],
  now,
)[0];
check('notes become the body', withNotes.body === 'Bring the form');

// ---------- ids ----------

const uuid = '4f1a2b3c-1111-2222-3333-444455556666';
check('id is stable', notificationId(uuid) === notificationId(uuid));
check('id is a positive 31-bit int',
  Number.isInteger(notificationId(uuid)) &&
    notificationId(uuid) > 0 &&
    notificationId(uuid) <= 0x7fffffff,
  String(notificationId(uuid)));
check('different ids differ', notificationId('a') !== notificationId('b'));

const many = new Set(
  Array.from({ length: 5000 }, (_, i) => notificationId(`task-${i}-uuid-abcdef`)),
);
check('no collisions across 5000 ids', many.size === 5000, `${many.size}`);

// ---------- snooze + next occurrence ----------

const snoozed = snoozedReminder({ at: past.at, repeat: 'week' }, now);
check('snooze moves 10 minutes out',
  new Date(snoozed.at).getTime() - now.getTime() === 10 * 60_000);
check('snooze keeps the repeat', snoozed.repeat === 'week');

check('nextOccurrence leaves a future one-off alone',
  nextOccurrence(future, now)!.toISOString() === new Date(future.at).toISOString());
check('nextOccurrence drops a past one-off', nextOccurrence(past, now) === null);
check('nextOccurrence rolls a weekly anchor forward',
  nextOccurrence({ at: '2026-06-01T09:00:00Z', repeat: 'week' }, now)! > now);
check('nextOccurrence survives a garbage timestamp',
  nextOccurrence({ at: 'not-a-date', repeat: 'none' }, now) === null);
check('formatReminder renders something for a future time',
  formatReminder(future, now).length > 0, formatReminder(future, now));
check('formatReminder is empty for a dead one-off', formatReminder(past, now) === '');

// ---------- backup: export payload and import validation ----------

const sampleState: AppState = {
  lists: [
    { id: 'list-personal', name: 'Personal', color: '#3d7bfb' },
    { id: 'list-work', name: 'Work', color: '#f0973f' },
  ],
  tasks: [
    baseTask({
      id: 't1',
      title: 'Ceza itiraz',
      notes: 'bring the form',
      dueDate: '2026-10-01',
      priority: 'high',
      reminder: { at: '2026-10-01T09:00:00.000Z', repeat: 'week' },
      subtasks: [{ id: 's1', title: 'print it', done: true }],
      listId: 'list-work',
    }),
    baseTask({ id: 't2', title: 'Kablotv basvur' }),
  ],
};

const payload = buildBackup(sampleState);
check('backup is tagged and versioned',
  payload.app === 'tasks' && payload.schemaVersion === 1 && payload.exportedAt.length > 0);
check('backup carries every task and list',
  payload.tasks.length === 2 && payload.lists.length === 2);
check('filename is dated', /^tasks-backup-\d{4}-\d{2}-\d{2}\.json$/.test(backupFilename()),
  backupFilename());

const restored = readBackup(JSON.stringify(payload));
check('a backup imports back', restored !== null);
check('round-trip keeps tasks and lists',
  restored!.tasks.length === 2 && restored!.lists.length === 2);

const t1 = restored!.tasks.find((t) => t.title === 'Ceza itiraz')!;
check('round-trip keeps the reminder',
  t1.reminder?.at === '2026-10-01T09:00:00.000Z' && t1.reminder?.repeat === 'week');
check('round-trip keeps subtasks', t1.subtasks.length === 1 && t1.subtasks[0].done === true);
check('round-trip keeps priority, notes, due date and list',
  t1.priority === 'high' && t1.notes === 'bring the form' &&
    t1.dueDate === '2026-10-01' && t1.listId === 'list-work');

// A raw todo:v1:state dump — what the DevTools rescue route produces — must import too.
check('a bare {lists,tasks} dump imports',
  readBackup(JSON.stringify({ lists: sampleState.lists, tasks: sampleState.tasks }))
    ?.tasks.length === 2);

// Junk must be refused, never thrown on, and never half-applied.
for (const [name, text] of [
  ['not json', '{ nope'],
  ['empty file', ''],
  ['a bare array', '[1,2,3]'],
  ['null', 'null'],
  ['an unrelated object', '{"hello":"world"}'],
  ['no lists', '{"tasks":[]}'],
  ['lists of the wrong type', '{"lists":"nope","tasks":[]}'],
  ['a truncated backup', JSON.stringify(payload).slice(0, 80)],
] as [string, string][]) {
  check(`rejects ${name}`, readBackup(text) === null);
}

// Individually broken rows are dropped, not fatal to the whole import.
const partly = readBackup(JSON.stringify({
  lists: sampleState.lists,
  tasks: [{ title: 'good one' }, { notes: 'no title' }, 'garbage', null, 42],
}));
check('drops unusable tasks but keeps the good ones',
  partly !== null && partly.tasks.length === 1 && partly.tasks[0].title === 'good one',
  `${partly?.tasks.length}`);
check('an imported task gets safe defaults',
  partly!.tasks[0].priority === 'none' && partly!.tasks[0].reminder === null &&
    partly!.tasks[0].subtasks.length === 0);

// A task pointing at a list the file doesn't contain must not vanish.
const orphan = parseState({
  lists: [{ id: 'list-personal', name: 'Personal', color: '#3d7bfb' }],
  tasks: [{ title: 'orphan', listId: 'list-that-went-away' }],
});
check('a task in a missing list falls back to the inbox',
  orphan?.tasks[0].listId === 'list-personal', orphan?.tasks[0].listId);

console.log(`\n${pass}/${pass + failures.length} checks passed`);
if (failures.length) {
  console.log('failed: ' + failures.join(', '));
  process.exit(1);
}
