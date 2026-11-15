import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistanceKm,
  KNUROW_CENTER,
  verifyKnurowLocation,
} from './geo';

test('centrum Knurowa ma dystans 0 km i jest zweryfikowane', () => {
  const res = verifyKnurowLocation(KNUROW_CENTER.lat, KNUROW_CENTER.lng);
  assert.equal(res.distanceKm, 0);
  assert.equal(res.isLocalVerified, true);
});

test('Szczygłowice i Pilchowice mieszczą się w promieniu 10 km', () => {
  const szczyglowice = verifyKnurowLocation(50.1947, 18.6368);
  assert.equal(szczyglowice.isLocalVerified, true);
  assert.ok(szczyglowice.distanceKm < 5);

  const pilchowice = verifyKnurowLocation(50.2141, 18.5675);
  assert.equal(pilchowice.isLocalVerified, true);
  assert.ok(pilchowice.distanceKm <= 10);
});

test('Katowice i Warszawa przekraczają próg 10 km i są blokowane', () => {
  const katowice = verifyKnurowLocation(50.2649, 19.0238);
  assert.equal(katowice.isLocalVerified, false);
  assert.ok(katowice.distanceKm > 20);

  const warszawaDist = calculateHaversineDistanceKm(
    52.2297,
    21.0122,
    KNUROW_CENTER.lat,
    KNUROW_CENTER.lng
  );
  assert.ok(warszawaDist > 250);
});
