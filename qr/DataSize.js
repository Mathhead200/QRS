
/**
 * Contains static methods which determine the expected data size based on a given character count.
 * Useful for encoding and decoding. Character count is defined in the QR code spec., ISO 18004, and
 * is defined uniquely for each data mode: numeric, alphanumeric, byte, kanji.
 */
export class DataSize {
	/**
	 * @param {number} characterCount in bytes 
	 * @returns {number} encoded data size (in bits)
	 */
	static bytes(characterCount) {
		return characterCount * 8;
	}

	/**
	 * @param {number} characterCount in alphanumeric characters 
	 * @returns {number} encoded data size (in bits)
	 */
	static alphanumeric(characterCount) {
		return Math.ceil(11.0 * characterCount / 2.0);
	}

	/**
	 * @param {number} characterCount in (decimal) digits 
	 * @returns {number} encoded data size (in bits)
	 */
	static numeric(characterCount) {
		return Math.ceil(10.0 * characterCount / 3.0);
	}

	/**
	 * @param {number} characterCount
	 * @returns {number} encoded data size (in bits)
	 */
	static kanji(characterCount) {
		throw Error("TODO: Unimplemented");  // TODO
	}
}
