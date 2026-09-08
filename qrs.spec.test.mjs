import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQrLinearMap, qrMaskPredicate, getQrMatrixSize } from './qrs.js';

test('QR size and valid masks are exposed', () => {
  assert.equal(getQrMatrixSize(1), 21);
  assert.equal(getQrMatrixSize(2), 25);
  assert.equal(qrMaskPredicate(0, 0, 0), true);
  assert.equal(qrMaskPredicate(1, 0, 0), true);
});

test('buildQrLinearMap returns an affine model for a fixed QR configuration', () => {
  const payloadBits = [0, 1, 1, 0, 1, 0, 0, 1];
  const fixedBits = { 0: 1 };
  const freeBitIndexes = [1, 2, 3, 4, 5, 6, 7];

  const system = buildQrLinearMap({
    version: 1,
    errorCorrection: 'L',
    mask: 0,
    payloadBits,
    fixedBits,
    freeBitIndexes,
  });

  assert.ok(system);
  assert.ok(Array.isArray(system.B));
  assert.ok(Array.isArray(system.c));
  assert.equal(system.variableBits.length, 7);
  assert.equal(system.B.length, 441);
});
