
/**
 * Converts an unsigned integer to it's hexidecimal string representation.
 * If the parameter is not an unsigned integer, it simply calls toString()
 * @param {*} n An unsigned integer
 * @param {number} digits (optional) A number of hexidecimal digits (zero-padded).
 * @returns {string} prepened with "0x" if a hexidecimal convertion took place.
 */
export function hex(n, digits=0) {
	if (Number.isInteger(n) && n >= 0) {
		str = n.toString(16);
		str = "0".repeat(Math.max(digits - str.length(), 0)) + str
		return "0x" + str;
	}
	return mode.toString();
}
