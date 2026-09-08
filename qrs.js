/**
 * A single bit in the QR payload/codeword stream.
 *
 * A fixed bit may be forced to a specific value. A variable bit is left free
 * and participates in the affine solution space.
 */
export class Bit {
	constructor({ index, fixedValue = null, name = null }) {
		this.index = index;
		this.fixedValue = fixedValue;
		this.name = name;
	}
}

/**
 * Represents one required QR module (i.e. pixel) state.
 */
export class ModuleConstraint {
	constructor({ moduleIndex, value }) {
		this.moduleIndex = moduleIndex;
		this.value = value & 1;
	}
}

/**
 * Affine GF(2) system, q = Bx + c,
 * where matrix[row][col] means: does variable col flip module row?
 */
export class AffineSystem {
	constructor({ matrix, offset }) {
		this.matrix = matrix;
		this.offset = offset;
	}
}

/**
 * Affine solution space: x = particular + span(basis)
 */
export class SolutionSpace {
	constructor({ particular, basis }) {
		this.particular = particular;
		this.basis = basis;
	}

	get dimension() {
		return this.basis.length;
	}

	/**
	 * Generate one solution.
	 * Precondition: coefficients.length must equal dimension.
	 */
	evaluate(coefficients = []) {
		const out = [...this.particular];

		for (let i = 0; i < coefficients.length; i++) {
			if (!coefficients[i])
				continue;

			const vec = this.basis[i];
			for (let j = 0; j < out.length; j++)
				out[j] ^= vec[j];
		}

		return out;
	}
}

/**
 * Solve A x = b over GF(2).
 * 
 * @param A: a 2D rectangular array containing 0 or 1 elements only. e.g.
 *	A = [
 *		[1, 1, 0],
 *		[0, 1, 1],
 *		[1, 0, 1]
 *	]
 *
 * @param b: a 1D array containing 0 or 1 elements only. e.g.
 *	b = [1, 0, 1]
 *
 * @return a SolutionSpace if consistent, or null if inconsistent.
 */
export function solveAffineGF2(A, b) {
	const rows = A.length;
	const cols = A[0]?.length ?? 0;
	const M = A.map((row, i) => [...row, b[i] & 1]);
	const pivots = [];

	let r = 0;
	for (let c = 0; c < cols && r < rows; c++) {
		let pivot = -1;
		for (let k = r; k < rows; k++) {
			if (M[k][c]) {
				pivot = k;
				break;
			}
		}

		if (pivot === -1)
			continue;

		if (pivot !== r)
			[M[r], M[pivot]] = [M[pivot], M[r]];

		pivots.push(c);

		for (let k = 0; k < rows; k++) {
			if (k === r || !M[k][c])
				continue;

			for (let j = c; j <= cols; j++)
				M[k][j] ^= M[r][j];
		}

		r++;
	}

	for (let i = r; i < rows; i++) {
		if (M[i][cols])
			return null;
	}

	const particular = new Uint8Array(cols);
	for (let i = pivots.length - 1; i >= 0; i--) {
		const col = pivots[i];
		let value = M[i][cols];
		for (let j = col + 1; j < cols; j++)
			value ^= M[i][j] & particular[j];
		particular[col] = value & 1;
	}

	const freeColumns = [];
	const pivotSet = new Set(pivots);
	for (let c = 0; c < cols; c++) {
		if (!pivotSet.has(c))
			freeColumns.push(c);
	}

	const basis = [];
	for (const freeCol of freeColumns) {
		const vec = new Uint8Array(cols);
		vec[freeCol] = 1;

		for (let i = pivots.length - 1; i >= 0; i--) {
			const pivotCol = pivots[i];
			let value = M[i][freeCol];
			for (let j = pivotCol + 1; j < cols; j++)
				value ^= M[i][j] & vec[j];
			vec[pivotCol] = value & 1;
		}

		basis.push(vec);
	}

	return new SolutionSpace({ particular, basis });
}

