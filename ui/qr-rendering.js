
import { Module, RenderedQRCode } from "../qr/RenderedQRCode.js"
import { DataSegment, NullSegment, QRCode, Segment, appendBuffer } from "../qr/QRCode.js";
import { EncodeData } from "../qr/EncodeData.js"
import { DataSize } from "../qr/DataSize.js";

const UTF8 = new TextEncoder();

const form = document.querySelector("form#info");
const fields = Object.fromEntries(
	["#version", "#ecLevel", "#mask", "#mode", "#data", "#suffix", "#padding"]
		.map(q => form.querySelector(q))
		.map(ele => [ele.id, ele])
);

const svg = document.querySelector("svg#qrcode");
let modules = [];  // svg elements, e.g. <rect>
let qr = null;  // RenderedQrCode object

function buildQR(shape = "rect", scale = 100) {
	qr = new RenderedQRCode(+fields.version.value);
	modules = new Array(qr.size);
	svg.innerHTML = "";  // empty <svg>
	{	let a = -4 * scale;
		let b = (qr.size + 8) * scale;
		svg.setAttribute("viewBox", `${a} ${a} ${b} ${b}`);
	}
	for (let i = 0; i < qr.size; i++) {
		modules[i] = new Array(qr.size);
		for (let j = 0; j < qr.size; j++) {
			let m = qr.modules[i][j];
			let rect = document.createElementNS("http://www.w3.org/2000/svg", shape);
			rect.setAttribute("x", j * scale);
			rect.setAttribute("y", i * scale);
			rect.setAttribute("width", scale);
			rect.setAttribute("height", scale);
			rect.classList.add("module");
			if ((i + j) % 2 !== 0)
				rect.classList.add("odd");
			let title = document.createElementNS("http://www.w3.org/2000/svg", "title");
			title.textContent = m.tag;
			if (m.index !== null)
				title.textContent += ` (${m.index})`;
			rect.append(title);
			svg.append(rect);
			modules[i][j] = rect;

			// TODO: add drawing events to svg module elements, e.g. <rect>.onclick
		}
	}
}

function updateQR() {
	const version = +fields.version.value;
	const ecLevel = fields.ecLevel.value;
	const mask = fields.mask.valueAsNumber;  // NaN if empty ""
	const mode = +fields.mode.value;
	const data = fields.data.value;
	const suffix = +fields.suffix.value;
	const padding = fields.padding.checked;

	// color format and version modules
	const RESERVED = -1;  // a special reserved "color"
	if (!Number.isNaN(mask)) {
		qr.setFormat(ecLevel, mask);
	} else {
		for (let m of qr)
			if (m.tag === Module.FORMAT_INFO || m.tag === Module.VERSION_INFO)
				m.color = RESERVED;
	}
	
	// encode data and build QRCode so we can color data modules
	let bits = [];  // bit stream
	fields.data.classList.remove("error");
	try {
		// encode data, and determine suffix size
		let suffixBits;
		switch (mode) {
			case Segment.NUMERIC:
				if (data.length % 3 !== 0)
					throw new Error("NUMERIC encoding only linear in blocks of 3 digits.");
				bits = EncodeData.numeric(data); 
				suffixBits = DataSize.numeric(suffix);
				break;
		
			case Segment.ALPHANUMERIC:
				if (data.length % 2 !== 0)
					throw new Error("ALPHANUMERIC encodinng only linear in blocks of 2 characters.")
				bits = EncodeData.alphanumeric(data);
				suffixBits = DataSize.alphanumeric(suffix);
				break;
		
			case Segment.BYTE:
				bits = EncodeData.bytes(UTF8.encode(data));
				suffixBits = DataSize.bytes(suffix);
				break;
		
			case Segment.KANJI:
				break;  // TODO: Kanji not implemented!
		}

		// add suffix as "null" bits
		{	const buf = new Array(bits.length + suffixBits).fill(null);  // suffix bits are null
			appendBuffer(bits, buf, 0);
			bits = buf;
		}

		// add segment header
		let s = new DataSegment(version, mode, data.length + suffix, bits);
		bits = s.bitStream();

		// add NullSegment
		let eom;  // End of Message: NullSegment
		let qrSize;
		{	const { codewords } = QRCode.ecCharacteristics({ version, ecLevel });
			qrSize = 8 * codewords;  // ignoring error codewords
			eom = new NullSegment(Math.min(qrSize - s.size, 4));
			
			const buf = new Array(s.size + eom.size);
			let offset = appendBuffer(bits, buf, 0);
			appendBuffer(eom.bitStream(), buf, offset);
			bits = buf;
		}

		// use non-stansard padding (i.e. null bits), or standard padding
		const p = (padding) ? new Array(qrSize - s.size - eom.size).fill(null) : null;

		// build QRCode
		bits = new QRCode(version, ecLevel, [s, eom], p).bitStream();

		// TODO: calculate and render error bits where full defined

	} catch (ex) {
		fields.data.classList.add("error");
		console.error(ex);  // DEBUG
	}
	let maskAt = !Number.isNaN(mask) ? RenderedQRCode._MASKS[mask] : (i, j) => false;  // predicate

	for (let i = 0; i < qr.size; i++) {
		for (let j = 0; j < qr.size; j++) {
			let m = qr.modules[i][j];
			
			// color data modules
			if (m.tag === Module.DATA) {
				if (m.index < bits.length) {
					m.color = bits[m.index];
					if (m.color != null && maskAt(i, j))
						m.color = 1 - m.color;
				} else {
					m.color = null;
				}
			}

			let rect = modules[i][j];
			rect.classList.remove("white", "black", "reserved", "empty");
			let c =
				m.color === Module.WHITE ? "white" :
				m.color === Module.BLACK ? "black" :
				m.color === RESERVED     ? "reserved" :
				"empty";
			rect.classList.add(c);
		}
	}
}

function initializeQR(shape = "rect", scale = 100) {
	buildQR(shape, scale);
	updateQR();
}

document.addEventListener("DOMContentLoaded", () => initializeQR());  // initial render on load
form.addEventListener("reset", () => initializeQR());                 // re-render full QR if form is reset
fields.version.addEventListener("change", () => initializeQR());      // re-render full QR code if version changes
fields.ecLevel.addEventListener("change", () => updateQR());
fields.mask.addEventListener("change", () => updateQR());
fields.mode.addEventListener("change", () => updateQR());
fields.data.addEventListener("input", () => updateQR());
fields.data.addEventListener("change", () => updateQR());
fields.suffix.addEventListener("change", () => updateQR());
fields.padding.addEventListener("change", () => updateQR());
