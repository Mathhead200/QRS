
/**
 * Math for Galios Field, GF(256)
 */
export class GF256 {
	/**
	 * Log table.
	 * The array stores each GF(256) log (base alpha).
	 * @type {Array<number>}
	 */
	_logs = null;  // (lazy constructed) new Uint8Array(256)

	/**
	 * Counterpart to log table, but for powers of alpha.
	 * @type {Uint8Array}
	 */
	_exps = null;  // (lazy constructed) new Uint8Array(255)

	/**
	 * Dynamic programming cache for generator polynomials.
	 * The array stores each generator polynomial up to the last computed degree, 0 to E.
	 * The elements of the outer array at index E, correspond the generator polynomial of degree E and will have length == E + 1.
	 * e.g. [1, x - 1, (x - 1)(x - 2), ...] == [[0x1], [0x01, 0x02], [0x01, 0x03, 0x02], ...]
	 * 	Note: in GF(256), -0x03 == 0x03, and in general -x == x, b.c. addition is defined as XOR, ^.
	 * @type {Array<Uint8Array> | null}
	 */
	_generators = [new Uint8Array(1).fill(0x01)];

	/**
	 * Cache of (flattened) column vector representations of each GF(256) element.
	 * Maps (uint8) x -> Uint8Array.subarray(8 * x, 8 * x + 8)
	 * Note: the vector representation of GF(256) elements does not depend on P.
	 * @type {Uint8Array | null}
	 */
	static _vectors = null;  // (lazy constructed) new Uint8Array(256 * 8);

	/**
	 * Similar to vector cache, but for matrix mappings.
	 * Each element is an 8-by-8 bit matrix.
	 * @type {Array<Array<ArrayLike<number>>> | null}
	 */
	_matrices = null;  // (lazy constructed)

	/**
	 * Construct a specific GF(256) field using an optional primitive polynomial.
	 * Note: there are actully 16 valid primitive polynomials that create 16 distinct, but isomorphic fields of size 256.
	 * 	Any of these could be called GF(256).
	 * By default, the cannonical P=0x11D is used.
	 * @param {number} P primitive polynomial for GF(256) as uint9. Must be
	 * 	1. 8th degree, i.e. 0x100 <= P < 0x200
	 * 	2. Primative over GF(256), i.e. alpha^n (mod P) generates the full field for 0 <= n < 255
	 * 	There are 16 valid 8th degree primitive polynomials for GF(256).
	 * 	The primitive polynomial defined by the QR code spec., ISO 18004,
	 * 	and the cannonical choice for Reed-Solomon in general is P = 0x11D.
	 * @param {number} alpha a generator element of this GF(256) field.
	 * 	The generator defined by the QR code spec., and the cannonical choice for P = 0x11D is alpha = 0x02.
	 * 	In general, a generator must be found, and is not unique fo a given P, so one must be selected.
	 */
	constructor(P = 0x11D, alpha = 0x02) {
		this.P = P & 0xFF;  // we only need the low-8 bits of P
		this.alpha = alpha;
	}

	/**
	 * Globally sharable instance.
	 * Follows the code QR code spec., ISO 18004.
	 */
	static QR = new GF256();

	// TODO: add more specifications as needed

	_ensureExpLog() {
		if (this._logs === null) {
			// generate full log/exp table once
			this._exps = new Uint8Array(255);
			this._logs = new Array(256);
			this._logs[0] = NaN;  // log(0) is undefined
			let x = 0x01;
			for (let n = 0; n < 255; n++) {
				this._exps[n] = x;
				this._logs[x] = n;
				x = this.mulA(x);
			}
		}
	}

	/**
	 * @param {number} n (int) in Z_255
	 * @returns {number} (uint8) in Z_255
	 */
	static mod255(n) {
		return ((n % 255) + 255) % 255;
	}

	/**
	 * Multiply x by any alpha in GF(256) using bitwise multiplication (mod P), i.e.
	 * 	Russian Peasant Algorithm. Operates without relying on log/exp tables.
	 * @param {number} x (uint8) in GF(256)
	 * @param {number} alpha (uint8) in GF(256), by default is the generator, this.alpha.
	 * @returns {number} (uint8) in GF(256)
	 */
	mulA(x, alpha = this.alpha) {
		x = x & 0xFF;
		
		let prod = 0;
		for (let i = 0; i < 8; i++) {
			if ((alpha >>> i) & 0x01)  // check i-th bit of alpha
				prod ^= x;

			// shift x left by 1 and reduce mod P if high bit was set
			const reduce = x & 0x80;  // bool
			x = (x << 1) & 0xFF;
			if (reduce)
				x ^= this.P;
		}
		return prod;
	}

