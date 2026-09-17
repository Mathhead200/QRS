
import { DataSize } from "./DataSize.js"
import { QRError } from "./QRError.js"
import { ReedSolomon } from "./ReedSolomon.js";
import { contiguousTensor, hex } from "./util.js"

/**
 * Represents some error in the QRCode construction.
 * e.g. Invalid version, mode, too many characters, etc.
 */
export class QRCodeError extends QRError {}

export class QRCodeVersionError extends QRCodeError {}

export class QRCodeModeError extends QRCodeError {}

export class ECIDesignatorError extends QRCodeError {}

export class QRCodeDataError extends QRCodeError {}

export class QRCodeECLevelError extends QRCodeError {}

export class QRCodePaddingError extends QRCodeError {}

/**
 * @param {*} version A potentially valid or invalid QRCode version (i.e. size).
 * @returns {number} version (unchanged) for convenience
 * @throws {QRCodeVersionError} If the QR code version is invalid.
 */
export function validateVersion(version) {
	if (!Number.isInteger(version) || version < 1 || version > 40)
		throw new QRCodeVersionError(`Invalid verion: ${version}`);
	return version;
}

/**
 * @param {*} mode A potentially valid or invalid QR Segment mode.
 * @returns {number} mode (unchanged) for convenience
 * @throws {QRCodeModeError} If the data mode is invalid.
 */
export function validateMode(mode) {
	if (!Number.isInteger(mode) || mode < 0x0 || mode > 0xF)
		throw QRCodeModeError(`Invalid mode: ${hex(mode)}`);
	return mode;
}

/**
 * @param {*} characterCount A potentially valid or invalid character count.
 * @param {number} version A valid QR code version
 * @param {number} mode A valid data segment mode
 * @returns {number} characterCount (unchanged) for convenience
 * @throws {QRCodeError} If the charcterCount is invalid, e.g. too large for the given version and mode
 */
export function validateCharacterCount(characterCount, version, mode) {
	if (!Number.isInteger(characterCount) || characterCount < 0)
		throw QRCodeError(`Invalid character count: ${characterCount}`);
	let bits = characterCountBits(version, mode);
	if (characterCount >= Math.pow(2, bits))
		throw new QRCodeError(`Character count is too large (${bits} bits) for version ${version}, mode ${hex(mode)}: ${characterCount}`);
	return characterCount
}

/**
 * Note: doesn't validate the ECI designator against any established lookup table.
 * 	Just that it that it's in the correct form.
 * @param {*} eciDesignator A potentially valid or invalid ECI designator.
 * @returns {number} eciDesignator (unchanged) for convenience
 * @throws {ECIDesignatorError} If the eciDesignator is invalid, e.g. wrong leading bits.
 * @see https://en.wikipedia.org/wiki/Extended_Channel_Interpretation
 */
export function validateEciDesignator(eciDesignator) { 
	if (!Number.isInteger(eciDesignator) || eciDesignator < 0x000000 || eciDesignator > 0xFFFFFF)
		throw new ECIDesignatorError(`Invalid ECI designator`)
	if (eciDesignator <= 0xFF) {  // validate 8-byte ECI
		if (eciDesignator >>> 7 !== 0x0)
			throw new ECIDesignatorError(`8-byte ECI designator must start with leading bits "0...": ${hex(eciDesignator, 2)}`);
	} else if (eciDesignator <= 0xFFFF) {
		if (eciDesignator >>> 14 !== 0x2)
			throw new ECIDesignatorError(`16-byte ECI designator must start with leading bits "10...": ${hex(eciDesignator, 4)}`);
	} else {
		if (eciDesignator >>> 21 !== 0x4)
			throw new ECIDesignatorError(`24-byte ECI designator must start with leading bits "110...: ${hex(eciDesignator, 6)}"`);
	}
	return eciDesignator;
}

/**
 * @param {*} data Potentially valid or invalid data.
 * @param {number} mode A valid QR DataSegemnt mode.
 * @param {number} characterCount A valid AR DataSegment character count.
 * @returns {ArrayLike} data (unchanged) for convenience.
 * @throws {QRCodeDataError} If the data isn't valid, e.g. the wrong length (in bits)
 */
