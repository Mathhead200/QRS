import { Module } from "../qr/RenderedQRCode.js";
import { GF2 } from "../qr/GF2.js";

const cmap = new Map([
	["white", Module.WHITE],
	["black", Module.BLACK]
]);

const solve = document.querySelector("form#info [type=submit]");
const svg = document.querySelector("svg#qrcode");

// (Remainder Bits Transform) R * (EC Transform) T * x = y + (mask) m
// x: [DataSegment | NullSegment | padding]
// y: [DataSegment | NullSegment | padding | EC bits | remainder bits]
let R = [];  // Remainder Bits Transformation matrix
let T = [];  // Error Correction Transformation matrix
let y = [];  // output vector
let x = [];  // input vector
let m = [];  // mask vector

svg.addEventListener("QRUpdate", event => {
	const { error, bits, qrcBitStream, ecMatrix, qr, mask, remainder } = event.detail;
	if (solve.disabled = (error !== null))
		return;

	y = bits;
	x = qrcBitStream;
	T = ecMatrix;
	m = (!Number.isNaN(mask)) ? qr.mask(mask) : new Uint8Array(y.length);

	// create remainder bit transformation matrix
	R = new Array(bits.length);  // includes remainder bits
	for (let i = 0; i < T.length; i++) {  // top of matrix: ignoring remainder bit rows
		R[i] = new Array(T.length).fill(0);
		R[i][i] = 1;
	}
	for (let i = T.length; i < R.length; i++)  // bottom of matrix: remainder rows (if any)
		R[i] = new Array(T.length).fill(remainder ? null : 0);

	console.log(R, T, x, y, m);
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
			y[index] = color;
			if (index < x.length)
				x[index] = color;
		}
	}
});