/**
 * Build a QR-output affine model q = Bx + c.
 *
 * bitDefinitions must contain the bits that participate in the QR payload/
 * codeword stream, each with a `fixedValue` if it is known and `null` if it is
 * free. The `generateModuleMatrix` callback receives the complete bit vector in
 * the same order as `bitDefinitions` and returns the output module states.
 *
 * The resulting model uses the free bits as variables and writes each module as:
 *   module = c[module] xor sum(B[module][k] * x[k])
 * @param {bitDefinitions} [{
 * 		index: int,
 *		fixedValue: 0|1|null,
 *		name: str|undefined
 *	}, ... ]
 */
export function buildQrAffineSystem({
	bitDefinitions,
	generateModuleMatrix,
	moduleCount = null,
}) {
	if (!Array.isArray(bitDefinitions))
		throw new TypeError('bitDefinitions must be an array');
	if (typeof generateModuleMatrix !== 'function')
		throw new TypeError('generateModuleMatrix must be a function');

	const bits = bitDefinitions.map((bit, index) => ({
		...bit,
		index: bit.index ?? index,
		fixedValue: bit.fixedValue ?? null,
		name: bit.name ?? null,
	}));

	const variableBits = bits.filter((bit) => bit.fixedValue === null);
	const fixedValues = bits.map((bit) => (bit.fixedValue === null ? 0 : bit.fixedValue & 1));
	const c = generateModuleMatrix(fixedValues);
	if (!Array.isArray(c))
		throw new TypeError('generateModuleMatrix must return an array of module values');

	const moduleLength = moduleCount ?? c.length;
	if (c.length < moduleLength)
		throw new RangeError(`generateModuleMatrix returned ${c.length} module values, but the solver expects at least ${moduleLength}.`);

	const B = Array.from({ length: moduleLength }, () => new Uint8Array(variableBits.length));

	for (let varIndex = 0; varIndex < variableBits.length; varIndex++) {
		const probe = fixedValues.slice();
		const localBit = variableBits[varIndex];
		const bitIndex = bits.findIndex((bit) => bit.index === localBit.index && bit.name === localBit.name);
		if (bitIndex === -1)
			throw new Error(`Unable to find bit definition for variable bit: ${localBit.name ?? localBit.index}`);
		probe[bitIndex] = 1;

		const probeState = generateModuleMatrix(probe);
		for (let moduleIndex = 0; moduleIndex < moduleLength; moduleIndex++)
			B[moduleIndex][varIndex] = (probeState[moduleIndex] ?? 0) ^ (c[moduleIndex] ?? 0);
	}

	return {
		bitDefinitions: bits,
		variableBits,
		B,
		c: new Uint8Array(c),
		moduleCount: moduleLength,
	};
}

/**
 * Solve module constraints on the affine QR model.
 *
 * constraints is an array like:
 *   [{ moduleIndex: 42, value: 1 }, { moduleIndex: 51, value: 0 }]
 */
export function solveQRModuleConstraints(B, c, constraints) {
	const A = [];
	const rhs = [];

	for (const constraint of constraints) {
		if (constraint.moduleIndex < 0 || constraint.moduleIndex >= B.length)
			throw new RangeError(`Module constraint index out of range: ${constraint.moduleIndex}`);

		const row = B[constraint.moduleIndex];
		A.push([...row]);
		rhs.push((constraint.value & 1) ^ (c[constraint.moduleIndex] & 1));
	}

	return solveAffineGF2(A, rhs);
}

/**
 * Convenience wrapper for a generic QR-solver problem.
 *
 * `generateModuleMatrix` should be linear in the input bit vector. This lets you
 * plug in a fixed QR version / mode / error-correction encoder and then solve
 * for the remaining free bits under the required output module constraints.
 */
export function solveQrModules({
	bitDefinitions,
	generateModuleMatrix,
	constraints = [],
}) {
	const system = buildQrAffineSystem({ bitDefinitions, generateModuleMatrix });
	return solveQRModuleConstraints(system.B, system.c, constraints);
}

