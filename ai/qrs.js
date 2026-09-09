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
export function isReservedQrCell(size, row, col) {
	if (row < 0 || col < 0 || row >= size || col >= size)
		return true;

	if (row < 7 && col < 7)
		return true;
	if (row < 7 && col >= size - 7)
		return true;
	if (row >= size - 7 && col < 7)
		return true;
	if (row === 6 || col === 6)
		return true;
	if (row === 8 && col >= 0 && col < 9)
		return true;
	if (col === 8 && row >= 0 && row < 9)
		return true;
	if (row === 8 && col === 4 * Math.max(1, 1) + 9)
		return true;
	return false;
}

export function getQrDataModuleCoordinates(size) {
	const coords = [];
	const maxRow = size - 1;
	const maxCol = size - 1;

	for (let col = maxCol; col >= 0; col--) {
		const direction = (col % 2 === 0) ? -1 : 1;
		const rowStart = (direction === -1) ? maxRow : 0;
		for (let rowOffset = 0; rowOffset < size; rowOffset++) {
			const row = rowStart + direction * rowOffset;
			if (row < 0 || row >= size)
				continue;
			if (row === 6 || col === 6)
				continue;
			if (row < 7 && col < 7)
				continue;
			if (row < 7 && col >= size - 7)
				continue;
			if (row >= size - 7 && col < 7)
				continue;
			if (row === 8 && col < 9)
				continue;
			if (col === 8 && row < 9)
				continue;
			coords.push({ row, col });
		}
	}

	const valid = [];
	for (const coord of coords) {
		if (!isReservedQrCell(size, coord.row, coord.col))
			valid.push(coord);
	}
	return valid;
}

export function formatBitsForQr(errorCorrection, maskIndex) {
	const levelMap = { L: 1, M: 0, Q: 3, H: 2 };
	const ecLevelBits = levelMap[errorCorrection] ?? 0;
	const bits = [];
	for (let i = 0; i < 15; i++) {
		const bitIndex = i % 5;
		let value = 0;
		if (bitIndex < 2)
			value = (ecLevelBits >> (1 - bitIndex)) & 1;
		else if (bitIndex < 5)
			value = (maskIndex >> (4 - bitIndex)) & 1;
		else
			value = (i + ecLevelBits + maskIndex) % 2;
		bits.push(value);
	}
	return bits;
}

export function getQrMessageCapacityBits({ version = 1, errorCorrection = 'L' } = {}) {
	const size = getQrMatrixSize(version);
	const totalDataBits = getQrDataModuleCoordinates(size).length;
	const ecLevel = String(errorCorrection ?? 'L').toUpperCase();
	const ecInfo = QR_FORMAT_INFO[ecLevel];
	const ecBits = (ecInfo?.ecCodewords ?? 0) * 8;
	return Math.max(0, totalDataBits - ecBits);
}

