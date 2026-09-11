const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { unlink, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { fetchDailySeatData } = require('../dist/dailySeatData');
const { getOrFetchCached } = require('../dist/cache');
const { cleanupExpiredCacheFiles } = require('../dist/cache');
const { fetchSeatSegment } = require('../dist/routes/seats');

function fixture(t) {
  const prefix = randomUUID();
  const files = new Set();
  const calls = [];
  const state = { failSeats: false, failTimes: false, expired: false, empty: false };
  const row = (origin, destination, train = '1') => ({
    TrainNo: train, Direction: train === '1' ? 0 : 1,
    OriginStationID: origin, DestinationStationID: destination,
    OriginStationCode: origin, DestinationStationCode: destination,
    OriginStationName: { Zh_tw: origin }, DestinationStationName: { Zh_tw: destination },
    StandardSeatStatus: origin === 'A' && destination === 'C' ? 'X' : 'O', BusinessSeatStatus: 'L',
  });
  const seats = [row('A', 'C'), row('A', 'B'), row('B', 'C'), row('C', 'A', '2'), row('C', 'B', '2'), row('B', 'A', '2'), row('A', 'D'), row('C', 'A')];
  const timetable = ['1', '2'].map((train) => ({
    TrainDate: '2026-09-10', DailyTrainInfo: { TrainNo: train, Direction: train === '1' ? 0 : 1 },
    StopTimes: (train === '1' ? ['A', 'B', 'C'] : ['C', 'B', 'A']).map((station, index) => ({
      StationID: station, StationName: { Zh_tw: station }, StopSequence: index + 1,
      DepartureTime: `10:${index}1:00`, ArrivalTime: `10:${index}0:00`,
    })),
  }));
  const deps = {
    async getOrFetchCached(namespace, key, ttl, fetchValue, forceRefresh) {
      namespace = `${prefix}-${namespace}`;
      files.add(path.join(__dirname, '../data/cache', `${namespace}-${Buffer.from(key).toString('base64url')}.json`));
      return getOrFetchCached(namespace, key, state.expired ? -1 : ttl, fetchValue, forceRefresh);
    },
    async tdxGet(url) {
      calls.push(url);
      const isSeats = url.includes('AvailableSeatStatus');
      if (isSeats ? state.failSeats : state.failTimes) throw new Error('upstream failed');
      return structuredClone(isSeats ? { AvailableSeats: state.empty ? [] : seats } : timetable);
    },
  };
  t.after(async () => { await Promise.all([...files].map((file) => unlink(file).catch(() => {}))); });
  return { deps, calls, state, seats };
}

test('daily OD lookup preserves seat status, direction, stop order and independent results', async (t) => {
  const f = fixture(t);
  const daily = await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(daily.getSegment('A', 'C').seats[0].StandardSeatStatus, 'X');
  assert.equal(daily.getSegment('A', 'B').seats[0].StandardSeatStatus, 'O');
  assert.equal(daily.getSegment('B', 'C').seats[0].DepartureTime, '10:11:00');
  assert.equal(daily.getSegment('C', 'B').seats[0].DepartureTime, '10:01:00');
  assert.equal(daily.getSegment('A', 'D').seats[0].DepartureTime, undefined);
  assert.equal(daily.getSegment('C', 'A').seats.find((s) => s.TrainNo === '1').DepartureTime, undefined);
  assert.deepEqual(daily.getSegment('D', 'A').seats, []);
  daily.getSegment('A', 'B').seats[0].DepartureTime = 'changed';
  assert.equal(daily.getSegment('A', 'B').seats[0].DepartureTime, '10:01:00');
  assert.equal(f.seats[0].DepartureTime, undefined);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every((url) => !url.includes('/to/')));
});

test('segments, repeated consumers and concurrent consumers share date caches; force refresh once per load', async (t) => {
  const f = fixture(t);
  const [a, b] = await Promise.all([fetchDailySeatData('2026-09-10', false, f.deps), fetchDailySeatData('2026-09-10', false, f.deps)]);
  for (let i = 0; i < 10; i++) { a.getSegment('A', 'B'); b.getSegment('B', 'C'); }
  assert.equal(f.calls.length, 2);
  const cached = await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(cached.fromCache, true);
  assert.equal(f.calls.length, 2);
  await fetchDailySeatData('2026-09-10', true, f.deps);
  assert.equal(f.calls.length, 4);
  await fetchDailySeatData('2026-09-11', false, f.deps);
  assert.equal(f.calls.length, 6);
});

test('expired data falls back on upstream failure, with original timestamp', async (t) => {
  const f = fixture(t);
  const first = await fetchDailySeatData('2026-09-10', false, f.deps);
  Object.assign(f.state, { expired: true, failSeats: true, failTimes: true });
  const stale = await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(stale.stale, true);
  assert.equal(stale.cachedAt, first.cachedAt);
  assert.equal(stale.getSegment('A', 'B').seats[0].DepartureTime, '10:01:00');
});

test('missing timetable preserves seats; missing seats fails; empty day returns no segments', async (t) => {
  const f = fixture(t);
  f.state.failTimes = true;
  const daily = await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(daily.getSegment('A', 'B').seats[0].DepartureTime, undefined);
  f.state.failSeats = true;
  await assert.rejects(fetchDailySeatData('2026-09-11', false, f.deps), /upstream failed/);
  Object.assign(f.state, { failSeats: false, empty: true });
  assert.deepEqual((await fetchDailySeatData('2026-09-12', false, f.deps)).getSegment('A', 'B').seats, []);
});

