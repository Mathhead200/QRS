
const form = document.querySelector("form#info");
const fields = ["#version", "#ecLevel", "#mask", "#mode", "#data", "#suffix", "#padding"]
	.map(q =>form.querySelector(q));

for (let ele of fields) {
	// load saved values
	let value = localStorage.getItem(ele.id);
	if (value !== null) {
		if (ele.type === "checkbox")
			ele.checked = (value === "true");
		else
			ele.value   = value;
	}

	// save values when fields change
	if (ele.type === "checkbox")
		ele.addEventListener("change", () => localStorage.setItem(ele.id, ele.checked));
	else
		ele.addEventListener("change", () => localStorage.setItem(ele.id, ele.value));
}

// delete saved values on form reset
form.addEventListener("reset", () => fields.forEach(ele => localStorage.removeItem(ele.id)));