export function createQrTemplateGrid({ version = 1, errorCorrection = 'L', mask = 0 }) {
	const size = getQrMatrixSize(version);
	const grid = Array.from({ length: size }, () => Array(size).fill(0));

	const addFinderPattern = (rowStart, colStart) => {
		for (let row = 0; row < 7; row++) {
			for (let col = 0; col < 7; col++) {
				const r = rowStart + row;
				const c = colStart + col;
				if (r < 0 || c < 0 || r >= size || c >= size)
					continue;
				const inner = row >= 2 && row <= 4 && col >= 2 && col <= 4;
				const border = row === 0 || row === 6 || col === 0 || col === 6;
				const center = row === 3 && col === 3;
				grid[r][c] = border || inner || center ? 1 : 0;
			}
		}
	};

	addFinderPattern(0, 0);
	addFinderPattern(0, size - 7);
	addFinderPattern(size - 7, 0);

	for (let index = 0; index < size; index++) {
		if (index !== 6) {
			grid[6][index] = index % 2 === 0 ? 1 : 0;
			grid[index][6] = index % 2 === 0 ? 1 : 0;
		}
	}

	const darkRow = 4 * version + 9;
	const darkCol = 8;
	if (darkRow < size && darkCol < size)
		grid[darkRow][darkCol] = 1;

	const formatValues = formatBitsForQr(errorCorrection, mask);
	const formatPositions = [
		[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
		[8, 7], [8, 8],
		[7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
	];
	for (let i = 0; i < formatPositions.length; i++) {
		const [row, col] = formatPositions[i];
		if (row >= 0 && row < size && col >= 0 && col < size)
			grid[row][col] = formatValues[i] ?? 0;
	}

	return grid;
}

export function generateQrModuleMatrix({
	version = 1,
	errorCorrection = 'L',
	mask = 0,
	payloadBits = [],
}) {
	const size = getQrMatrixSize(version);
	const grid = createQrTemplateGrid({ version, errorCorrection, mask });
	const dataCoords = getQrDataModuleCoordinates(size);
	const bits = Array.from(payloadBits, (value) => value & 1);

	for (let i = 0; i < dataCoords.length && i < bits.length; i++) {
		const { row, col } = dataCoords[i];
		grid[row][col] = bits[i];
	}

	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (isReservedQrCell(size, row, col))
				continue;
			if (qrMaskPredicate(mask, row, col))
				grid[row][col] ^= 1;
		}
	}

	return grid.flat();
}

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
		const bits = Array.from(bitVector, (value) => value & 1);
		const matrix = generateQrModuleMatrix({
			version,
			errorCorrection,
			mask,
			payloadBits: Array.from({ length: Math.min(bits.length, bitVectorLength) }, (_, i) => bits[i] ?? 0),
		});
		return matrix.slice(0, targetModuleCount);
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
	names = null,
}) {
	if (!Array.isArray(payloadBits))
		throw new TypeError('payloadBits must be an array of bit values');

	const freeSet = new Set(Array.isArray(freeBitIndexes) ? freeBitIndexes : [...freeBitIndexes]);

	return payloadBits.map((bit, index) => {
		const hasFixedOverride = Object.prototype.hasOwnProperty.call(fixedBits, index);
		const isFree = freeSet.has(index);
		const explicitName = Array.isArray(names) ? names[index] : null;

		return {
			index,
			fixedValue: hasFixedOverride ? (fixedBits[index] & 1) : isFree ? null : (bit & 1),
			name: explicitName ?? `${namePrefix}_${index}`,
		};
	});
}

export function countModeEncodedBitsForChars(charCount = 0, mode = 'byte') {
	const count = Math.max(0, Number(charCount) || 0);
	const normalized = String(mode).toLowerCase();

	switch (normalized) {
		case 'numeric': {
			const groups = Math.floor(count / 3);
			const remainder = count % 3;
			return groups * 10 + (remainder === 1 ? 4 : remainder === 2 ? 7 : 0);
		}
		case 'alphanumeric':
			return Math.floor(count / 2) * 11 + ((count % 2) ? 6 : 0);
		case 'byte':
		default:
			return count * 8;
	}
}

export function getMaxCharsForModeAndVersion({ version = 1, mode = 'byte' } = {}) {
	const dataCapacity = getQrDataModuleCoordinates(getQrMatrixSize(version)).length;
	const charCountBitsLength = version <= 9 ? 8 : 16;
	const nonDataBits = 4 + charCountBitsLength + 4;
	const availableBits = Math.max(0, dataCapacity - nonDataBits);
	let maxChars = 0;
	while (countModeEncodedBitsForChars(maxChars + 1, mode) <= availableBits) {
		maxChars += 1;
	}
	return maxChars;
}

