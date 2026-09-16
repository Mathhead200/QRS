import { validateVersion } from "./QRCode.js";

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
	static BLACK = "black";
	static WHITE = "white";

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
		for (let j = 0; j < 9; j++)
			if (j != 6)  // timing pattern
				this.modules[8][j] = new Module(null, Module.FORMAT_INFO);  // horizontal, left side
		for (let j = this.size - 8; j  < this.size; j++)
			this.modules[8][j] = new Module(null, Module.FORMAT_INFO);  // horizontal, right side
		for (let i = 0; i < 8; i++)
			if (i != 6)  // timing pattern
				this.modules[i][8] = new Module(null, Module.FORMAT_INFO);  // vertical, upper
		for (let i = this.size - 7; i < this.size; i++)
			this.modules[i][8] = new Module(null, Module.FORMAT_INFO);  // vertical, lower

		// 6. reserve: version info area
		if (version >= 7) {
			for (let i = 0; i < 6; i++)
				for (let j = 0; j < 3; j++)
					this.modules[i][this.size - 11 + j] = new Module(null, Module.VERSION_INFO);  // top-right
			for (let i = 0; i < 3; i++)
				for (let j = 0; j < 6; j++)
					this.modules[this.size - 11 - i][j] = new Module(null, Module.VERSION_INFO);  // bottom-left
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

	/** Get mask 0 as an affine transformation vector. */
	mask0() {
		const dataModules = new Array(this.dataBits);
		this.forEach((m, i, j) => {
			dataModules[m.index] = Number((i + j) % 2 === 0);
		});
	}
}
