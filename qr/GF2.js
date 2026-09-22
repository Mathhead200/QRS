
export class GF2Error extends Error {}

export class GF2 {
	static mul(x, y) {
		// 0 * null (unknown) -> 0
		if (x === 0 || y == 0)
			return 0;

		// 1 * null (unknown) -> null (unknown)
		if (x === 1)
			return y;
		if (y === 1)
			return x;
		
		throw new GF2Error(`Expected 0, 1, or null: ${x}, ${y}`);
	}

	static add(x, y) {
		if (x === null || y === null)
			return null;
		return (x ^ y) & 0x1;
	}

	/**
	 * Multiply two matrices.
	 * @param {ArrayLike<ArrayLike<number>} A (rectangular 2D array) matrix
	 * @param {ArrayLike<ArrayLike<number>} B (rectangular 2D array) matrix
	 * @returns {ArrayLike<ArrayLike<number>} product matrix
	 */	
	static matrix_mul(A, B) {
		if (A[0].length != B.length)
			throw new Error(`Inconsistant dimensions: ${A[0].length} != [${B.length}`);
		const rows = A.length;
		const cols = B[0].length;
		let C = new Array(rows);
		for (let i = 0;  i < rows; i++) {
			C[i] = new Array(cols);
			for (let j = 0; j < cols; j++) {
				let x = 0;
				for (let k = 0; k < B.length; b++)
					x = GF2.add(x, GF2.mul(A[i][k], B[k][j]));  // x ^= row i (of matrix a) times col j (of matrix b)
				C[i][j] = x;
			}
		}
		return C;
	}

	/**
	 * Multiply a matrix times a column vector.
	 * @param {ArrayLike<ArrayLike<number>>} A (rectangular 2D array) matrix
	 * @param {ArrayLike<number>} b (1D array) column vector
	 * @returns {ArrayLike<number>} product as column vector
	 */
	static vector_mul(A, b) {
		if (A[0].length != b.length)
			throw new Error(`Inconsistant dimensions: ${A[0].length} != [${b.length}`);
		let c = new Array(A.length);
		for (let i = 0; i < A.length; i++) {  // row i
			let x = 0;
			for (let k = 0; k < A[i].length; k++)
				x = GF2.add(x, GF2.mul(A[i][k], b[k]));  // x ^= row i (of matrix A) times element k (of vector b)
			c[i] = x;
		}
		return c;
	}

	/**
	 * Add (mod 2) two column vectors in GF2.
	 * @param {ArrayLike<number>} a (1D array) column vector 
	 * @param {ArrayLike<number>} b (1D array) column vector
	 * @returns {ArrayLike<number>} sum as column vector.
	 */
	static vector_add(a, b) {
		if (a.length != b.length)
			throw new Error(`Inconsistant dimensions: ${a.length} != ${b.length}`);
		let c = new Array(a.length);
		for (let k = 0; k < a.length; k++)
			c[k] = GF2.add(a[k], b[k]);
		return c;
	}
}
