
import { QRError } from "./QRError.js"
import { hex } from "./util.js"
import { DataSize } from "./DataSize.js"

/**
 * Represents some error in the QRCode construction.
 * e.g. Invalid version, mode, too many characters, etc.
 */
export class QRCodeError extends QRError {}

export class QRCodeVersionError extends QRCodeError {}

export class QRCodeModeError extends QRCodeError {}

export class ECIDesignatorError extends QRCodeError {}

export class QRCodeDataError extends QRCodeError {}

/**
 * @param {*} version A potentially valid or invalid QRCode version (i.e. size).
 * @returns {number} version (unchanged) for convenience
 * @throws {QRCodeVersionError} If the QR code version is invalid.
 */
export function validateVersion(version) {
	if (!Number.isInteger(version) || version < 1 || version > 40)
		throw QRCodeVersionError(`Invalid verion: ${version}`);
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
	let bits = QRCode.characterCountBits(version, mode);
	if (characterCount < Math.pow(2, bits))
		throw QRCodeError(`Character count is too large (${bits} bits) for version ${version}, mode ${hex(mode)}: ${characterCount}`);
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
 * @returns {ArrayLike<number>} data (unchanged) for convenience.
 * @throws {QRCodeDataError} If the data isn't valid, e.g. the wrong length (in bits)
 */
export function validateData(data, mode, characterCount) {
	let expectedSize = dataSize(mode, characterCount);
	if (data?.length !== expectedSize)
		throw new QRCodeDataError(`Data is invalid. Expected ${expectedSize} bits. Actual: ${data?.length}`);
	return data;
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
			case QRCode.NUMERIC:       return 10;
			case QRCode.ALPHANUMERIC:  return 9;
			case QRCode.BYTE:          return 8;
			case QRCode.KANJI:         return 8;
		}
	else if (version <= 26)
		switch (mode) {
			case QRCode.NUMERIC:       return 12;
			case QRCode.ALPHANUMERIC:  return 11;
			case QRCode.BYTE:          return 16;
			case QRCode.KANJI:         return 10;
		}
	else
		switch (mode) {
			case QRCode.NUMERIC:       return 14;
			case QRCode.ALPHANUMERIC:  return 13;
			case QRCode.BYTE:          return 16;
			case QRCode.KANJI:         return 12;
		}
	throw QRCodeError(`Couldn't determine characterCountBits for verion ${version}, mode ${QRCode._modeToString(mode)}`);
}

/**
 * Calculateds the size (in bits) of the encoded data as a function of mode and characterCount.
 * @param {number} mode A valid QR DataSegment mode
 * @param {number} characterCount A valid character count (unit depends on mode)
 * @returns {number} The number of bits for the encoded data
 */
