import { validateECLevel, validateVersion } from "./QRCode.js";
import { QRCodeError } from "./QRCode.js";

export class QRCodeMaskError extends QRCodeError {}

export function validateMask(mask) {
	if (!Number.isInteger(mask) || mask < 0 || mask > 7)
		throw new QRCodeMaskError(`Invalid mask (expected 0-7): ${mask}`);
	return mask;
}

export class Module {
	// pre-defined tags
	static FINDER_PATTERN = "Finder Pattern";
	static SEPERATOR = "Seperator";
	static TIMING_PATTERN = "Timing Pattern";
	static ALIGNMENT_PATTERN = "Alignment Pattern";
	static DARK_MODULE = "Dark Module";
	static FORMAT_INFO = "Format";
	static VERSION_INFO = "Version";
	static DATA = "Data";  // codewords, error correction, and remainder bits

	// colors
	static WHITE = 0;
	static BLACK = 1;

	constructor(color, tag, index = null) {
		this.color = color;
		this.tag = tag;
		this.index = index;
	}
}

export class RenderedQRCode {
	static _ALIGNMENT_PATTERNS = [
		[],                             [6, 18],                        [6, 22],                        [6, 26],      // versions 1-4
		[6, 30],                        [6, 34],                        [6, 22, 38],                    [6, 24, 42],  // versions 5-8
		[6, 26, 48],                    [6, 28, 50],                    [6, 30, 54],                    [6, 32, 58],      // versions 9-12
		[6, 34, 62],                    [6, 26, 46, 66],                [6, 26, 48, 70],                [6, 26, 50, 74],  // versions 13-16
		[17, 6, 30, 54, 78],            [18, 6, 30, 56, 82],            [19, 6, 30, 58, 86],            [20, 6, 34, 62, 90],   // versions 16-20
		[6, 28, 50, 72, 94],            [6, 26, 50, 74, 98],            [6, 30, 54, 78, 102],           [6, 28, 54, 80, 106],  // versions 21-24
		[6, 32, 58, 84, 110],           [6, 30, 58, 86, 114],           [6, 34, 62, 90, 118],           [6, 26, 50, 74, 98, 122],   // versions 25-28
		[6, 30, 54, 78, 102, 126],      [6, 26, 52, 78, 104, 130],      [6, 30, 56, 82, 108, 134],      [6, 34, 60, 86, 112, 138],  // versions 29-32
		[6, 30, 58, 86, 114, 142],      [6, 34, 62, 90, 118, 146],      [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],  // version 33-36
		[6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],  // version 37-40
	];

