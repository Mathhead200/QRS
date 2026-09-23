import { Module } from "../qr/RenderedQRCode.js";
import { GF2 } from "../qr/GF2.js";

const cmap = new Map([
	["white", Module.WHITE],
	["black", Module.BLACK]
]);

const form = document.querySelector("form#info");
const solve = form.querySelector("[type=submit]");

const svg = document.querySelector("svg#qrcode");

const _DEBUG = true;

// (Remainder Bits Transform) R * (EC Transform) T * x = y + (mask) m
// x: [DataSegment | NullSegment | padding]
// y: [DataSegment | NullSegment | padding | EC bits | remainder bits]

// R: Remainder Bits Transformation matrix is not important since the bottom
//    rows are not a function of T*x, and the top rows are the identity.

// T: We only care about the Error Correction rows since the top is a permuted
//    identity matrix which the user interface forces to match the similarly
//    permuted input, x.
let T = [];  // Error Correction Transformation matrix

// y: Again, we only care about the error correction bits (i.e. rows or elements).
let y = [];  // output vector

// x: We need the full input vector since the error correction rows operate all
//    of them. This is where the free variables (suffix and padding) will come from.
let x = [];  // input vector

// m: This needs to be stored so user drawn suffix, padding, or error correction
//    bits can be (un)masked. But it is not involved in the solver afte that.
let m = [];  // mask vector

let qrUpdate = null;  // .detail of last QRUpdate event
let qrDraw = null;    // .detail of last QRDraw event

svg.addEventListener("QRUpdate", event => {
	const { error, qrc, qrcBitStream, ecMatrix, bits, qr, mask } = qrUpdate = event.detail;
	if (solve.disabled = (error !== null)) {
		T = y = x = m = [];
		return;
	}

	x = qrcBitStream;
	T = ecMatrix.slice(qrc.size);
	y = bits.slice(qrc.size, qrc.size + qrc.ecBits);
	// m: defaults to all 0 mask (i.e. no mask) when mask is absent so solver
	// can procede in a simplified demo mode which ignores the masking step.
	m = (!Number.isNaN(mask)) ? qr.mask(mask) : new Uint8Array(y.length);

	if (_DEBUG) {  // DEBUG:
		console.log(event);
		console.log("x:", window.x = x);
		console.log("T:", window.T = T);
		console.log("y:", window.y = y);
		console.log("m:", window.m = m);
	}
});

svg.addEventListener("QRDraw", event => {
	const { edits, i0, j0, size, qrUpdate } = qrDraw = event.detail;
	const { qr } = qrUpdate;  // RenderedQRCode
	for (let [ij, color] of edits.entries()) {
		let [i, j] = ij.split(",").map(ele => +ele);
		i += i0;
		j += j0;
		if (0 <= i && i < size && 0 <= j && j < size) {
			const { index } = qr.modules[i][j];
			color = GF2.add(cmap.get(color), m[index]);
			if (index < x.length)
				x[index] = color;
			else
				y[index - x.length] = color;  // index shifted since y and T are sliced
		}
	}

	if (_DEBUG) {  // DEBUG:
		console.log(event);
		console.log("x:", window.x = x);
		console.log("y:", window.y = y);
	}
});

form.addEventListener("submit", event => {
	event.preventDefault();

	// Dot product rows of T with x to compute each equation, f_i(x) = y_i
	// Then split Tx into (coef) * x' = y - (solution) where x' = [x_0, x_1, ...], i.e. only free variables
	const coef = new Map();  // coefficients matrix for x' = [x_0, x_1, ...], ignoring "null" rows
	const dy = new Map();  // y - (particular solution, i.e. constants), ignoring "null" rows
	for (let i = 0; i < y.length; i++) {
		if (y[i] === null)
			continue;  // skip these rows since they don't constrain the solution space
		coef.set(i, new Uint8Array(x.length));
		dy.set(i, y[i]);
		for (let j = 0; j < x.length; j++) {
			let product = GF2.mul(T[i][j], x[j]);
			if (product !== null) {
				// assert: coef.get(i)[j] === 0  // move constant to right-hand side of equation, T'x' = y - constant
				dy.set(i, GF2.add(dy.get(i), product));  // + is same as - (both XOR) in GF2
			} else {
				coef.get(i)[j] = 1;  // coef.
			}
		}
	}

	// check for inconsistancies
	const inconsistancies = [];
	for (let [i, row] of coef)
		if ([...row].every(a => a === 0)) {
			if (dy.get(i) === 1)
				inconsistancies.push(i);
			coef.delete(i);  // 0 rows can be optimized away
		}
	if (inconsistancies.length !== 0)
		return reportInconsistencies(...inconsistancies);  // End early. No solution.


	// GF2 Gauss-Jordan Elimination, RREF, on non-null rows
	let rows = [...coef.keys()];  // indices of all non-null rows
	const pivots = new Map();  // row (i) -> pivot column (j)
	for (let j = 0; j < x.length; j++) {  // pivot columns in T
		// Find first row with pivot (1) in leading correct position, and row swap
		let p = null;  // (target row for swap) "pivot"
		for(let i of rows) {
			if (coef.get(i)[j] === 1) {  // we found a pivot!
				p = i;
				break;
			}
		}
		if (p === null)
			continue;  // This column has no pivot. Move to next column.

		const r = rows.shift();  // remove rows[0] from future consideration
		if (p !== r) {
			// row swap, row_p <-> row_r
			for (let map of [coef, dy]) {
				const temp = map.get(p);
				map.set(p, map.get(r));
				map.set(r, temp);
			}
		}
		pivots.set(r, j);
		
		// 0-out all elements above & below pivot
		const row_r = coef.get(r);
		const dy_r = dy.get(r);
		for (let [i, row_i] of coef) {
			if (i !== r && row_i[j] !== 0) {
				coef.set(i, GF2.vector_add(row_i, row_r));  // row-(multiply)-add, row_i += row_r (pivot)
				dy.set(i, GF2.add(dy.get(i), dy_r));
			}
		}
	}

	// calculate solution space
	const indVars = new Set(x.map((_, i) => i));
	for (let [i, j] of pivots)
		indVars.delete(j);
	x.forEach((x_j, j) => {
		if (x_j !== null)
			indVars.delete(j);
	});
	showSolutions(indVars);

	if (_DEBUG) {  // DEBUG:
		console.log(event);
		console.log("coef:", window.coef = coef);
		console.log("dy:", window.dy = dy);
		console.log("pivots:", window.pivots = pivots);
		console.log("indVars", window.indVars = indVars);
	}
});

/**
 * @param {Set<number>} indVars Set of indicies
 */
function showSolutions(indVars) {
	const { qr, modules } = qrUpdate;
	qr.forEach((m, i, j) => {
		const rect = modules[i][j];
		if (m.tag == Module.DATA) {
			rect.classList.remove("independent", "inconsistent");
			if (indVars.has(m.index))
				rect.classList.add("independent");
		}
	});
}

/**
 * @param  {...number} indices
 */
function reportInconsistencies(...indices) {
	console.warn("Inconsistant data bits @", indices);

	const { qr, modules } = qrUpdate;
	indices = new Set(indices);
	qr.forEach((m, i, j) => {
		const rect = modules[i][j];
		if (m.tag == Module.DATA) {
			rect.classList.remove("independent", "inconsistent");
			if (indices.has(m.index))
				rect.classList.add("inconsistent");
		}
	});
}
