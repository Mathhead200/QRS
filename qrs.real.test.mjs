import test from 'node:test';
import assert from 'node:assert/strict';

import {
  solveQrImage,
  makeInputBitDefinitions,
} from './qrs.js';

test('makeInputBitDefinitions respects fixed and free bits', () => {
  const bits = [1, 0, 1, 0, 1];
  const defs = makeInputBitDefinitions({
    payloadBits: bits,
    fixedBits: { 1: 1 },
    freeBitIndexes: [0, 3],
  });

  assert.deepEqual(defs.map((bit) => bit.fixedValue), [null, 1, 1, null, 1]);
  assert.equal(defs[0].name, 'payload_0');
  assert.equal(defs[3].name, 'payload_3');
});

test('solveQrImage solves a simple target output image', () => {
  const payloadBits = [0, 1, 1, 0];
  const fixedBits = { 1: 1 };
  const freeBitIndexes = [0, 2, 3];

  const generateModuleMatrix = (bits) => [
    bits[0] ^ bits[2],
    bits[2] ^ bits[3],
    bits[0] ^ bits[1] ^ bits[3],
  ];

  const targetPixels = [0, 0, 1];
  const solution = solveQrImage({
    payloadBits,
    fixedBits,
    freeBitIndexes,
    generateModuleMatrix,
    targetPixels,
  });

  assert.ok(solution);
  assert.equal(solution.dimension, 0);
  assert.deepEqual(Array.from(solution.evaluate([])), [1, 1, 1, 0]);
});