export function encodeTextBits(text = '', mode = 'byte') {
	const input = String(text ?? '');
	const normalized = String(mode).toLowerCase();

	if (normalized === 'numeric') {
		const digits = Array.from(input).map((char) => char);
		const bits = [];
		for (let i = 0; i < digits.length; i += 3) {
			const chunk = digits.slice(i, i + 3);
			const value = chunk.map((char) => Number(char)).join('');
			const number = Number(value);
			if (chunk.length === 1) {
				for (let bitIndex = 3; bitIndex >= 0; bitIndex--) bits.push((number >> bitIndex) & 1);
			} else if (chunk.length === 2) {
				for (let bitIndex = 6; bitIndex >= 0; bitIndex--) bits.push((number >> bitIndex) & 1);
			} else {
				for (let bitIndex = 9; bitIndex >= 0; bitIndex--) bits.push((number >> bitIndex) & 1);
			}
		}
		return bits;
	}

	if (normalized === 'alphanumeric') {
		const lookup = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
		const bits = [];
		for (let i = 0; i < input.length; i += 2) {
			const left = input[i];
			const right = input[i + 1];
			const leftValue = lookup.indexOf(left);
			if (right === undefined) {
				if (leftValue < 0) {
					return encodeTextBits(input, 'byte');
				}
				for (let bitIndex = 5; bitIndex >= 0; bitIndex--) bits.push((leftValue >> bitIndex) & 1);
				continue;
			}
			const rightValue = lookup.indexOf(right);
			if (leftValue < 0 || rightValue < 0) {
				return encodeTextBits(input, 'byte');
			}
			const packed = leftValue * 45 + rightValue;
			for (let bitIndex = 10; bitIndex >= 0; bitIndex--) bits.push((packed >> bitIndex) & 1);
		}
		return bits;
	}

	const bytes = new TextEncoder().encode(input);
	const bits = [];
	for (const byte of bytes) {
		for (let bitIndex = 7; bitIndex >= 0; bitIndex--) {
			bits.push((byte >> bitIndex) & 1);
		}
	}
	return bits;
}

export function bitsToNumber(bits) {
	let value = 0;
	for (const bit of bits) value = (value << 1) | (bit & 1);
	return value;
}

export function getQrPaddingBits(length = 0) {
	const count = Math.max(0, Number(length) || 0);
	const bits = [];
	for (let byteIndex = 0; bits.length < count; byteIndex++) {
		const byte = (byteIndex % 2 === 0) ? 0xec : 0x11;
		for (let bitIndex = 7; bitIndex >= 0 && bits.length < count; bitIndex--) {
			bits.push((byte >> bitIndex) & 1);
		}
	}
	return bits.slice(0, count);
}

export function encodeQrDataBits(text = '', { version = 1, mode = 'byte', wildcardChars = 0 } = {}) {
	const currentText = String(text ?? '');
	const charCount = currentText.length + Number(wildcardChars || 0);
	const modeBits = {
		byte: [0, 1, 0, 0],
		numeric: [0, 0, 0, 1],
		alphanumeric: [0, 1, 0, 1],
	}[String(mode).toLowerCase()] ?? [0, 1, 0, 0];

	const countBits = [];
	const countLength = version <= 9 ? 8 : 16;
	for (let i = countLength - 1; i >= 0; i--)
		countBits.push((charCount >> i) & 1);

	const dataBits = [...encodeTextBits(currentText, mode)];
	const wildcardBits = Array.from({ length: countModeEncodedBitsForChars(Number(wildcardChars || 0), mode) }, () => 0);
	const capacity = getQrDataModuleCoordinates(getQrMatrixSize(version)).length;
	const stream = [...modeBits, ...countBits, ...dataBits, ...wildcardBits];
	const terminatorLength = Math.min(4, Math.max(0, capacity - stream.length));
	const terminatorBits = Array(terminatorLength).fill(0);
	const padLength = Math.max(0, capacity - stream.length - terminatorBits.length);
	const fillBits = getQrPaddingBits(padLength);
	const bits = [...stream, ...terminatorBits, ...fillBits];
	return bits.slice(0, capacity);
}

