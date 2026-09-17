
/**
 * Converts an unsigned integer to it's hexidecimal string representation.
 * If the parameter is not an unsigned integer, it simply calls toString()
 * @param {*} n An unsigned integer
 * @param {number} digits (optional) A number of hexidecimal digits (zero-padded).
 * @returns {string} prepened with "0x" if a hexidecimal convertion took place.
 */
export function hex(n, digits=0) {
	if (Number.isInteger(n) && n >= 0) {
		let str = n.toString(16);
		str = "0".repeat(Math.max(digits - str.length, 0)) + str
		return "0x" + str;
	}
	return mode.toString();
}

/**
 * Generators all valid index combinations from the given dimensions.
 * @param {ArrayList<number>} dims 
 * @returns {Generator<ArrayLike<number>>}
 */
export function* nIndex(dims) {
	// if any entry is non-positive, nindex is empty
	for (let i = 0; i < dims.length; i++)
		if (dims[i] <= 0)
			return;
	
	let idx = new Uint32Array(dims.length);  // [0, 0, ..., 0]

	// if no dimensions are given, there is exactly 1 nindex, []
	if (dims.length === 0) {
		yield idx;
		return;
	}

	while (true) {
		yield idx;
		let k = idx.length - 1;
		while (true) {
			if (++idx[k] < dims[k])
				break;
			idx[k--] = 0;  // reset kth position, and move up one position.
			if (k < 0)
				return;  // no more nindex combinations
		}
	}
}

/**
 * @param {*} T Underlying data type, e.g. Uint32Array 
 * @param {Array<number>} dims Dimensions, e.g. [10, 4, 2] would make an array of 10 4-by-2 matricies.
 * @returns {Array | T} An n-dimensional array (with n === dims.length) where each element points to a subarray of one contiguous T array.
 */
export function contiguousTensor(T, dims) {
	let n = 1;
	for (let size of dims)
		n *= size;
	const buffer = new T(n);  // e.g. new Uint8Array(n)

	if (dims.length <= 1)
		return buffer;  // a 1-D tensor is just the buffer

	let tensor = new Array(dims[0]);
	for (let idx of nIndex(dims.slice(0, -1))) {  // e.g. [2, 3, *] meaning matrix 2, row 3, column (ignored)
		let offset = idx[0];  // where to point in the buffer, e.g. tensor[2][3] = buffer.subarray(2 * dims[1] * dims[2] + 3 * dims[2] + 0, dims[2])
		let subtensor = tensor;  // follow with pointer
		for (let k = 1; k < dims.length - 1; k++) {  // ignore last idx
			offset = offset * dims[k] + idx[k];
			subtensor = subtensor[idx[k - 1]] ??= new Array(dims[k]);
		}
		offset *= dims[dims.length - 1];
		subtensor[idx[dims.length - 2]] = buffer.subarray(offset, offset + dims[dims.length - 1]);
	}
	return tensor;
}
