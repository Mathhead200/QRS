import { Module } from "../qr/RenderedQRCode.js";
import { GF2 } from "../qr/GF2.js";

const cmap = new Map([
	["white", Module.WHITE],
	["black", Module.BLACK]
]);

const form = document.querySelector("form#info");
const solve = form.querySelector("[type=submit]");

const svg = document.querySelector("svg#qrcode");

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

svg.addEventListener("QRUpdate", event => {
	const { error, qrc, qrcBitStream, ecMatrix, bits, qr, mask, remainder } = event.detail;
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
});

svg.addEventListener("QRDraw", event => {
	const { edits, i0, j0, size, qrUpdate } = event.detail;
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
});

form.addEventListener("submit", event => {
	event.preventDefault();
	console.log(T, x, y);  // TODO: stub

	// GF2 Gauss-Jordan Elimination with REF
	PIVOT: for (let j = 0; j < x.length; j++) {  // pivot columns in T
		// Find first row with pivot (1) in leading correct position, and row swap
		let i = j;
		for(;; i++) {
			if (i >= T.length)  continue PIVOT;  // No pivot available. Skip this column.
			if (T[i][j] === 1)  break;  // Found pivot on row i!
		}
		if (i !== j)
			for (let arr of [T, x, y])
				[arr[i], arr[j]] = [arr[j], arr[i]];  // row swap, row_i <-> row_j
		
		// 0-out all elements below pivot
		for (let i = j + 1; i < T.length; i++)
			if (T[i][j] !== 0) {
				T[i] = GF2.vector_add(T[i], T[j]);  // row-(multiply)-add, row_i += row_j
				x[i] = GF2.add(x[i], x[j]);
				y[i] = GF2.add(y[i], y[j]);
			}
	}
});
