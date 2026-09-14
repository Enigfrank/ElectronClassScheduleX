import test from 'node:test';
import assert from 'node:assert/strict';
import { renameObjectKey } from './scheduleEditorHelpers.mjs';
import {
  generateScheduleConfigSource,
  normalizeScheduleConfigForEditor,
  parseScheduleConfigSource,
} from './configParser.mjs';

/** Create a timetable containing both course indexes and activity text. */
function createTimetable() {
  return { '08:00-08:40': 0, '09:00-09:40': 1, '10:00-10:20': 'Break' };
}

test('editing any time range preserves its row position and content', () => {
  for (const [oldKey, nextKey, expectedKeys] of [
    ['08:00-08:40', '08:05-08:45', ['08:05-08:45', '09:00-09:40', '10:00-10:20']],
    ['09:00-09:40', '09:05-09:45', ['08:00-08:40', '09:05-09:45', '10:00-10:20']],
    ['10:00-10:20', '10:05-10:25', ['08:00-08:40', '09:00-09:40', '10:05-10:25']],
  ]) {
    const table = createTimetable();
    const selections = [];
    renameObjectKey(table, oldKey, nextKey, (key) => selections.push(key));
    assert.deepEqual(Object.keys(table), expectedKeys);
    assert.deepEqual(Object.values(table), [0, 1, 'Break']);
    assert.deepEqual(selections, [nextKey]);
  }
});

test('repeated edits preserve order through editor normalization and source reload', () => {
  let config = normalizeScheduleConfigForEditor({ timetable: { weekday: createTimetable() } });
  renameObjectKey(config.timetable.weekday, '09:00-09:40', '09:05-09:45', null);
  config = normalizeScheduleConfigForEditor(config);
  renameObjectKey(config.timetable.weekday, '09:05-09:45', '09:10-09:50', null);
  renameObjectKey(config.timetable.weekday, '08:00-08:40', '08:05-08:45', null);
  const reloaded = normalizeScheduleConfigForEditor(
    parseScheduleConfigSource(generateScheduleConfigSource(config)),
  );
  assert.deepEqual(Object.entries(reloaded.timetable.weekday), [
    ['08:05-08:45', 0], ['09:10-09:50', 1], ['10:00-10:20', 'Break'],
  ]);
});

test('an existing time range cannot be overwritten, including a course index of zero', () => {
  const table = createTimetable();
  renameObjectKey(table, '09:00-09:40', '08:00-08:40', assert.fail);
  assert.deepEqual(Object.entries(table), Object.entries(createTimetable()));
});

test('unchanged, empty, or missing time ranges leave the timetable intact', () => {
  const table = createTimetable();
  renameObjectKey(table, '09:00-09:40', '09:00-09:40', assert.fail);
  renameObjectKey(table, '09:00-09:40', '', assert.fail);
  renameObjectKey(table, '11:00-11:40', '11:05-11:45', assert.fail);
  assert.deepEqual(Object.entries(table), Object.entries(createTimetable()));
});