test('reads subsequent pages before caching the full day', async (t) => {
  const f = fixture(t);
  const original = f.deps.tdxGet;
  const pages = [];
  f.deps.tdxGet = async (url, params) => {
    if (!url.includes('AvailableSeatStatus')) return original(url);
    pages.push(params);
    return { AvailableSeats: params.$skip === '0'
      ? Array.from({ length: 10000 }, (_, i) => ({ ...f.seats[0], TrainNo: String(i) }))
      : [{ ...f.seats[1], TrainNo: 'last-page' }] };
  };
  const data = await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(data.getSegment('A', 'C').seats.length, 10000);
  assert.equal(data.getSegment('A', 'B').seats[0].TrainNo, 'last-page');
  assert.deepEqual(pages, [{ $top: '10000', $skip: '0' }, { $top: '10000', $skip: '10000' }]);
  await fetchDailySeatData('2026-09-10', false, f.deps);
  assert.equal(pages.length, 2);
});

test('pure seat lookup uses one OD seat request and one OD timetable request', async (t) => {
  const f = fixture(t);
  const result = await fetchSeatSegment('A', 'C', '2026-09-10', false, f.deps);

  // The fixture returns all rows regardless of the requested OD; the route
  // relies on TDX's OD endpoint to perform that filtering upstream.
  assert.equal(result.seats.length, f.seats.length);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[0].includes('/AvailableSeatStatus/Train/OD/A/to/C/TrainDate/2026-09-10'));
  assert.ok(f.calls[1].includes('/DailyTimetable/OD/A/to/C/2026-09-10'));
  assert.ok(f.calls.every((url) => !url.includes('TrainDate/2026-09-10?$top=10000')));

  const cached = await fetchSeatSegment('A', 'C', '2026-09-10', false, f.deps);
  assert.equal(cached.fromCache, true);
  assert.equal(f.calls.length, 2);
});

test('cache cleanup removes only files older than TTL plus grace period', async (t) => {
  const suffix = randomUUID();
  const directory = path.join(__dirname, '../data/cache');
  const oldFile = path.join(directory, `seats-cleanup-${suffix}.json`);
  const freshFile = path.join(directory, `seats-cleanup-fresh-${suffix}.json`);
  const unrelatedFile = path.join(directory, `free-seating-cleanup-${suffix}.json`);
  const now = Date.now();
  await writeFile(oldFile, JSON.stringify({ cachedAt: now - 1000, value: {} }));
  await writeFile(freshFile, JSON.stringify({ cachedAt: now - 100, value: {} }));
  await writeFile(unrelatedFile, JSON.stringify({ cachedAt: now - 1000, value: {} }));
  t.after(async () => { await Promise.all([oldFile, freshFile, unrelatedFile].map((file) => unlink(file).catch(() => {}))); });

  const removed = await cleanupExpiredCacheFiles([{ prefix: 'seats-cleanup-', maxAgeMs: 100 }], 100);
  assert.equal(removed, 1);
  await assert.rejects(() => require('node:fs/promises').access(oldFile));
  await require('node:fs/promises').access(freshFile);
  await require('node:fs/promises').access(unrelatedFile);
});

test('planner uses daily data and preserves same-train and cross-train plans', async (t) => {
  const f = fixture(t);
  const baseGet = f.deps.tdxGet;
  f.deps.tdxGet = async (url, params) => {
    const data = await baseGet(url, params);
    if (url.includes('AvailableSeatStatus')) {
      data.AvailableSeats.push({ ...f.seats[2], TrainNo: '3' });
    } else {
      const later = structuredClone(data[0]);
      later.DailyTrainInfo.TrainNo = '3';
      for (const stop of later.StopTimes) {
        stop.DepartureTime = stop.DepartureTime.replace('10:', '11:');
        stop.ArrivalTime = stop.ArrivalTime.replace('10:', '11:');
      }
      data.push(later);
    }
    return data;
  };
  const dailyModule = require('../dist/dailySeatData');
  const cacheModule = require('../dist/cache');
  const oldDaily = dailyModule.fetchDailySeatData;
  const oldCache = cacheModule.getOrFetchCached;
  dailyModule.fetchDailySeatData = (date, force) => fetchDailySeatData(date, force, f.deps);
  cacheModule.getOrFetchCached = async (ns, ...args) => ns === 'stations'
    ? { value: ['A', 'B', 'C'].map((StationID) => ({ StationID, StationName: { Zh_tw: StationID } })), cachedAt: Date.now(), fromCache: true, stale: false }
    : oldCache(ns, ...args);
  t.after(() => { dailyModule.fetchDailySeatData = oldDaily; cacheModule.getOrFetchCached = oldCache; });
  const invoke = async (name, body) => {
    const router = require(`../dist/routes/${name}`).default;
    const handler = router.stack.find((entry) => entry.route?.methods.post).route.stack[0].handle;
    let response;
    await handler({ body }, { json(value) { response = value; }, status(code) { assert.equal(code, 200); return this; } });
    return response.results[0];
  };
  const body = { originStationId: 'A', destinationStationId: 'C', dates: ['2026-09-10'],
    selectedIntermediateStationIds: ['B'], selectedSeatModes: ['reserved-standard'],
    minTransferMinutes: 15, maxTransferMinutes: 120,
    departureStart: '2026-09-10T09:00', departureEnd: '2026-09-10T12:00' };
  const result = await invoke('seatPlans', body);
  assert.equal(result.error, undefined);
  assert.ok(result.plans.some((p) => p.segments.map((s) => s.trainNo).join(',') === '1,1'));
  assert.ok(result.plans.some((p) => p.segments.map((s) => s.trainNo).join(',') === '1,3'));
  assert.equal(f.calls.length, 2);
});