export function validateData(data, mode, characterCount) {
	let expectedSize = dataSize(mode, characterCount);
	if (expectedSize === undefined)
		throw new QRCodeDataError(`Could not determine expected data length. (Is this a data mode?): ${mode}`)
	if (data?.length !== expectedSize)
		throw new QRCodeDataError(`Data is invalid. Expected ${expectedSize} bits. Actual: ${data?.length}`);
	// for (let i = 0; i < data.length; i++)
	// 	if (data[i] !== 0 && data[i] !== 1)
	// 		throw new QRCodeDataError(`All elements in data array must be 0 or 1: ${data[i]}`);
	return data;
}

/**
 * @param {*} ecLevel Potantially valid or invalid error code level. 
 * @returns {str} ecLevel (unchanged) for convenience
 * @throws {QRCodeECLevelError} If the ecLevel is invalid, i.e. not one of LMQH
 */
export function validateECLevel(ecLevel) {
	if (!new Set("LMQH").has(ecLevel))
		throw new QRCodeECLevelError(`Invalid error code level. Expected L, M, Q, or H: "${ecLevel}"`);
	return ecLevel;
}

/**
 * @param {*} segments Potentally valid of invalid Segments
 * @param {number} size == 8 * (maximum codewords) for a specific QRCode
 * @returns {ArrayLike<Segment>} segments (unchanged) for convenience
 * @throws {QRError} If the segments array is invalid, e.g. too long, missing expected NullTerminator
 */
export function validateSegments(segments, version, size) {
	if (Number.isInteger(segments?.length))
		throw new QRCodeError(`Expected ArrayLike: ${segments}`);

	let sum = 0;
	let eci = false;  // was the last segment an ECI segment?
	for (let i = 0; i < segments.length; i++) {
		let s = segments[i];
		
		// Does this element look like a segment?
		if (!Number.isInteger(s?.size) || s.size < 0 || typeof s.bitStream !== "function")
			throw new QRError(`Expected Segment: ${s}`);
		// validated: s, s.size, s.bitStream

		// Check for misc. NullSegments
		if (validateMode(s.mode) === Segment.NULL)  // may throw QRCodeModeError extends QRCodeError
			if (i != segments.length - 1)
				throw new QRCodeError(`NullSegment expected only at end the array (${segments.length - 1}): ${i}`);
		// validated: s.mode

		// Validate DataSegments
		if (s.data != undefined) {
			if (validateVersion(s.version) !== version)  // may throw QRCodeVersionError extends QRCodeError
				throw new QRError(`Expected a segment for QR code version (${version}): ${s.version}`);
			// validated: s.version

			validateData(s.data,                                  // may throw QRCodeDataError extends QRCodeError
				s.mode, validateCharacterCount(s.characterCount,  // may throw QRCodeError
					s.version, s.mode));
			// validated: s.data, s.characterCount
		}

		// Validate ECISegment, DataSegment pairings
		if (s.mode === Segment.ECI) {
			eci = true;
		} else if (eci) {
			if (s.data === undefined)
				throw new QRCodeError(`Expected DataSegment immediated following ECISegment: ${s}`)
			eci = false;
		}

		sum += s.size;
	}

	if (eci)
		throw new QRCodeError(`QRCode can't end with an ECI segment: ${segments}`);

	let rem = size - sum;
	if (rem < 0)
		throw new QRCodeError(`QRCode is too long. Maximum capacity is ${size}: ${sum}`);
	if (rem > 0) {
		let last = segments[segments.length - 1];
		let nullBits = Math.min(rem, 4);
		if (last?.mode !== Segment.NULL)
			throw new QRError(`Missing required NullSegement: ${rem}`);
		if (last.size !== nullBits)
			throw new QRCodeError(`Expected NullSegment to have ${nullBits} bits: ${last.size}`);
	}

	return segments;
}

