import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQrAffineSystem,
  solveAffineGF2,
  solveQRModuleConstraints,
} from './qrs.js';

test('solveAffineGF2 solves a simple GF(2) system', () => {
  const A = [
    [1, 1],
    [0, 1],
  ];
  const b = [1, 1];

  const solution = solveAffineGF2(A, b);
  assert.ok(solution);
  assert.equal(solution.dimension, 0);
  assert.deepEqual(Array.from(solution.evaluate([])), [0, 1]);
});

test('buildQrAffineSystem captures linear dependence on variable bits', () => {
  const bitDefinitions = [
    { index: 0, fixedValue: null, name: 'x' },
    { index: 1, fixedValue: 1, name: 'fixed' },
    { index: 2, fixedValue: null, name: 'y' },
  ];

  const generateModuleMatrix = (bits) => [
    bits[0] ^ bits[2],
    bits[0] ^ bits[1] ^ bits[2],
    bits[1],
  ];

  const system = buildQrAffineSystem({ bitDefinitions, generateModuleMatrix });

  assert.equal(system.variableBits.length, 2);
  assert.deepEqual(Array.from(system.c), [0, 1, 1]);
  assert.deepEqual(Array.from(system.B[0]), [1, 1]);
  assert.deepEqual(Array.from(system.B[1]), [1, 1]);
  assert.deepEqual(Array.from(system.B[2]), [0, 0]);

  const constrained = solveQRModuleConstraints(system.B, system.c, [
    { moduleIndex: 0, value: 1 },
    { moduleIndex: 2, value: 1 },
  ]);

  assert.ok(constrained);
  assert.equal(constrained.dimension, 1);
  assert.deepEqual(Array.from(constrained.evaluate([0])), [1, 0]);
  assert.deepEqual(Array.from(constrained.evaluate([1])), [0, 1]);
});