	// https://www.thonky.com/qr-code-tutorial/mask-patterns
	static _MASKS = [
		(i, j) => (i + j) % 2 === 0,
		(i, j) => i % 2 === 0,
		(i, j) => j % 3 === 0,
		(i, j) => (i + j) % 3 === 0,
		(i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
		(i, j) => (i * j) % 2 + (i * j) % 3 === 0,
		(i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0,
		(i, j) => ((i + j) % 2 + (i * j) % 3) % 2 === 0
	];

	// Precomputed:
	// https://www.thonky.com/qr-code-tutorial/format-version-information
	// https://www.thonky.com/qr-code-tutorial/format-version-tables
	static _FORMATS = {
		     // Masks 0-7 for each ecLevel
		"L": [0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976],
		"M": [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0],
		"Q": [0x355F, 0x3068, 0x3F31, 0x3A06, 0x24B4, 0x2183, 0x2EDA, 0x2BED],
		"H": [0x1689, 0x13BE, 0x1CE7, 0x19D0, 0x0762, 0x0255, 0x0D0C, 0x083B]
	};

	// Precomputed:
	// https://www.thonky.com/qr-code-tutorial/format-version-tables
	static _VERSIONS = [
		/* Starts at version 7 ........................... */ 0x07C94, 0x085BC, 0x09A99, 0x0A4D3,  // versions 7-10
		0x0BBF6, 0x0C762, 0x0D847, 0x0E60D, 0x0F928, 0x10B78, 0x1145D, 0x12A17, 0x13532, 0x149A6,  // versions 11-20
		0x15683, 0x168C9, 0x177EC, 0x18EC4, 0x191E1, 0x1AFAB, 0x1B08E, 0x1CC1A, 0x1D33F, 0x1ED75,  // versions 21-30
		0x1F250, 0x209D5, 0x216F0, 0x228BA, 0x2379F, 0x24B0B, 0x2542E, 0x26A64, 0x27541, 0x28C69   // versions 31-40
	];

	/**
	 * QR code version
	 * @type {number}
	 */
	version;

	/**
	 * Rows and columns of (square) QR code
	 * @type {number}
	 */
	size;

	/**
	 * @type {Array<Array<Module>>}
	 */
	modules;

	/**
	 * Number of modules that can store data
	 * @type {number}
	 */
	dataBits;

	constructor(version) {
		this.version = validateVersion(version);
		this.size = 21 + 4 * (version - 1);
		this.modules = new Array(this.size);
		for (let i = 0; i < this.size; i++)
			this.modules[i] = new Array(this.size).fill(null);  // null to flag uninitialized so far

		const W = Module.WHITE;
		const B = Module.BLACK;

		// 1. finder patterns & seperators
		{	const PATTERN = [
				[B, B, B, B, B, B, B, W],
				[B, W, W, W, W, W, B, W],
				[B, W, B, B, B, W, B, W],
				[B, W, B, B, B, W, B, W],
				[B, W, B, B, B, W, B, W],
				[B, W, W, W, W, W, B, W],
				[B, B, B, B, B, B, B, W],
				[W, W, W, W, W, W, W, W]
			];
			let N = this.size - 1;
			for (let i = 0; i < 8; i++) {
				for (let j = 0; j < 8; j++) {
					const tag = (i < 7 && j < 7) ? Module.FINDER_PATTERN : Module.SEPERATOR;
					this.modules[0 + i][0 + j] = new Module(PATTERN[i][j], tag);  // top left
					this.modules[0 + i][N - j] = new Module(PATTERN[i][j], tag);  // top right
					this.modules[N - i][0 + j] = new Module(PATTERN[i][j], tag);  // bottom left
				}
			}
		}

		// 2. next place alignment patterns (but not on top of finder patterns or seperators)
		{	const PATTERN = [
				[B, B, B, B, B],
				[B, W, W, W, B],
				[B, W, B, W, B],
				[B, W, W, W, B],
				[B, B, B, B, B]
			];
			const locs = RenderedQRCode._ALIGNMENT_PATTERNS[version - 1].map(center => center - 2);
			for (let row of locs)
				for (let col of locs) {
					// first check if space is available
					let available = true;
					L: for (let i = 0; i < 5; i++)
						for (let j = 0; j < 5; j++)
							if (this.modules[row + i][col + j] !== null) {  // overlap!
								available = false;
								break L;
							}
					if (!available)
						continue;

					// place pattern
					for (let i = 0; i < 5; i++)
						for (let j = 0; j < 5; j++)
							this.modules[row + i][col + j] = new Module(PATTERN[i][j], Module.ALIGNMENT_PATTERN);
				}
		}

		// 3. next add the horizontal and vertical timing patterns
		for (let j = 8; j < this.size - 8; j++) {
			let color = (j % 2 === 0) ? B : W;
			this.modules[6][j] = new Module(color, Module.TIMING_PATTERN);  // horizontal (row, i === 6)
		}
		for (let i = 8; i < this.size - 8; i++) {
			let color = (i % 2 === 0) ? B : W;
			this.modules[i][6] = new Module(color, Module.TIMING_PATTERN);  // vertical (column, j === 6)
		}

		// 4. the dark module
		this.modules[this.size - 8][8] = new Module(B, Module.DARK_MODULE);

		// 5. reserve: format info area
		{	let index = 0;
			for (let j = 0; j < 8; j++)
				if (j != 6)  // timing pattern
					this.modules[8][j] = new Module(null, Module.FORMAT_INFO, index++);  // horizontal, left side
			for (let j = this.size - 8; j  < this.size; j++)
				this.modules[8][j] = new Module(null, Module.FORMAT_INFO, index++);  // horizontal, right side

			index = 14;
			for (let i = 0; i < 9; i++)
				if (i != 6)  // timing pattern
					this.modules[i][8] = new Module(null, Module.FORMAT_INFO, index--);  // vertical, upper
			for (let i = this.size - 7; i < this.size; i++)
				this.modules[i][8] = new Module(null, Module.FORMAT_INFO, index--);  // vertical, lower
		}

		// 6. reserve: version info area
		if (version >= 7) {
			for (let i = 0; i < 6; i++)
				for (let j = 0; j < 3; j++)
					this.modules[i][this.size - 11 + j] = new Module(null, Module.VERSION_INFO, j + 3 * i);  // top-right
			for (let i = 0; i < 3; i++)
				for (let j = 0; j < 6; j++)
					this.modules[this.size - 11 + i][j] = new Module(null, Module.VERSION_INFO, i + 3 * j);  // bottom-left
		}

		// 7. Place data bit in serpentine pattern
		{	let index = 0;
			let col = this.size - 1;

			while (col > 0) {
				// moving upward
				for (let i = this.size - 1; i >= 0; i--) {
					this.modules[i][col]     ??= new Module(null, Module.DATA, index++);
					this.modules[i][col - 1] ??= new Module(null, Module.DATA, index++);
				}
				col -= 2;
				if (col === 6)  // Note: col is always even (4k - 2 specifically) b.c. size - 1 is a multiple of 4.
					col--;  // skip vertical timing pattern

				// moving downward
				for (let i = 0; i < this.size; i++) {
					this.modules[i][col]     ??= new Module(null, Module.DATA, index++);
					this.modules[i][col - 1] ??= new Module(null, Module.DATA, index++);
				}
				col -= 2;
			}

			this.dataBits = index;  // store total number of modules that have data
		}

		// Assert: for all i,j, this.modules[i][j] should be non-null and type Module
	}

	forEach(callback) {
		for (let i = 0; i < this.size; i++)
			for (let j = 0; j < this.size; j++)
				callback(this.modules[i][j], i, j);
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.size; i++)
			for (let j = 0; j < this.size; j++)
				yield this.modules[i][j];
	}

	/**
	 * Get mask n as an affine transformation vector.
	 * @param {number} n (uint3) between 0 and 7 (inclusive)
	 * @returns {ArrayLike<number>} uncompressed bit stream as (flattened) column vector
	 */
	mask(n) {
		const mask = RenderedQRCode._MASKS[validateMask(n)];  // predicate
		const vec = new Uint8Array(this.dataBits);
		this.forEach((m, i, j) => {
			if (m.tag === Module.DATA)
				vec[m.index] = Number(mask(i, j));
		});
		return vec;
	}

	/**
	 * Sets the reserved FORMAT_INFO and VERSION_INFO modules.
	 * @param {string} ecLevel "L", "M", "Q", or "H"
	 * @param {number} mask 0-7
	 */
	setFormat(ecLevel, mask) {
		validateECLevel(ecLevel);
		validateMask(mask);
		
		let bits = RenderedQRCode._FORMATS[ecLevel][mask];  // 15 bits
		for (let m of this)
			if (m.tag === Module.FORMAT_INFO)
				m.color = (bits >> (14 - m.index)) & 0x01;

		if (this.version >= 7) {
			bits = RenderedQRCode._VERSIONS[this.version - 7];  // 18 bits
			for (let m of this)
				if (m.tag === Module.VERSION_INFO)
					m.color = (bits >> (17 - m.index)) & 0x001;
		}
	}
}

// TODO: Penalty Score
// TODO: Quiet Zone