/**
 * @param {*} padding Potentially valid or invalid padding
 * @param {ArrayLike<Segment>} segments A valid sequence of QRCode segments
 * @param {number} size == 8 * (maximum codewords) for a specific QRCode'
 * @returns {ArrayLike} padding (unchanged) for convenience
 * @throws {QRCodePaddingError} If the padding is invalid. Does *not* enforce strict QR Code spec. rules for padding.
 */
export function validatePadding(padding, segments, size) {
	if (!Number.isInteger(padding?.length))
		throw new QRCodePaddingError(`Expected ArrayLike: ${padding}`);

	// reduced available size by total size of segements
	for (let i = 0; i < segments.length; i++)
		size -= segments[i].size;
	if (padding.length !== size)
		throw new QRCodePaddingError(`Padding is the wrong size (${size}): ${padding.length}`);

	// for (let i = 0; i < padding.length; i++) {
	// 	let p = padding[i];  // 1 bit of padding
	// 	if (p !== 0 && p !== 1)
	// 		throw new QRCodePaddingError(`All elements in padding must be 0 or 1: ${p}`);
	// }

	return padding;
}

/**
 * Lookup table for how many bits the character count header field needs to be for
 * 	a DataSegment in the given mode, in a QRCode with the given version.
 * @param {number} version A valid QR code version (i.e. size)
 * @param {number} mode A valid QR DataSegment mode
 * @returns {number | null} The number of bits.
 * @throws {QRCodeError} if the number of bits couldn't be determined.
 */
export function characterCountBits(version, mode) {
	if (version <= 9)
		switch (mode) {
			case Segment.NUMERIC:       return 10;
			case Segment.ALPHANUMERIC:  return 9;
			case Segment.BYTE:          return 8;
			case Segment.KANJI:         return 8;
		}
	else if (version <= 26)
		switch (mode) {
			case Segment.NUMERIC:       return 12;
			case Segment.ALPHANUMERIC:  return 11;
			case Segment.BYTE:          return 16;
			case Segment.KANJI:         return 10;
		}
	else
		switch (mode) {
			case Segment.NUMERIC:       return 14;
			case Segment.ALPHANUMERIC:  return 13;
			case Segment.BYTE:          return 16;
			case Segment.KANJI:         return 12;
		}
	throw new QRCodeError(`Couldn't determine characterCountBits for verion ${version}, mode ${mode}`);
}

/**
 * Calculateds the size (in bits) of the encoded data as a function of mode and characterCount.
 * @param {number} mode A valid QR DataSegment mode
 * @param {number} characterCount A valid character count (unit depends on mode)
 * @returns {number} The number of bits for the encoded data
 */
export function dataSize(mode, characterCount) {
	let f = new Map([
		[ Segment.NUMERIC,      DataSize.numeric      ],
		[ Segment.ALPHANUMERIC, DataSize.alphanumeric ],
		[ Segment.BYTE,         DataSize.bytes        ],
		[ Segment.KANJI,        DataSize.kanji        ]
	]).get(mode);
	return f ? f(characterCount) : undefined;
}

/**
 * @param {number} eciDesignator 
 * @returns {number} The number of bits for the given eciDesignator field
 */
export function eciDesignatorBits(eciDesignator) {
	if (eciDesignator <= 0xFF)
		return 8;
	if (eciDesignator <= 0xFFFF)
		return 16;
	return 24;
}

/**
 * Inserts the given number in big-endian (MSB first) order into the given buffer.
 * @param {number} x An unsigned integer
 * @param {ArrayLike} buffer An uncompressed bit stream
 * @param {number} offset The posiion to insert the number
 * @param {number} bits The explicit size of the insertion in bits.
 * 	This is needed since some numbers may be 0-padded. (e.g. "3" in 4 bits is 0011)
 * @returns {number} The new offset/position in buffer where the append ended.
 */
function appendNumber(x, buffer, offset, bits) {
	while (bits > 0)
		buffer[offset++] = (x >>> --bits) & 0x1;
	return offset;
}

