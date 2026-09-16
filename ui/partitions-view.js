import { QRCode, Segment, characterCountBits } from "../qr/QRCode.js";
import { DataSize } from "../qr/DataSize.js"

const partitions = document.querySelector("#partitions");
const part = {}
part.header    = partitions.querySelector("#header-bits");
part.data      = partitions.querySelector("#data-bits");
part.suffix    = partitions.querySelector("#suffix-bits");
part.nullBits  = partitions.querySelector("#null-bits");
part.padding   = partitions.querySelector("#padding-bits");
part.ec        = partitions.querySelector("#ec-bits");
part.remainder = partitions.querySelector("#remainder-bits");

const form = document.querySelector("form#info");
const fields = {};
fields.version = form.querySelector("#version");
fields.ecLevel = form.querySelector("#ecLevel");
fields.mode    = form.querySelector("#mode");
fields.data    = form.querySelector("#data");
fields.suffix  = form.querySelector("#suffix");

function updatePartitionsView() {
	const version = +fields.version.value;
	const ecLevel =  fields.ecLevel.value;
	const mode    = +fields.mode.value;
	const data    =  fields.data.value;
	const suffix  = +fields.suffix.value;

	const headerBits = 4 + characterCountBits(version, mode);

	const { codewords, E, g1, g2 } = QRCode.ecCharacteristics({ version, ecLevel });
	const ecBits = 8 * E * (g1 + g2);
	const remainderBits = QRCode.remainderBits({ version });
	const codewordBits = 8 * codewords;
	const total = codewordBits + ecBits + remainderBits;
	const cqw = n => (100 * n / total);  // CSS format for cqw units (i.e. percentage of parent container width)
	
	const encodedSize =
		mode === Segment.NUMERIC      ? DataSize.numeric      :
		mode === Segment.ALPHANUMERIC ? DataSize.alphanumeric :
		mode === Segment.BYTE         ? DataSize.bytes        :
		mode === Segment.KANJI        ? DataSize.kanji        :
		null;  // Assert: false
	const dataBits           = encodedSize(data.length);
	const dataBitsWithSuffix = encodedSize(data.length + suffix);
	const suffixBits = dataBitsWithSuffix - dataBits;
	const paddingAndNullBits = codewordBits - dataBitsWithSuffix;
	const nullBits = Math.min(paddingAndNullBits, 4);
	const paddingBits = paddingAndNullBits - nullBits;

	const update = (ele, bits, title, valid) => {
		if (valid) {
			let w = cqw(bits);
			ele.style.display = "initial";
			ele.style.width = w + "cqw";
			ele.title = `${title} (${bits})`;
			ele.innerText = w >= 8 ? bits : "";
		} else {
			ele.style.display = "none";
		}
	};

	const valid = [headerBits, dataBits, suffixBits, paddingBits, nullBits, ecBits, remainderBits].every( bits => bits >= 0);
	update(part.header, headerBits, "Header", valid);
	update(part.data, dataBits, "(Fixed) Data", valid);
	update(part.suffix, suffixBits, "Suffix", valid);
	update(part.padding, paddingBits, "Padding", valid);
	update(part.nullBits, nullBits, "Null", valid);
	update(part.ec, ecBits, "Error Correction", valid);
	update(part.remainder, remainderBits, "Remainder", valid);
	if (!valid) {
		part.remainder.style.display = "initial";
		part.remainder.style.width = "100cqw";
		part.remainder.title = "Invalid!";
		part.remainder.innerText = "Invalid!";
	}
}

document.addEventListener("DOMContentLoaded", updatePartitionsView);
fields.version.addEventListener("change", updatePartitionsView);
fields.ecLevel.addEventListener("change", updatePartitionsView);
fields.mode.addEventListener("change", updatePartitionsView);
fields.data.addEventListener("input", updatePartitionsView);
fields.data.addEventListener("change", updatePartitionsView);
fields.suffix.addEventListener("change", updatePartitionsView);
form.addEventListener("reset", updatePartitionsView);