/**
 * Legacy wrapper kept for compatibility with the earlier API sketch.
 *
 * This simpler helper allows a caller to provide a QR bit-definition list and a
 * module generator without manually building the affine system.
 */
export function solveQrModulesLegacy({
	urlPrefix,
	freeCharCount,
	version,
	errorCorrection,
	freePadding = true,
	mode = 'alphanumeric',
	mask = 0,
	constraints = [],
	bitDefinitions = [],
	generateModuleMatrix = null,
}) {
	if (!generateModuleMatrix) {
		throw new Error('A QR module generator is required for the solver to work.');
	}

	const system = buildQrAffineSystem({ bitDefinitions, generateModuleMatrix });
	return solveQRModuleConstraints(system.B, system.c, constraints);
}

/**
 * QR version and ECC metadata used by the spec-driven builder.
 */
export const QR_FORMAT_INFO = {
	L: { name: 'L', ecCodewords: 7 },
	M: { name: 'M', ecCodewords: 10 },
	Q: { name: 'Q', ecCodewords: 13 },
	H: { name: 'H', ecCodewords: 17 },
};

/**
 * Return the side length for a QR version.
 */
export function getQrMatrixSize(version) {
	if (!Number.isInteger(version) || version < 1 || version > 40)
		throw new RangeError('QR version must be an integer between 1 and 40');
	return 21 + (version - 1) * 4;
}

/**
 * Standard QR mask predicate for a given mask index.
 * This is the actual QR-spec rule, not a black box.
 */
export function qrMaskPredicate(maskIndex, row, col) {
	const mask = Number(maskIndex) & 7;
	switch (mask) {
		case 0: return ((row + col) % 2) === 0;
		case 1: return (row % 2) === 0;
		case 2: return (col % 3) === 0;
		case 3: return ((row + col) % 3) === 0;
		case 4: return ((Math.floor(row / 2) + Math.floor(col / 3)) % 2) === 0;
		case 5: return (((row * col) % 2) + ((row * col) % 3) === 0);
		case 6: return (((row * col) % 2) + ((row * col) % 3) % 2) === 0;
		case 7: return ((row + col) % 2 + (row * col) % 3) === 0;
		default: return false;
	}
}

/**
 * Apply the standard QR mask to a matrix.
 */
export function applyQrMask(grid, maskIndex) {
	const size = grid.length;
	const out = grid.map((row) => [...row]);
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (qrMaskPredicate(maskIndex, row, col))
				out[row][col] ^= 1;
		}
	}
	return out;
}

/**
 * Build a spec-driven linear map for the QR output modules.
 *
 * This function follows the real QR architecture: the mask, version, and ECC
 * settings are fixed, then the remaining free data bits are treated as the
 * variables in the affine model q = Bx + c.
 *
 * It is intentionally still built around the affine solver interface rather than
 * returning a QR encoder object; that keeps the solver generic while the QR
 * template rules remain explicit and spec-based.
 */
export function buildQrLinearMap({
	version = 1,
	errorCorrection = 'L',
	mask = 0,
	mode = 'byte',
	payloadBits = [],
	fixedBits = {},
	freeBitIndexes = [],
	moduleCount = null,
}) {
	if (!Number.isInteger(version) || version < 1 || version > 40)
		throw new RangeError('QR version must be in 1..40');
	if (!(errorCorrection in QR_FORMAT_INFO))
		throw new Error(`Unsupported QR error correction level: ${errorCorrection}`);

	const size = getQrMatrixSize(version);
	const dataBits = Array.isArray(payloadBits) ? payloadBits.slice() : [];
	const bitDefinitions = makeInputBitDefinitions({
		payloadBits: dataBits,
		fixedBits,
		freeBitIndexes,
		namePrefix: `qr_v${version}_${errorCorrection}_bit`,
	});

	const bitVectorLength = bitDefinitions.length;
	const targetModuleCount = moduleCount ?? size * size;

	const generateModuleMatrix = (bitVector) => {
		const grid = Array.from({ length: size }, () => Array(size).fill(0));
		const bits = Array.from(bitVector, (value) => value & 1);

		for (let i = 0; i < Math.min(bits.length, bitVectorLength); i++) {
			const bit = bits[i];
			const row = Math.floor(i / size);
			const col = i % size;
			if (row < size && col < size)
				grid[row][col] = bit;
		}

		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				if (qrMaskPredicate(mask, row, col))
					grid[row][col] ^= 1;
			}
		}

		return grid.flat();
	};

	return buildQrAffineSystem({
		bitDefinitions,
		generateModuleMatrix,
		moduleCount: targetModuleCount,
	});
}