/**
 * Inserts the given buffer (x) into the given output buffer (buffer).
 * @param {ArrayLike} x An uncompressed bit stream to insert.
 * @param {ArrayLike} buffer An uncompressed bit stream to be modified.
 * @param {number} offset The position in buffer to insert.
 * @returns {number} The new offset/position in buffer where the append ended.
 */
function appendBuffer(x, buffer, offset) {
	for (let i = 0; i < x.length; i++)
		buffer[offset++] = x[i];
	return offset;
}

/**
 * Inserts the given matrix, submat, into the larger matrix.
 * @param {ArrayLike<ArrayLike>} submat
 * @param {ArrayLike<ArrayLike>} matrix
 * @param {number} row_offset
 * @param {number} col_offset
 * @returns {[number, number]} [row_offset, col_offset] The new offsets in the matrix where the append ended (in both dimension).
 */
function appendMatrix(submat, matrix, row_offset = 0, col_offset = 0) {
	let longest_row = 0;
	for (let i = 0; i < submat.length; i++) {
		for (let j = 0; j < submat[i].length; j++)
			matrix[row_offset + i][col_offset + j] = submat[i][j];
		longest_row = Math.max(submat[i].length, longest_row);
	}
	return [row_offset + submat.length, col_offset + longest_row];
}

/**
 * In a QR code bitstream, there a three main types of segments:
 * Data:
 * 		These kind hold data. (e.g. Numeric, Alphanumberic, Byte, Kanji)
 * ECI:
 * 		Used as a signal. The following segment must be a data segment, and
 * 		its data will interpreted based on this ECI segment's  ECI assignment number.
 * Null:
 * 		Used as a signal. No more data segments follow this one. Only padding bits to fill out the QR code.
 */
export class Segment {
	// Modes:
	static NULL              = 0x0;  // 0000
	static NUMERIC           = 0x1;  // 0001
	static ALPHANUMERIC      = 0x2;  // 0010
	static STRUCTURED_APPEND = 0x3;  // 0011  (TODO)
	static BYTE              = 0x4;  // 0100
	static FNC1_1            = 0x5;  // 0101  (TODO)
	static ECI               = 0x7;  // 0111
	static KANJI             = 0x8;  // 1000
	static FNC1_2            = 0x9;  // 1001  (TODO)

	constructor(mode) {
		this.mode = validateMode(mode);
		this.size = 4;  // override in subclasses -- size of cannonical bit stream
	}

	// abstract:
	/**
	 * Convert this Segment into its cannonical bit stream (uncompressed).
	 * @returns {ArrayLike}
	 */
	bitStream(buffer, offset = 0) { throw new Error("Abstract method"); }
}

export class DataSegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 * @param {number} mode 
	 * @param {number} characterCount 
	 * @param {ArrayLike<number>} data An (uncompressed) bit stream containing 0 or 1 elements only
	 */
	constructor(version, mode, characterCount, data) {
		super(mode);
		this.version = validateVersion(version);
		this.characterCount = validateCharacterCount(characterCount, version, mode);
		this.data = validateData(data, mode, characterCount);
		this.size = 4 + characterCountBits(version, mode) + this.data.length;
	}

	/** @override */
	bitStream(buffer = new Array(this.size), offset = 0) {
		offset = appendNumber(this.mode, buffer, offset, 4);
		offset = appendNumber(this.characterCount, buffer, offset, characterCountBits(this.version, this.mode));
		offset = appendBuffer(this.data, buffer, offset);
		return buffer;
	}
}

export class ECISegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 * @param {number} eciDesignator 
	 */
	constructor(eciDesignator) {
		super(Segment.ECI);
		this.eciDesignator = validateEciDesignator(eciDesignator);
		this.size = 4 + eciDesignatorBits(eciDesignator);
	}

	/** @override */
	bitStream(buffer = new Uint8Array(this.size), offset = 0) {
		offset = appendNumber(this.mode, buffer, offset, 4);
		offset = appendNumber(this.eciDesignator, buffer, offset, eciDesignatorBits(this.eciDesignator));
		return buffer;
	}
}

