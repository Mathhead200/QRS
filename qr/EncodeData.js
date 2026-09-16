import { QRError } from "./QRError.js"
import { DataSize } from "./DataSize.js"

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
		let data = new Uint8Array(DataSize.bytes(bytes.length));  // uncompressed. each bit gts a full byte of memory.
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
		const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVQXYZ $%*+-./:";
		const map = new Map();
		[...charset].forEach((c, i) => map.set(c, i));

		let data = new Uint8Array(DataSize.alphanumeric(str.length));
		let next = 0;
		for (let i = 0; i < str.length; i += 2) {
			// Split the string into 2 character groups, except maybe the last group which may get truncated.
			let g = str.substring(i, i + 2);

			let n = map.get(g[0]);
			let bits = 11;
			if (g.length === 2)   // 2 character groups get encoded into 11 bits.
				n = 45 * n + map.get(g[1]);
			else  // a trailing 1 character group get encoded into 6 bits.
				bits = 6;
			
			if (Number.isNaN(n))
				throw new EncodingError(`String contains characters outside the alphanumeric mode charset: "${g}" in "${str}"`);
			
			// bits within each group are stored big-endian
			for (let shift = bits - 1; shift >= 0; shift--)
				data[next++] = (n >>> shift) & 0x1;
		}
		return data;
	}

	/**
	 * @param {string} str A string containing valid numeric characters (i.e. 0-9).
	 * @return {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 */
	static numeric(str) {
		if (/\D/.test(str))
			throw new EncodingError(`Only 0-9 can be encoded in numeric mode: "${str}"`);
		let data = new Uint8Array(DataSize.numeric(str.length));
		let next = 0;
		for (let i = 0; i < str.length; i += 3) {
			// Split the number into 3 (decimal) digit groups, except maybe the last group, which may get truncated.
			// Do *not* remove leading 0's from each group! Only the final group can be less than 3 (decimal) digits.
			let g = str.substring(i, i + 3);

			// 1, 2, and 3 (decimal) digit numbers get packed into 4, 7, and 10 bits (respectively).
			let bits = g.length === 3 ? 10 : g.length === 2 ? 7 : 4;

			// bits within each group are stored big-endian
			n = Number(g);
			for (let shift = bits - 1; shift >= 0; shift--)
				data[next++] = (n >>> shift) & 0x1;
		}
		return data;
	}

	/**
	 * @param {string} str A String containing characters from the Shift JIS character set.
	 * @returns {ArrayLike<number>} An array of bits representing the encoded bitstream.
	 */
	static kanji(str) {
		throw Error("TODO: Unimplemented");  // TODO
	}
}
