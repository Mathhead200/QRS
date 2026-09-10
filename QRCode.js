
import { QRError } from "./QRError.js"

/**
 * For reporting errors.
 */
function _modeToString(mode) {
	if (Number.isInteger(mode) && mode >= 0)
		return `0x${mode.toString(16)}`;
	return mode;
}

/**
 * Represents some error in the QRCode construction.
 * e.g. Invalid version, mode, too many characters, etc.
 */
export class QRCodeError extends QRError {}

export class QRCodeVersionError extends QRCodeError {}

export class QRCodeModeError extends QRCodeError {}

/** Represents some error with the ECI designator. */
export class ECIError extends QRCodeError {}

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
		throw QRCodeModeError(`Invalid mode: ${_modeToString(mode)}`);
	return mode;
}

/**
 * @param {*} characterCount 
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
		throw QRCodeError(`Character count is too large (${bits} bits) for version ${version}, mode ${_modeToString(mode)}: ${characterCount}`);
	return characterCount
}

/**
 * 
 * @param {*} eciDesignator 
 * @returns 
 */
export function validateEciDesignator(eciDesignator) {
	// Stub. Doesn't validate the ECI designator against any established lookup table.
	// (e.g. see: https://en.wikipedia.org/wiki/Extended_Channel_Interpretation )
	if (!Number.isInteger(eciDesignator) || eciDesignator < 0x000000 || eciDesignator > 0xFFFFFF)
		throw new ECIError(`Invalid ECI designator`)
	return eciDesignator;
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
	static NULL         = 0x0;  // 0000
	static NUMERIC      = 0x1;  // 0001
	static ALPHANUMERIC = 0x2;  // 0010
	static BYTE         = 0x4;  // 0100
	static ECI          = 0x7;  // 0111
	static KANJI        = 0x8;  // 1000

	constructor(qrCode, mode) {
		this.qrCode = qrCode;  // the parent QRCode this segment will be attached to
		this.mode = validateMode(mode);
	}
}

export class DataSegment extends Segment {
	constructor(qrCode, mode, characterCount) {
		super(qrCode, mode);
		this.characterCount = validateCharacterCount(this.qrCode.version, this.mode, characterCount);
		this.data = []
	}
}

export class ECISegment extends Segment {
	constructor(qrCode, eciDesignator) {
		super(qrCode, Segment.ECI);
		this.eciDesignator = eciDesignator;
	}
}

export class QRCode {
	constructor(version, characterCount) {
		this.version = validateVersion(version);
		this.segments = [];
	}
}