export class NullSegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 */
	constructor(bits = 4) {
		super(Segment.NULL);
		this.size = bits;  // since the NullSegment may be truncated or missing if there is no padding.
	}

	/** @override */
	bitStream(buffer, offset) {
		if (!buffer) {
			// (optimization) The null terminator (end of message) segment's mode indicator is all 0's
			// which is the default for Uint8Array
			return new Uint8Array(this.size);
		}
		appendNumber(0x0, buffer, offset, this.size);
		return buffer;
	}
}

export class QRCode {
	// Error correction levels (see QR code spec., ISO 18004)
	static L = "L";  // low (7%)
	static M = "M";  // medium (15%)
	static Q = "Q";  // quartile (25%)
	static H = "H";  // high (30%)

	/** @see Table 9 in ISO/IEC 18004:2000 */
	static _EC_CHRACTERISTICS = [
		// scheme: [k, E, g_1, k_1, (g_2), (k_2)]
		// L:                            M:                            Q:                            H:
		[[  19,  7,  1,  19,  0,   0],   [  16, 10,  1, 16,  0,  0],   [  13, 13,  1, 13,  0,  0],   [   9, 17,  1,  9,  0,  0]],  // version 1
		[[  34, 10,  1,  34,  0,   0],   [  28, 16,  1, 28,  0,  0],   [  22, 22,  1, 22,  0,  0],   [  16, 28,  1, 16,  0,  0]],
		[[  55, 15,  1,  55,  0,   0],   [  44, 26,  1, 44,  0,  0],   [  34, 18,  2, 17,  0,  0],   [  26, 22,  2, 13,  0,  0]],
		[[  80, 20,  1,  80,  0,   0],   [  64, 18,  2, 32,  0,  0],   [  48, 26,  2, 24,  0,  0],   [  36, 16,  4,  9,  0,  0]],
		[[ 108, 26,  1, 108,  0,   0],   [  86, 24,  2, 43,  0,  0],   [  62, 18,  2, 15,  2, 16],   [  46, 22,  2, 11,  2, 12]],  // version 5
		[[ 136, 18,  2,  68,  0,   0],   [ 108, 16,  4, 27,  0,  0],   [  76, 24,  4, 19,  0,  0],   [  60, 28,  4, 15,  0,  0]],
		[[ 156, 20,  2,  78,  0,   0],   [ 124, 18,  4, 31,  0,  0],   [  88, 18,  2, 14,  4, 15],   [  66, 26,  4, 13,  1, 14]],
		[[ 194, 24,  2,  97,  0,   0],   [ 154, 22,  2, 38,  2, 39],   [ 110, 22,  4, 18,  2, 19],   [  86, 26,  4, 14,  2, 15]],
		[[ 232, 30,  2, 116,  0,   0],   [ 182, 22,  3, 36,  2, 37],   [ 132, 20,  4, 16,  4, 17],   [ 100, 24,  4, 12,  4, 13]],  // version 9
		[[ 274, 18,  2,  68,  2,  69],   [ 216, 26,  4, 43,  1, 44],   [ 154, 24,  6, 19,  2, 20],   [ 122, 28,  6, 15,  2, 16]],
		[[ 324, 20,  4,  81,  0,   0],   [ 254, 30,  1, 50,  4, 81],   [ 180, 28,  4, 22,  4, 23],   [ 140, 24,  3, 12,  8, 13]],
		[[ 370, 24,  2,  92,  2,  93],   [ 290, 22,  6, 36,  2, 37],   [ 206, 26,  4, 20,  6, 21],   [ 158, 28,  7, 14,  4, 15]],
		[[ 428, 26,  4, 107,  0,   0],   [ 334, 22,  8, 37,  1, 38],   [ 244, 24,  8, 20,  4, 21],   [ 180, 22, 12, 11,  4, 12]],  // version 13
		[[ 461, 30,  3, 115,  1, 116],   [ 365, 24,  4, 40,  5, 41],   [ 261, 20, 11, 16,  5, 17],   [ 197, 24, 11, 12,  5, 13]],
		[[ 523, 22,  5,  87,  1,  88],   [ 415, 24,  5, 41,  5, 42],   [ 295, 30,  5, 24,  7, 25],   [ 223, 24, 11, 12,  7, 13]],
		[[ 589, 24,  5,  98,  1,  99],   [ 453, 28,  7, 45,  3, 46],   [ 325, 24, 15, 19,  2, 20],   [ 253, 30,  3, 15, 13, 16]],
		[[ 647, 28,  1, 107,  5, 108],   [ 507, 28, 10, 46,  1, 47],   [ 367, 28,  1, 22, 15, 23],   [ 283, 28,  2, 14, 17, 15]],  // version 17
		[[ 721, 30,  5, 120,  1, 121],   [ 563, 26,  9, 43,  4, 44],   [ 397, 28, 17, 22,  1, 23],   [ 313, 28,  2, 14, 19, 15]],
		[[ 795, 28,  3, 113,  4, 114],   [ 627, 26,  3, 44, 11, 45],   [ 445, 26, 17, 21,  4, 22],   [ 341, 26,  9, 13, 16, 14]],
		[[ 861, 28,  3, 107,  5, 108],   [ 669, 26,  3, 41, 13, 42],   [ 485, 30, 15, 24,  5, 25],   [ 385, 28, 15, 15, 10, 16]],
		[[ 932, 28,  4, 116,  4, 117],   [ 714, 26, 17, 42,  0,  0],   [ 512, 28, 17, 22,  6, 23],   [ 406, 30, 19, 16,  6, 17]],  // version 21
		[[1006, 28,  2, 111,  7, 112],   [ 782, 28, 17, 46,  0,  0],   [ 568, 30,  7, 24, 16, 25],   [ 442, 24, 34, 13,  0,  0]],
		[[1094, 30,  4, 121,  5, 122],   [ 860, 28,  4, 47, 14, 48],   [ 614, 30, 11, 24, 14, 25],   [ 464, 30, 16, 15, 14, 16]],
		[[1174, 30,  6, 117,  4, 118],   [ 914, 28,  6, 45, 14, 46],   [ 664, 30, 11, 24, 16, 25],   [ 514, 30, 30, 16,  2, 17]],
		[[1276, 26,  8, 106,  4, 107],   [1000, 28,  8, 47, 13, 48],   [ 718, 30,  7, 24, 22, 25],   [ 538, 30, 22, 15, 13, 16]],  // version 25
		[[1370, 28, 10, 114,  2, 115],   [1062, 28, 19, 46,  4, 47],   [ 754, 28, 28, 22,  6, 23],   [ 596, 30, 33, 16,  4, 17]],
		[[1468, 30,  8, 122,  4, 123],   [1128, 28, 22, 45,  3, 46],   [ 808, 30,  8, 23, 26, 24],   [ 628, 30, 12, 15, 28, 16]],
		[[1531, 30,  3, 117, 10, 118],   [1193, 28,  3, 45, 23, 46],   [ 871, 30,  4, 24, 31, 25],   [ 661, 30, 11, 15, 31, 16]],
		[[1631, 30,  7, 116,  7, 117],   [1267, 28, 21, 45,  7, 46],   [ 911, 30,  1, 23, 37, 24],   [ 701, 30, 19, 15, 26, 16]],  // version 29
		[[1735, 30,  5, 115, 10, 116],   [1373, 28, 19, 47, 10, 48],   [ 985, 30, 15, 24, 25, 25],   [ 745, 30, 23, 15, 25, 16]],
		[[1843, 30, 13, 115,  3, 116],   [1455, 28,  2, 46, 29, 47],   [1033, 30, 42, 24,  1, 25],   [ 793, 30, 23, 15, 28, 16]],
		[[1955, 30, 17, 115,  0,   0],   [1541, 28, 10, 46, 23, 47],   [1115, 30, 10, 24, 35, 25],   [ 845, 30, 19, 15, 35, 16]],
		[[2071, 30, 17, 115,  1, 116],   [1631, 28, 14, 46, 21, 47],   [1171, 30, 29, 24, 19, 25],   [ 901, 30, 11, 15, 46, 16]],  // version 33
		[[2191, 30, 13, 115,  6, 116],   [1725, 28, 14, 46, 23, 47],   [1231, 30, 44, 24,  7, 25],   [ 961, 30, 59, 16,  1, 17]],
		[[2306, 30, 12, 121,  7, 122],   [1812, 28, 12, 47, 26, 48],   [1286, 30, 39, 24, 14, 25],   [ 986, 30, 22, 15, 41, 16]],
		[[2434, 30,  6, 121, 14, 122],   [1914, 28,  6, 47, 34, 48],   [1354, 30, 46, 24, 10, 25],   [1054, 30,  2, 15, 64, 16]],
		[[2566, 30, 17, 122,  4, 123],   [1992, 28, 29, 46, 14, 47],   [1426, 30, 49, 24, 10, 25],   [1096, 30, 24, 15, 46, 16]],  // version 37
		[[2702, 30,  4, 122, 18, 123],   [2102, 28, 13, 46, 32, 47],   [1502, 30, 48, 24, 14, 25],   [1142, 30, 42, 15, 32, 16]],
		[[2812, 30, 20, 117,  4, 118],   [2216, 28, 40, 47,  7, 48],   [1582, 30, 43, 24, 22, 25],   [1222, 30, 10, 15, 67, 16]],
		[[2956, 30, 19, 118,  6, 119],   [2334, 28, 18, 47, 31, 48],   [1666, 30, 34, 24, 34, 25],   [1276, 30, 20, 15, 61, 16]],
	];