	/**
	 * Multiply ab in GF(256). By definition this is (ab) (mod P).
	 * @param {number} a (uint8) in GF(256)
	 * @param {number} b (uint8) in GF(256)
	 * @returns {number} (uint8) in GF(256)
	 */
	mul(a, b) {
		if (a === 0 || b === 0)
			return 0;  // log lookup will fail since log(0) is undefined (NaN)
		return this.exp((this.log(a) + this.log(b)) % 255);
	}

	/**
	 * Compute <code>a</code> raised to the <code>x</code> in GF(256).
	 * @param {number} x base (uint8) in GF(256)
	 * @param {number} n exponent (int) in Z_255
	 * @returns {number} (uint8) in GF(256)
	 */
	pow(x, n) {
		if (x === 0)
			return 0;  // log lookup will fail since log(0) is undefined (NaN)
		return this.exp(GF256.mod255(this.log(x) * n));
	}

	/**
	 * Compute alpha raised to the n in GF(256).
	 * @param {number} n exponent (int) in Z_255
	 * @returns {number} (uint8) in GF(256)
	 */
	exp(n) {
		this._ensureExpLog();
		return this._exps[GF256.mod255(n)];
	}

	/**
	 * Compute log base alpha of x in GF(256).
	 * @param {number} x (uint8) in GF(256)
	 * @returns {number} (uint8) in Z_255
	 */
	log(x) {
		this._ensureExpLog();
		return this._logs[x & 0xFF];
	}

	/**
	 * Compute the generator polynomial of degree E used by Reed-Solomon error correction.
	 * @param {number} E number of error correction bytes
	 * @returns {ArrayLike<number>} coeficients of the generator polynomial of degree E in big-endian (i.e. "standard") order
	 */
	generator(E) {
		if (E < this._generators.length)
			return this._generators[E];  // already solved
		
		// solve recursively
		let c = this.generator(E - 1);  // recursion: previous coefs
		let coefs = new Uint8Array(E + 1);
		coefs[0] = c[0];
		const alpha = this.exp(E - 1);  // next root: alpha ** (E - 1)
		for (let i = 1; i < E; i++)
			coefs[i] = c[i] ^ this.mul(c[i - 1], alpha);
		coefs[E] = this.mul(c[E - 1], alpha);

		return this._generators[E] = coefs;  // store result
	}

	/**
	 * Map GF(256) => GF(2)^8, an 8-dimensional (flattened) column vector over element-wise
	 * 	addition (XOR, ^), negation (~), and scalar multiplication (*).
	 * @param {number} x (uint8) in GF(256)
	 * @returns {ArrayLike<number>} in GF(2)^8 as an 8-element bit-stream (MSB first, uncompressed), with each element 0 or 1.
	 */
	static gf2_vector(x) {
		if (GF256._vectors === null) {
			// build all veectors at once
			GF256._vectors = new Uint8Array(256 * 8);
			let index = 0;
			for (let v = 0; v < 256; v++)     // each possible GF(256) element
				for (let i = 7; i >= 0; i--)  // each bit position
					GF256._vectors[index++] = (v >>> i) & 0x01;  // index == 8 * v + (7 - i)
		}
		let index = 8 * x;
		return GF256._vectors.subarray(index, index + 8);
	}

	/**
	 * Map GF(256) => M_{8x8}(GF(2)), an 8-8 matrix which represents field multiplication in GF(256). i.e.
	 * 	gf2_vector(mul(ab) in GF(256)) == gf2_matirx(a) * gf2_vector(b) in G(2)^8.
	 * @param {number} x (uint8) in GF(256)
	 * @returns {ArrayLike<ArrayLike<number>>} 8-by-8 bit matrix (array of arrays), with each element 0 or 1.
	 */
	gf2_matrix(x) {
		if (this._matrices === null) {
			// build all matrices at once
			let flat = new Uint8Array(256 * 64);  // store all actual data in one large flat buffer
			for (let v = 0; v < 256; v++) {       // each possible GF(256) element
				for (let j = 0; j < 8; j++) { 
					let basis = 0x01 << (7 - j);  // 0x02^(7 - j)
					let image = GF256.gf2_vector(this.mul(v, basis));  // image of basis as column vector (flattened)
					for (let i = 0; i < 8; i++)
						flat[64 * v + 8 * i + j] = image[i];
				}
			}
			
			this._matrices = new Array(256);
			for (let v = 0; v < 256; v++) {  // each possible GF(256) element
				let matrix = new Array(8);
				for (let i = 0; i < 8; i++) {
					let index = 64 * v + 8 * i;
					matrix[i] = flat.subarray(index, index + 8);
				}
				this._matrices[v] = matrix;
			}
		}
		return this._matrices[x];
	}
}