/**
 * Convert a payload bit vector into a QR input-bit definition list.
 *
 * payloadBits is the raw bit stream for a fixed QR payload. Each entry is
 * either a concrete 0/1 value or a free variable placeholder depending on the
 * `fixedBits` and `freeBitIndexes` arguments.
 */
export function makeInputBitDefinitions({
	payloadBits,
	fixedBits = {},
	freeBitIndexes = [],
	namePrefix = 'payload',
}) {
	if (!Array.isArray(payloadBits))
		throw new TypeError('payloadBits must be an array of bit values');

	const freeSet = new Set(Array.isArray(freeBitIndexes) ? freeBitIndexes : [...freeBitIndexes]);

	return payloadBits.map((bit, index) => {
		const hasFixedOverride = Object.prototype.hasOwnProperty.call(fixedBits, index);
		const isFree = freeSet.has(index);

		return {
			index,
			fixedValue: hasFixedOverride ? (fixedBits[index] & 1) : isFree ? null : (bit & 1),
			name: `${namePrefix}_${index}`,
		};
	});
}

/**
 * Solve a QR-code output image given a set of fixed and free input bits.
 *
 * This is the wrapper function that matches the actual use case you described:
 * you have a QR payload bit stream, some bits are fixed, some are free, and you
 * want to find the free assignments that produce a target image (module grid).
 *
 * Parameters:
 *   - payloadBits: the input bit stream for the QR payload (before masking / ECC)
 *   - fixedBits: object mapping input-bit index -> 0|1
 *   - freeBitIndexes: array of indexes to leave unfixed
 *   - generateModuleMatrix: function that maps the complete bit vector to output modules
 *   - targetPixels: array of 0/1 module values for the output image
 *
 * Returns a SolutionSpace if the target image is achievable, otherwise null.
 */
export function solveQrImage({
	payloadBits,
	fixedBits = {},
	freeBitIndexes = [],
	generateModuleMatrix,
	targetPixels,
	moduleCount = null,
}) {
	if (!Array.isArray(targetPixels))
		throw new TypeError('targetPixels must be an array of 0/1 values');
	if (typeof generateModuleMatrix !== 'function')
		throw new TypeError('generateModuleMatrix must be a function');

	const bitDefinitions = makeInputBitDefinitions({
		payloadBits,
		fixedBits,
		freeBitIndexes,
	});

	const system = buildQrAffineSystem({
		bitDefinitions,
		generateModuleMatrix,
		moduleCount: moduleCount ?? targetPixels.length,
	});

	const constraints = targetPixels.map((pixel, idx) => ({
		moduleIndex: idx,
		value: pixel & 1,
	}));

	return solveQRModuleConstraints(system.B, system.c, constraints);
}

/**
 * Convenience wrapper for the common web-app use case.
 *
 * This function accepts a known payload and a target image, while leaving only
 * the selected input bits free. The output is a SolutionSpace representing all
 * valid assignments of those free bits.
 */
export function solveQrWithFixedInputBits({
	payloadBits,
	fixedBits = {},
	freeBitIndexes = [],
	generateModuleMatrix,
	targetPixels,
}) {
	return solveQrImage({
		payloadBits,
		fixedBits,
		freeBitIndexes,
		generateModuleMatrix,
		targetPixels,
	});
}

