
// QR code generation parameters:
// 1. Mode (i.e. data type) byte, alphanumeric, numeric, kanji
// 2. Version (i.e. size): 1 through 40
// 3. Error correction level: L, M, Q, H
// 4. Mask: 0 through 7

// Algorithm for QR code generation:
// 1. Encode data into bit stream. The maximum length of this bitstream is defined by the above parameters.
// 2. Apply Reed-Soloman error correction
// 3. Structure the message
// 4. Modual placment
// 5. Mask the data
// 6. Add format and version information

/**
 * @param {Number[]} bytes An array of Numbers in the interval [0, 255].
 * @return {Number[]} An array representing the input bitstream, x, to the QR code algorithm.
 */
function encodeBytes(bytes) {
	return [];  // TODO: stub
}

/**
 * @param {String} str A string containing valid alphanumeric characters as specified by the QR code spec. ISO 18004.
 * @return An array representing the input bitstream, x, to the QR code algorithm.
 */
function encodeAlphanumeric(str) {
	return [];  // TODO: stub
}

function encodeNumeric(str) {
	return [];  // TODO: stub
}

function encodeKanji(str) {
	return [];  // TODO: stub
}