	static _REMAINDER_BITS = [
		0, 7, 7, 7, 7,   7, 0, 0, 0, 0,  // versions  1-10
		0, 0, 0, 3, 3,   3, 3, 3, 3, 3,  // versions 11-20
		4, 4, 4, 4, 4,   4, 4, 3, 3, 3,  // versions 21-30
		3, 3, 3, 3, 0,   0, 0, 0, 0, 0,  // versions 31-40
	]

	/** Get the error-correction characteristics for a specific version and error-correction level. */
	static ecCharacteristics({ version, ecLevel }) {
		let info = QRCode._EC_CHRACTERISTICS[version - 1][{ "L": 0, "M": 1, "Q": 2, "H": 3 }[ecLevel]];
		return {
			codewords: info[0],
			E:         info[1],
			g1:        info[2],
			k1:        info[3],
			g2:        info[4],
			k2:        info[5]
		}
	}

	static remainderBits({ version }) {
		return QRCode._REMAINDER_BITS[version - 1];
	}
	
	/** Size of this QRCode in bytes (before error correction). */
	codewords;  // set with Object.assign in constructor

	/** Error correction bytes per block. */
	E;  // set with Object.assign in constructor

	/** Number of blocks in group 1. */
	g1;  // set with Object.assign in constructor

	/** Number of codewords (i.e. bytes) per block in group 1. */
	k1;  // set with Object.assign in constructor

