import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, phaseOf, sunDirection, daylight, canSleep, mustSleep } from '../src/game/clock.js';

test('time labels and phases', () => {
  assert.equal(formatTime(6 * 60), '06:00');
  assert.equal(formatTime(17 * 60 + 5.9), '17:05');
  assert.equal(phaseOf(7 * 60), 'dawn');
  assert.equal(phaseOf(12 * 60), 'day');
  assert.equal(phaseOf(17 * 60), 'evening');
  assert.equal(phaseOf(21 * 60), 'night');
});

test('the sun rises east, is high and south at noon, sets west', () => {
  const [x6, y6] = sunDirection(6.1 * 60);
  const [, y12, z12] = sunDirection(12 * 60);
  const [x18] = sunDirection(17.9 * 60);
  assert.ok(x6 > 0.9 && y6 < 0.2);
  assert.ok(y12 > 0.85 && z12 > 0);
  assert.ok(x18 < -0.9);
  for (const m of [360, 600, 900, 1200]) assert.ok(Math.abs(Math.hypot(...sunDirection(m)) - 1) < 1e-9);
});

test('daylight and sleep windows', () => {
  assert.equal(daylight(12 * 60), 1);
  assert.equal(daylight(22 * 60), 0);
  assert.equal(canSleep(16 * 60), false);
  assert.equal(canSleep(17 * 60), true);
  assert.equal(mustSleep(24 * 60), true);
});
