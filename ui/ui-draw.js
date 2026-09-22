
const form = document.querySelector("form#info");
const svg = document.querySelector("svg#qrcode");

let qrUpdate = null;  // store .detail from last QRUpdate, contains e.g. (RenderedQRCode) qr

let modules = [];
let eventListeners = [];  // parallel 2d-array to qrUpdate.modules storing event listeners as objects, { eventType: f }
let size = 0;

let edits = loadEdits();  // user edited modules: map: `${i},${j}` -> color, where "0,0" is an "anchor" point, e.g. the center of the qrcode	
let anchor = (size) => {
	let center = Math.floor(size / 2);
	return [center, center];
};
let i0, j0;  // current anchor

let penColor = null;  // what color, if any, is currently being drawn

// capture CustomEvent
svg.addEventListener("QRUpdate", event => {
	qrUpdate = event.detail;
	
	modules = qrUpdate.modules;
	size = modules.length;
	[i0, j0] = anchor(size);  // offsets

	if (size !== eventListeners.length) {
		// We have new module elements (<rect>). We can forget the old event listeners.
		eventListeners = new Array(size);
		for (let i = 0; i < size; i++) {
			eventListeners[i] = new Array(size);
			for (let j = 0; j < size; j++)
				eventListeners[i][j] = {};
		}
	}

	updateUIControls();
	draw();
	dispatchQRDrawEvent();
});

// (re)initialize nessesary ui controls as event listeners on SVG elements
function updateUIControls() {
	for (let i = 0; i < size; i++)
		for (let j = 0; j < size; j++) {
			const rect = modules[i][j];  // e.g. <rect>
			const listeners = eventListeners[i][j];

			// remove any old event listeners
			for (const e of ["mousedown", "mouseover", "contextmenu"])  // event types
				if (listeners[e]) {
					rect.removeEventListener(e, listeners[e]);
					listeners[e] = null;
				}

			// add new event listeners
			if (rect.classList.contains("empty")) {

				const updateEdits = () => {
					const ij = `${i - i0},${j - j0}`;
					if (penColor !== "")
						edits.set(ij, penColor);
					else
						edits.delete(ij);
				};

				rect.addEventListener("mousedown", listeners["mousedown"] = event => {
					const { button } = event;
					if (button !== 0 && button !== 2)  // left or right click (respectively)
						return;
					event.preventDefault();
					penColor = "";
					if (button === 0) {  // left click: BLACK -> WHITE -> null -> BLACK -> ...
						if (rect.classList.contains("black"))
							rect.classList.replace("black", penColor = "white");
						else if (rect.classList.contains("white"))
							rect.classList.remove("white");
						else
							rect.classList.add(penColor = "black");
					} else {  // right click: WHITE -> BLACK -> null -> WHITE -> ...
						if (rect.classList.contains("white"))
							rect.classList.replace("white", penColor = "black");
						else if (rect.classList.contains("black"))
							rect.classList.remove("black");
						else
							rect.classList.add(penColor = "white");
					}
					updateEdits();
				});

				rect.addEventListener("mouseover", listeners["mouseover"] = event => {
					if (penColor === null)
						return;
					event.preventDefault();
					rect.classList.remove("white", "black");
					if (penColor !== "")
						rect.classList.add(penColor);
					updateEdits();
				});

				rect.addEventListener("contextmenu", listeners["contextmenu"] = event => {
					event.preventDefault();
				});
			}
		}
}

// Stop drawing. Added to document in case mouse gets moved off the <svg> canvas.
document.addEventListener("mouseup", event => {
	if (penColor === null)
		return;
	event.preventDefault();
	penColor = null;
	saveEdits();  // save on mouseup to avoid saving on every mouseover event during drags for smoother UX.
	dispatchQRDrawEvent();
});

// Translate edits
document.addEventListener("keydown", event => {
	const { key } = event;
	if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Shift"].includes(key) || form.contains(document.activeElement))
		return;
	event.preventDefault();

	const scale = event.shiftKey ? 10 : 1;
	let di = 0;
	let dj = 0;
	switch (key) {
		case "ArrowLeft":  dj = -scale;  break;
		case "ArrowUp":    di = -scale;  break;
		case "ArrowRight": dj = +scale;  break;
		case "ArrowDown":  di = +scale;  break;
	}
	if (di !== 0 || dj !== 0) {
		const translated = new Map();
		for (const [ij, color] of edits.entries()) {
			const [i, j] = ij.split(",").map(ele => +ele);
			translated.set(`${i + di},${j + dj}`, color);
		}
		edits = translated;
		draw();
		saveEdits();
		dispatchQRDrawEvent();
	}
});

// (re)draw edited modules
function draw() {
	// first remove all white/black colors from empty modules
	for (let i = 0; i < size; i++)
		for (let j = 0; j < size; j++) {
			const rect = modules[i][j];
			if (rect.classList.contains("empty"))
				rect.classList.remove("white", "black");
		}
	
	// then fill in correct colors for edited modules
	for (const [ij, color] of edits.entries()) {
		let [i, j] = ij.split(",", 2).map(ele => +ele);
		i += i0;
		j += j0;
		if (0 <= i && i < size && 0 <= j && j < size) {
			const rect = modules[i][j];
			if (rect.classList.contains("empty")) {
				if (color !== null)
					rect.classList.add(color);
			}
		}
	}
}

function saveEdits() {
	localStorage.setItem("edits", [...edits]
		.filter(([ij, color]) => color !== null)
		.map(([ij, color]) => `${ij},${color}`)
		.join("; ")
	);
}

function loadEdits() {
	let str = localStorage.getItem("edits");
	if (str === null)
		return new Map();
	return new Map(str.split("; ").map(tri => {
		const [i, j, color] = tri.split(",", 3);
		return [`${i},${j}`, color];
	}));
}

function dispatchQRDrawEvent() {
	svg.dispatchEvent(new CustomEvent("QRDraw", {
		detail: { qrUpdate, modules, eventListeners, size, edits, anchor, i0, j0, penColor },
		bubbles: true,
		cancelable: true
	}));
}
