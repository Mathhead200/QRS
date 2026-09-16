
import { Module, RenderedQRCode } from "../qr/RenderedQRCode.js"

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
	qr.setFormat(fields.ecLevel.value, +fields.mask.value);
	for (let i = 0; i < qr.size; i++) {
		for (let j = 0; j < qr.size; j++) {
			let m = qr.modules[i][j];
			let rect = modules[i][j];
			rect.classList.remove("white", "black", "empty");
			let c =
				m.color === Module.WHITE ? "white" :
				m.color === Module.BLACK ? "black" :
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
