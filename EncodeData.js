import { QRError } from "./QRError.js"

export class EncodingError extends QRError {}

/**
 * Contains static methods which encoded different data types supported by the QR code specification, ISO 18004.
 * Each method takes the data to encode in a JS friendly format and returns a bit stream as a number array with each
 * 	element being either 0 or 1. The Array is in little endian order. e.g. [0, 1, 1, 1] -> bit_0 = 0, bit_1 = 1, etc.
 * Note: Since QR code bit streams are relatively small (e.g. length 23648 bits for version 40, ECC level L), a more
 * 	compact bit-compressed format is not used.
 */
export class EncodeData {
	/**
	 * Note: raw binary data with no ECI block will be interpreted by the QR code spec. as Latin-1. Although many
	 * 	modern readers will perform a data analysis in this case and may try other common data formats like UTF-8.
	 * @param {ArrayLike<number>} bytes A number array, each element in the interval [0, 255].
	 * @return {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 * @see https://en.wikipedia.org/wiki/Extended_Channel_Interpretation
	 */
	static bytes(bytes) {
		let data = new Uint8Array(8 * bytes.length);  // uncompressed. each bit gts a full byte of memory.
		for (let i = 0; i < bytes.length; i++) {
			// encode the bits of each byte in big-endian per QR code spec.
			for (let j = 7; j >= 0; j--)
				data[8 * i + (7 - j)] = (bytes[i] >>> j) & 0x01;  // e.g. for j=5, 'a' == 01(1)0 0001 >>> 5 == 0000 001(1) -> data[8 * i + 2] = 1
		}
		return data;
	}

	/**
	 * @param {string} str A string containing valid Latin-1 (ISO 8559-1, i.e. extended ASCII) characters.
	 * @return {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 */
	static latin1(str) {
		let data = new Uint8Array(8 * str.length);
		for (let i = 0; i < str.length; i++) {
			code = str.charCodeAt(i);  // UTF-16 code point
			if (code >= 256)
				throw new EncodingError(`Invalid Latin-1 character (${code}): ${str.charAt(i)}`);
			// UTF-16 is consistent with Latin-1 for [0, 255]
			
			// encode the bits of each byte in big-endian per QR code spec.
			for (let j = 7; j >= 0; j--)
				data[8 * i + (7 - j)] = (code >>> j) & 0x01;  // e.g. for j=5, 'a' == 01(1)0 0001 >>> 5 == 0000 001(1) -> data[8 * i + 2] = 1
		}
		return data;
	}

	/**
	 * @param {string} str A string.
	 * @param {ArrayLike<number>} An array of bit representing the encoded bitstream.
	 */
	static utf8(str) {
		return EncodeData.bytes(new TextEncoder().encode(str));
	}

	/**
	 * @param {string} str A string containing valid alphanumeric characters as specified by the QR code spec.
	 * @return {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 * @see https://www.thonky.com/qr-code-tutorial/alphanumeric-table
	 */
	static alphanumeric(str) {
		return [];  // TODO: stub
	}

	/**
	 * @param {string} str A string containing valid numeric characters (i.e. 0-9).
	 * @return {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 */
	static numeric(str) {
		return [];  // TODO: stub
	}

	/**
	 * @param {string} str A String containing characters from the Shift JIS character set.
	 * @returns {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 */
	static kanji(str) {
		return [];  // TODO: stub
	}
}