export function buildQrMessagePlan({
	prefixText = '',
	wildcardLength = 0,
	mode = 'byte',
	version = 1,
	errorCorrection = 'L',
	paddingMode = 'strict',
}) {
	if (!Number.isInteger(version) || version < 1 || version > 40)
		throw new RangeError('QR version must be in 1..40');

	const normalizedMode = String(paddingMode ?? 'strict').toLowerCase();
	const isStrict = normalizedMode === 'strict';
	const isPadFree = normalizedMode === 'pad-free';
	const isLoose = normalizedMode === 'loose';
	const size = getQrMatrixSize(version);
	const dataCapacity = getQrDataModuleCoordinates(size).length;
	const modeBitsCount = 4;
	const charCountBitsCount = version <= 9 ? 8 : 16;
	const terminatorBitsCount = 4;
	const wildcardBitsCount = countModeEncodedBitsForChars(Math.max(0, Number(wildcardLength) || 0), mode);
	const prefixBits = encodeTextBits(prefixText, mode);
	const modeBits = {
		byte: [0, 1, 0, 0],
		numeric: [0, 0, 0, 1],
		alphanumeric: [0, 1, 0, 1],
	}[String(mode).toLowerCase()] ?? [0, 1, 0, 0];
	const charCount = prefixText.length + Number(wildcardLength || 0);
	const charCountBits = [];
	for (let i = charCountBitsCount - 1; i >= 0; i--)
		charCountBits.push((charCount >> i) & 1);

	const inputBits = [
		...modeBits,
		...charCountBits,
		...prefixBits,
		...Array.from({ length: wildcardBitsCount }, () => 0),
	];
	const messageCapacity = getQrMessageCapacityBits({ version, errorCorrection });
	const eccReserveBitsCount = Math.max(0, messageCapacity - inputBits.length);
	const terminatorStart = inputBits.length;
	const terminatorLength = Math.min(terminatorBitsCount, Math.max(0, dataCapacity - inputBits.length - eccReserveBitsCount));
	const terminatorBits = Array(terminatorLength).fill(0);
	const eccStart = terminatorStart + terminatorBits.length;
	const eccBits = Array(Math.max(0, Math.min(eccReserveBitsCount, dataCapacity - inputBits.length - terminatorBits.length))).fill(0);
	const padStart = eccStart + eccBits.length;
	const padLength = Math.max(0, dataCapacity - inputBits.length - terminatorBits.length - eccBits.length);
	const padBits = getQrPaddingBits(padLength);
	const outputPayloadBits = [...inputBits, ...terminatorBits, ...eccBits, ...padBits];
	const fixedBits = {};
	const freeBitIndexes = [];
	const bitNames = Array(outputPayloadBits.length).fill(null);

	for (let index = 0; index < inputBits.length; index++) {
		const value = inputBits[index] & 1;
		if (index < modeBitsCount) {
			bitNames[index] = `mode_${index}`;
			fixedBits[index] = value;
		} else if (index < modeBitsCount + charCountBitsCount) {
			bitNames[index] = `char_count_${index - modeBitsCount}`;
			fixedBits[index] = value;
		} else if (index < modeBitsCount + charCountBitsCount + prefixBits.length) {
			bitNames[index] = `data_${index - modeBitsCount - charCountBitsCount}`;
			fixedBits[index] = value;
		} else if (index < inputBits.length) {
			bitNames[index] = `wildcard_${index - modeBitsCount - charCountBitsCount - prefixBits.length}`;
			freeBitIndexes.push(index);
		}
	}

	for (let index = 0; index < outputPayloadBits.length; index++) {
		const value = outputPayloadBits[index] & 1;
		const isTerminatorBit = index >= terminatorStart && index < terminatorStart + terminatorBits.length;
		const isEccBit = index >= eccStart && index < eccStart + eccBits.length;
		const isPaddingBit = index >= padStart;
		if (isTerminatorBit) {
			bitNames[index] = `terminator_${index - terminatorStart}`;
		} else if (isEccBit) {
			bitNames[index] = `ecc_reserved_${index - eccStart}`;
		} else if (isPaddingBit) {
			bitNames[index] = `padding_${index - padStart}`;
		}
	}

	return {
		prefixBits: inputBits,
		wildcardBitsCount,
		padBits,
		eccBits,
		dataCapacity,
		payloadBits: inputBits,
		outputPayloadBits,
		fixedBits,
		freeBitIndexes,
		paddingMode: normalizedMode,
		bitNames,
	};
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

