
/**
 * Used to apply the Reed-Solomon error correction used by QR codes.
 */
export class ReedSolomon {
	/**
	 * Log table for each principle polynomial.
	 * Maps (principle polynomial) -> Array[256]
	 * The array stores each GF(256) log (base 0x02).
	 */
	static gf_logs = new Map();

	/**
	 * Dynamic programming cache for generator polynomials.
	 * Maps (principle polynomial) -> Array
	 * The array stores each generator polynomial up to the last computed degree, 0 to E.
	 */
	static generators = new Map();

	/**
	 * Multiply x by 0x02 in  GF(256).
	 * @param {number} x uint8
	 * @param {number} P principle polynomial for GF(256) as uint9
	 * @returns {number} uint8
	 */
	static gf_mul2(x, P = 0x11D) {
		let prod = (x << 1) & 0xFF;
		if (x & 0x80)
			prod ^= P & 0xFF;
		return prod;
	}

	static gf_mul(a, b, P = 0x11D) {
		return gf_exp((gf_log(a) + gf_log(b)) % 255);
	}

	static gf_log(x, P = 0x11D) {
		let arr = ReedSolomon.gf_logs.get(P);
		if (arr === undefined) {
			// generate full log table once for each principle polynomial
			arr = new Array(256);
			arr[0] = NaN;  // log(0) is undefined
			let prod = 0x01;
			for (let pow = 0; pow < 255; pow++) {
				arr[prod] = pow;
				prod = gf_mul2(prod);
			}
			ReedSolomon.gf_logs.set(P, arr);
		}
		return arr[x];
	}

	static generator(E, P = 0x11D) {
		let arr = ReedSolomon.generators.get(P);
		if (arr === undefined)
			ReedSolomon.generators.set(P, arr = [[1]]);
		if (E < arr.length)
			return arr[E];  // already solved
		// solve recursively
		coefs = ReedSolomon.generator(E - 1, P);
		// TODO: ...
	}

	/**
	 * 
	 * @param {number} k Message size, i.e. the number of bytes per block
	 * @param {number} E Parity size/EC symbols, i.e. number of "check" bytes added to each block
	 * @param {number} P Primitive polynomial. Must be
	 * 	1. 8th degree, i.e. 0x100 <= PP < 0x200
	 * 	2. Primative over GF(256), i.e. 0x02^k (mod PP) generates the full field for 0 <= k < 256
	 * 	There are 16 valid 8th degree primitive polynomials for GF(256).
	 * 	The primitive polynomial defined by the QR code spec., ISO 18004,
	 * 	and the cannonical choice for Reed-Solomon in general is 0x11D.
	 * 
	 * @returns {ArrayLike<ArrayLike<number>>} a matrix of bytes in GF(256)
	 */
	static matrix(k, E, P = 0x11D) {
		const rows = k + E;
		const cols = k;
		let buffer = new Uint8Array(rows * cols);

		// Build top of half of matrix: identity matrix, I_8k
		for (let i = 0; i < cols; i++)
			buffer[i * cols + i] = 0x01;  // matrix[i][i] = 0x01

		// Build bottom of half of matrix
		// TODO: ...

		// Convert to 2D array of arrays interface
		let matrix = new Array(rows);
		for (let i = 0; i < rows; i++)
			matrix[i] = buffer.subarray(i * cols, (i + 1) * cols);
		return matrix;
	}
}
