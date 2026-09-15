import { GF256 } from "./GF256.js";

/**
 * Used to apply the Reed-Solomon error correction used by QR codes.
 */
export class ReedSolomon {
	/**
	 * @param {number} k Message size, i.e. the number of *bytes* per block
	 * @param {number} E Parity size/EC symbols, i.e. number of "check" *bytes* added to each block
	 * @param {GF256} gf Galios Field, GF(256), includes a primitive polynomial, P, and a specific generator, alpha. 
	 * @returns {ArrayLike<ArrayLike<number>>} a matrix of bits in GF(2)
	 */
	static matrix(k, E, gf = GF256.QR) {
		const rows = 8 * (k + E);
		const cols = 8 * k;
		let buffer = new Uint8Array(rows * cols);

		// Build top of half of matrix: identity matrix, I_{8k}
		for (let i = 0; i < cols; i++)
			buffer[i * cols + i] = 0x01;  // matrix[i][i] = 0x01

		// Build bottom of half of matrix using polynomial division (divide all basis polynomials by generator)
		const generator = gf.generator(E);  // length === E + 1, e.g. (gf = GF265.QR, E=2) generator = (0x01)x^2 + (0x03)x + (0x02)
		for (let j = 0; j < k; j++) {
			// each basis block associates with a column in the output matrix
			let rem = new Array(k - j + E).fill(0);  // start as basis polynomial, e.g. (k=3, E=2, i=0), rem = (0x01)x^4 + (0x00)x^3 + ... + (0x00)
			rem[0] = 0x01;

			// polynomial division
			while (rem.length > E) {  // Basis stores the remainder as we proceed with the division algorithm. Stop when the degree of the remainder gets too small. e.g. deg(basis) == basis.length - 1 == 4 > (E=2)
				if (rem[0] !== 0)     // Skip this divide-multiply-subtract step if leading term is 0.
					for (let i = E - 1; i >= 0; i--)  // generator[0] is always 1, so skip division for efficiency. NOTE: loop is backwards to avoid thrashing rem[0]!
						rem[i] ^= gf.mul(rem[0], generator[i]);  // Multiply leading term of remainder (basis[0]) by divisor (generator), and subtract (XOR) to get the new remainder. e.g. [(0x01)x^4 + ...] - (0x01) * [(0x01)x^2 + (0x03)x + (0x02)] = [(0x01)x^4 + (0x00)x^3 + (0x01)x^2 + (0x03)x + (0x02)]
				rem.shift();  // Remove leading term. This is the quotient, and we don't care about it. e.g. shift (0x01)x^4 --> basis = (0x00)x^3 + (0x01)x^2 + (0x03)x + (0x02)
			}  // Repeat, e.g. next iteration will skip since (0x00)x^3 is 0, and obly shift off that term, etc. 

			// convert the remainder's coefs. to their associated mul. matrices in GF(2) and store as column of output transformation matrix
			// ASSERT: rem.length === E
			for (let i = 0; i < E; i++) {
				let submatrix_ij = gf.gf2_matrix(rem[i]);  // 8-by-8
				for (let i_offset = 0; i_offset < 8; i_offset++)
					for (let j_offset = 0; j_offset < 8; j_offset++)
						buffer[(8 * (k + i) + i_offset) * cols + (8 * j + j_offset)] = submatrix_ij[i_offset][j_offset];
			}
		}

		// Convert to 2D array of arrays interface
		let matrix = new Array(rows);
		for (let i = 0; i < rows; i++)
			matrix[i] = buffer.subarray(i * cols, (i + 1) * cols);
		return matrix;
	}
}