export function dataSize(mode, characterCount) {
	return new Map([
		[ Segment.NUMERIC,      DataSize.numeric      ],
		[ Segment.ALPHANUMERIC, DataSize.alphanumeric ],
		[ Segment.BYTE,         DataSize.bytes        ],
		[ Segment.KANJI,        DataSize.kanji        ]
	]).get(mode)(characterCount);
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
 * @param {ArrayLike<number>} buffer An uncompressed bit stream
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
 * @param {ArrayLike<number>} x An uncompressed bit stream to insert.
 * @param {ArrayLike<number>} buffer An uncompressed bit stream to be modified.
 * @param {number} offset The position in buffer to insert.
 * @returns {number} The new offset/position in buffer where the append ended.
 */
function appendBuffer(x, buffer, offset) {
	for (let i = 0; i < x.length; i++)
		buffer[offset++] = x[i];
	return offset;
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

	constructor(qrCode, mode) {
		this.qrCode = qrCode;  // the parent QRCode this segment will be attached to
		this.mode = validateMode(mode);
		this.size = 4;  // override in subclasses -- size of cannonical bit stream
	}

	appendMode(buffer, offset = 0) {
		appendNumber(this.mode, buffer, offset, 4);
	}

	// abstract:
	/**
	 * Convert this Segment into its cannonical bit stream (uncompressed).
	 * @returns {ArrayLike<number>}
	 */
	bitStream() { throw new Error("Abstract method"); }
}

export class DataSegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 * @param {number} mode 
	 * @param {number} characterCount 
	 * @param {ArrayLike<number>} data An (uncompressed) bit stream containing 0 or 1 elements only
	 */
	constructor(qrCode, mode, characterCount, data) {
		super(qrCode, mode);
		this.characterCount = validateCharacterCount(characterCount, qrCode.version, mode);
		this.data = validateData(data, mode, characterCount);
		this.size = 4 + characterCountBits(this.qrCode.version, this.mode) + this.data.length;
	}

	/**
	 * @param {ArrayLike<number>} buffer 
	 * @param {number} offset
	 * @returns {number} The new offset/position in buffer where the append ended
	 */
	appendCharacterCount(buffer, offset = 4) {
		return appendNumber(this.characterCount, buffer, offset, characterCountBits(this.qrCode.version, this.mode));
	}

	/**
	 * @param {ArrayLike<number>} buffer 
	 * @param {number} offset
	 * @returns {number} The new offset/position in buffer where the append ended
	 */
	appendData(buffer, offset) {
		return appendBuffer(this.data, buffer, offset);
	}

	/** @override */
	bitStream() {
		let buffer = new Uint8Array(this.size);
		let pos = 0;
		pos = this.appendMode(buffer, pos);
		pos = this.appendCharacterCount(buffer, pos);
		pos = this.appendData(buffer, pos);
		return buffer;
	}
}

export class ECISegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 * @param {number} eciDesignator 
	 */
	constructor(qrCode, eciDesignator) {
		super(qrCode, Segment.ECI);
		this.eciDesignator = validateEciDesignator(eciDesignator);
		this.size = 4 + eciDesignatorBits(this.eciDesignator);
	}

	/**
	 * @param {ArrayLike<number>} buffer 
	 * @param {number} offset 
	 * @returns The new offset/position in buffer where the append ended
	 */
	appendECIDesignator(buffer, offset = 4) {
		return appendNumber(this.eciDesignator, buffer, offset, eciDesignatorBits(this.eciDesignator));
	}

	/** @override */
	bitStream() {
		let buffer = new Uint8Array(this.size);
		let pos = 0;
		pos = this.appendMode(buffer, pos);
		pos = this.appendECIDesignator(buffer, pos);
		return buffer;
	}
}

export class NullSegment extends Segment {
	/**
	 * @param {QRCode} qrCode 
	 */
	constructor(qrCode, bits = 4) {
		super(qrCode, Segment.NULL);
		this.size = bits;  // since the NullSegment may be truncated or missing if there is no padding.
	}

	/** @override */
	bitStream() {
		// The null terminator (end of message) segment's mode indicator is all 0's
		// which is the default for Uint8Array
		return new Uint8Array(this.size);
	}
}

export class QRCode {
	/**
	 * @param {number} QRCode version (i.e. grid size)
	 * @param {ArrayLike<Segment>} segments The segment(s) in this QRCode.
	 *	A NullSegment is required at the end if there is padding.
	 * @param {ArrayLike<number>} padding The QR code spec. specifies what these padding bits should be exactly,
	 *	however, this program supports non-standard padding as well. Non-standard padding bits will not be rejected.
	 *	Only the size of the buffers will be validated.
	 */
	constructor(version, segments, padding) {
		this.version = validateVersion(version);

		/**
		 * @type {ArrayList<Segment>}
		 */
		this.segments = [];

		/**
		 * @type {ArrayLike<number>}
		 */
		this.padding = [];  // {ArrayList<number>} an (uncompressed) bit stream containing 0 or 1 elements only
	}

	/**
	 * Convert this QRCode into its cannonical bit stream (uncompressed).
	 * @returns {ArrayLike<number>}
	 */
	bitStream() {
		let bits = 13 * 8;  // TODO: (stub) determine toal number of bits
		for 
	}
}
