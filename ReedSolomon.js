
/**
 * Math for Galios Field, GF(256)
 */
export class GF256 {
	/** Similar to log table, but for powers of 0x02. */
	static _exps = new Map();

	/**
	 * Log table for each principle polynomial.
	 * Maps (principle polynomial) -> Array[256]
	 * The array stores each GF(256) log (base 0x02).
	 */
	static _logs = new Map();

	/**
	 * Dynamic programming cache for generator polynomials.
	 * Maps (principle polynomial) -> Array
	 * The array stores each generator polynomial up to the last computed degree, 0 to E.
	 */
	static _generators = new Map();

	static _ensureExpLog(P) {
		if (GF256._logs.get(P) === undefined) {
			// generate full log table once for each principle polynomial
			let exps = new Array(255);
			let logs = new Array(256);
			let prod = 0x01;
			for (let pow = 0; pow < 255; pow++) {
				exps[pow] = prod;
				logs[prod] = pow;
				prod = GF256.mul2(prod, P);
			}
			logs[0] = NaN;  // log(0) is undefined
			GF256._exps.set(P, exps);
			GF256._logs.set(P, logs);
		}
	}

	/**
	 * Multiply x by 0x02 in  GF(256).
	 * @param {number} x uint8
	 * @param {number} P principle polynomial for GF(256) as uint9
	 * @returns {number} uint8
	 */
	static mul2(x, P = 0x11D) {
		x &= 0xFF;
		let prod = (x << 1) & 0xFF;
		if (x & 0x80)
			prod ^= P & 0xFF;
		return prod;
	}

	static mul(a, b, P = 0x11D) {
		if (a === 0 || b === 0)
			return 0;
		return GF256.exp((GF256.log(a, P) + GF256.log(b, P)) % 255, P);
	}

	static pow(a, x, P = 0x11D) {
		if (a === 0)
			return 0;
		return GF256.exp((GF256.log(a, P) * x) % 255, P);
	}

	static exp(x, P = 0x11D) {
		GF256._ensureExpLog(P);
		return GF256._exps.get(P)[x % 255];
	}

	static log(x, P = 0x11D) {
		GF256._ensureExpLog(P);
		return GF256._logs.get(P)[x & 0xFF];
	}

	/**
	 * @param {number} E number of error correction bytes
	 * @param {number} P principle polynomial
	 * @returns {ArrayLike<number>} coeficients of the generator polynomial of degree E in big-endian (i.e. "standard") order
	 */
	static generator(E, P = 0x11D) {
		let generators = GF256._generators.get(P);
		if (generators === undefined)
			GF256._generators.set(P, generators = [[1]]);
		if (E < generators.length)
			return generators[E];  // already solved
		
		// solve recursively
		let c = GF256.generator(E - 1, P);  // recursion: previous coefs
		let coefs = new Array(E + 1);
		coefs[0] = c[0];
		const alpha = GF256.exp(E - 1, P);  // next root: 0x02 ** (E - 1)
		for (let i = 1; i < E; i++)
			coefs[i] = c[i] ^ GF256.mul(c[i - 1], alpha, P);
		coefs[E] = GF256.mul(c[E - 1], alpha, P);

		return generators[E] = coefs;  // store result
	}
}

/**
 * Used to apply the Reed-Solomon error correction used by QR codes.
 */
export class ReedSolomon {
	/**
	 * 
	 * @param {number} k Message size, i.e. the number of bytes per block
	 * @param {number} E Parity size/EC symbols, i.e. number of "check" bytes added to each block
	 * @param {number} P Primitive polynomial. Must be
	 * 	1. 8th degree, i.e. 0x100 <= P < 0x200
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

		// Build bottom of half of matrix using polynomial division
		const generator = GF256.generator(E, P);  // length === E + 1
		for (let i = 0; i < k; i++) {
			// each basis block associates with a column in the output matrix
			let basis = new Array(k - i + E).fill(0);
			basis[0] = 0x01;

			// polynomial division
			while (basis.length > E) {
				if (basis[0] !== 0)
					for (let j = 0; j <= E; j++)
						basis[j] ^= GF256.mul(basis[0], generator[j], P);
				basis.shift();
			}

			// store remainder (basis) as column
			for (let j = 0; j < E; j++)
				buffer[(k + j) * cols + i] = basis[j];
		}

		// Convert to 2D array of arrays interface
		let matrix = new Array(rows);
		for (let i = 0; i < rows; i++)
			matrix[i] = buffer.subarray(i * cols, (i + 1) * cols);
		return matrix;
	}
}