	/** Number of blocks in group 2. (May be 0.) */
	g2;  // set with Object.assign in constructor

	/** Number of codewords (i.e. bytes) per block in gorup 2. (0 iff this.g2 === 0) */
	k2;  // set with Object.assign in constructor

	/**
	 * @param {number} version QRCode version (i.e. grid size)
	 * @param {str} ecLevel Error correction level: L, M, Q, or H
	 * @param {ArrayLike<Segment>} segments The segment(s) in this QRCode.
	 *	A 4-bit NullSegment is required at the end if there is padding.
	 * @param {ArrayLike<number>} padding The QR code spec. specifies what these padding bits should be exactly,
	 *	however, this program supports non-standard padding as well. Non-standard padding bits will *not* be rejected.
	 *	Only the size of the buffers will be evalidated.
	 */
	constructor(version, ecLevel, segments, padding = null) {
		this.version = validateVersion(version);
		this.ecLevel = validateECLevel(ecLevel);
		Object.assign(this, QRCode.ecCharacteristics({ version, ecLevel }));
		this.segments = validateSegments(segments, this.size);
		this.padding = padding !== null ? validatePadding(padding) : this.standardPadding();
	}

	/** Size in bits (pre- error correction). */
	get size() { return 8 * this.codewords; }

	/** Error correction bits needed for full message. */
	get ecBits() { return this.E * (this.g1 + this.g2); }

