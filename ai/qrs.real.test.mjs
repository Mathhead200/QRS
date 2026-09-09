import test from 'node:test';
import assert from 'node:assert/strict';

import {
  solveQrImage,
  makeInputBitDefinitions,
  buildQrMessagePlan,
  encodeQrDataBits,
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

test('encodeQrDataBits includes QR mode and character count information', () => {
  const bits = encodeQrDataBits('A', { version: 1, mode: 'byte' });

  assert.deepEqual(bits.slice(0, 4), [0, 1, 0, 0]);
  assert.deepEqual(bits.slice(4, 12), [0, 0, 0, 0, 0, 0, 0, 1]);
});

test('buildQrMessagePlan keeps the symbolic input stream separate from the final QR output layout', () => {
  const size = 1;
  const shortPlan = buildQrMessagePlan({
    prefixText: 'A',
    version: size,
    errorCorrection: 'L',
    paddingMode: 'strict',
  });
  const longPlan = buildQrMessagePlan({
    prefixText: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    version: size,
    errorCorrection: 'L',
    paddingMode: 'strict',
  });

  const capacity = 152;
  assert.equal(shortPlan.outputPayloadBits.length, capacity);
  assert.equal(longPlan.outputPayloadBits.length, capacity);
  assert.ok(shortPlan.payloadBits.length < shortPlan.outputPayloadBits.length);
  assert.ok(shortPlan.freeBitIndexes.length >= 0);
  assert.ok(shortPlan.bitNames.some((name) => name && name.startsWith('ecc_reserved_')));
  assert.ok(shortPlan.bitNames.some((name) => name && name.startsWith('padding_')));

  const finalByte = shortPlan.outputPayloadBits.slice(-8);
  assert.deepEqual(finalByte, [1, 1, 1, 0, 1, 1, 0, 0]);
});

test('buildQrMessagePlan supports prefix, wildcard suffix, and three terminator/padding modes', () => {
  const loosePlan = buildQrMessagePlan({
    prefixText: 'abc',
    wildcardLength: 2,
    version: 1,
    errorCorrection: 'L',
    paddingMode: 'loose',
  });

  assert.ok(Array.isArray(loosePlan.payloadBits));
  assert.ok(loosePlan.payloadBits.length > 24);
  assert.ok(loosePlan.freeBitIndexes.some((index) => index >= loosePlan.prefixBits.length));
  assert.ok(loosePlan.freeBitIndexes.length >= 16);
  assert.equal(loosePlan.bitNames[0], 'mode_0');
  assert.equal(loosePlan.bitNames[4], 'char_count_0');

  const padFreePlan = buildQrMessagePlan({
    prefixText: 'abc',
    wildcardLength: 2,
    version: 1,
    errorCorrection: 'L',
    paddingMode: 'pad-free',
  });

  assert.ok(padFreePlan.freeBitIndexes.length >= 16);
  assert.ok(Object.prototype.hasOwnProperty.call(padFreePlan.fixedBits, 0));
  assert.ok(Object.prototype.hasOwnProperty.call(padFreePlan.fixedBits, 12));
  assert.ok(padFreePlan.bitNames.some((name) => name && name.startsWith('terminator_')));

  const strictPlan = buildQrMessagePlan({
    prefixText: 'abc',
    wildcardLength: 2,
    version: 1,
    errorCorrection: 'L',
    paddingMode: 'strict',
  });

  assert.ok(strictPlan.freeBitIndexes.length >= 16);
  assert.ok(Object.prototype.hasOwnProperty.call(strictPlan.fixedBits, 0));
  assert.ok(Object.prototype.hasOwnProperty.call(strictPlan.fixedBits, 12));
  assert.ok(strictPlan.bitNames.some((name) => name && name.startsWith('terminator_')));
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