	/** Number of remainder bits needed (if any) after error correection, just before modual placment. */
	get remainderBits() { QRCode.remainderBits(this); }

	/**
	 * Generates the standard padding per QR Code spec., ISO 18004.
	 * @return {Uint8Array} An uncompress bit stream containing just the padding that would be standard for this QRCode.
	 */
	standardPadding() {
		// calculate size of required padding
		let size = this.size;
		for (let i = 0; i < this.segments.length; i++)
			size -= this.segments[i].size;
		let padding = new Uint8Array(size);
		
		// if the padding size is unaligned (i.e. not a multiple of 8),
		// align by prepending 0's at the front (i.e. immediately following the null segment)
		let offset = size % 8;
		for (let i = 0; i < offset; i++)
			padding[i] = 0;

		// fill remaining space with standard pattern defined in spec.
		let pattern = "1110 1100 0001 0001";
		pattern = [...pattern].filter(c => "01".includes(c)).map(Number);  // [1, 1, 1, 0, ...]
		for (let i = 0; offset + i < size; i++)
			padding[offset + i] = pattern[i % pattern.length];

		return padding;
	}

	/**
	 * Convert this QRCode into its cannonical bit stream (uncompressed).
	 * @returns {ArrayLike}
	 */
	bitStream(buffer = new Array(this.size), offset = 0) {
		let pos = 0;
		for (let i = 0; i < this.segments.length; i++) {
			let s = this.segments[i];
			s.bitStream(buffer, pos);
			pos += s.size;
		}
		pos = appendBuffer(this.padding, buffer, pos);
		return buffer;
	}

	/**
	 * Generate the bit matrix that would transform this QRCode.bitStream() into the bit stream with error correction codes
	 * per the QR code spec.
	 * @returns {ArrayLike<ArrayLike<number>>} an uncompressed bit matrix in GF(2) with each element being a 0 or 1.
	 */
	ecMatrix() {
		const rows = this.size + this.ecBits;
		const cols = this.size;
		let matrix = contiguousTensor(Uint8Array, [rows, cols]);

		const g = this.g1 + this.g2;  // tota number of blocks
		const kMax = Math.max(this.k1, this.k2);

		// Build block-diagonal matrix, which models performing Reed-Solomon error correction on each block seperately.
		// Error bits are the 8E rows at the end of each block.
		let blocks = new Array(g);  // { data: row index for data, ec: row index for error correction }
		{	let i = 0;
			let r = 0;  // cumulative row position
			let c = 0;  // cumulative column position
			for (; i < this.g1; i++) {
				blocks[i] = { data: r, ec: r + this.k1 }
				let submatrix_i = ReedSolomon.matrix(this.k1, this.E);
				[r, c] = appendMatrix(submatrix_i, matrix, r, c);
			}
			for (; i < g; i++) {
				blocks[i] = { data: r, ec: r + this.k2 }
				let submatrix_i = ReedSolomon.matrix(this.k2, this.E)
				[r, c] = appendMatrix(submatrix_i, matrix, r, c);
			}
		}

		// Model data (resp. error) interleaving as row-swaps
		let permuted = new Array(rows);
		let dest = 0;  // row index
		
		// data rows comes first
		for (let offset = 0; offset < kMax; offset++) {
			let i = 0;
			if (offset < this.k1)  // add one data row from each block in group 1
				for (; i < this.g1; i++)  // block index, i
					permuted[dest++] = matrix[blocks[i].data + offset];
			if (offset < this.k2)  // add one data row from each block in group 2
				for (; i < g; i++)  // block index, i
					permuted[dest++] = matrix[blocks[i].data + offset];
		}

		// error correction rows come next 
		for (let offset = 0; offset < this.E; offset++)
			for (let i = 0; i < g; i++)  // block index, i (E is the same for all blocks)
				permuted[dest++] = matrix[block[i].ec + offset];

		return permuted;
	}
}
