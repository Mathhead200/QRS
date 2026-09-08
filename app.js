import { makeInputBitDefinitions, solveQrModules } from './qrs.js';

const versionSelect = document.querySelector('#version');
const errorCorrectionSelect = document.querySelector('#errorCorrection');
const maskSelect = document.querySelector('#mask');
const modeSelect = document.querySelector('#mode');
const payloadInput = document.querySelector('#payload');
const qrSvg = document.querySelector('#qrSvg');
const form = document.querySelector('#qr-form');
const statusBox = document.querySelector('#solverStatus');

const WHITE = 'white';
const BLACK = 'black';
const FREE = 'free';
const REQUIRED = 'required';

const state = {
  version: Number(versionSelect.value),
  errorCorrection: errorCorrectionSelect.value,
  mask: Number(maskSelect.value),
  mode: modeSelect.value,
  grid: [],
  lockedCells: new Set(),
  isPointerDown: false,
  activePaint: BLACK,
};

function getVersionSize(version) {
  return 21 + (version - 1) * 4;
}

function cycleLeft(currentState) {
  if (currentState === FREE) return BLACK;
  if (currentState === BLACK) return WHITE;
  return FREE;
}

function cycleRight(currentState) {
  if (currentState === FREE) return WHITE;
  if (currentState === WHITE) return BLACK;
  return FREE;
}

function isLockedCell(row, col) {
  return state.lockedCells.has(`${row}:${col}`);
}

function setCell(row, col, nextState) {
  if (isLockedCell(row, col))
    return;

  state.grid[row][col] = nextState;
  renderGrid();
}

function valueForFinderCell(row, col) {
  const inner = row >= 2 && row <= 4 && col >= 2 && col <= 4;
  const border = row === 0 || row === 6 || col === 0 || col === 6;
  const center = row === 3 && col === 3;
  return border || inner || center ? 1 : 0;
}

function addFinderPattern(required, rowStart, colStart) {
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const r = rowStart + row;
      const c = colStart + col;
      const value = valueForFinderCell(row, col);
      required.set(`${r}:${c}`, value ? BLACK : WHITE);
    }
  }

  for (let row = -1; row <= 7; row++) {
    for (let col = -1; col <= 7; col++) {
      const r = rowStart + row;
      const c = colStart + col;
      if (r < 0 || c < 0 || r >= state.grid.length || c >= state.grid.length)
        continue;
      if (row === -1 || row === 7 || col === -1 || col === 7) {
        required.set(`${r}:${c}`, WHITE);
      }
    }
  }
}

function addTimingPattern(required, size) {
  for (let index = 0; index < size; index++) {
    const rowValue = index % 2 === 0 ? BLACK : WHITE;
    const colValue = index % 2 === 0 ? BLACK : WHITE;

    if (!required.has(`${6}:${index}`))
      required.set(`${6}:${index}`, rowValue);
    if (!required.has(`${index}:${6}`))
      required.set(`${index}:${6}`, colValue);
  }
}

function addDarkModule(required, size) {
  const darkRow = 8;
  const darkCol = 4 * state.version + 9;
  if (darkRow < size && darkCol < size)
    required.set(`${darkRow}:${darkCol}`, BLACK);
}

function addFormatPattern(required, size, level, maskIndex) {
  const levelMap = { L: 1, M: 0, Q: 3, H: 2 };
  const levelBits = levelMap[level] ?? 0;
  const pattern = Array.from({ length: 15 }, (_, i) => {
    const bitIndex = i % 5;
    if (bitIndex < 2) return (levelBits >> (1 - bitIndex)) & 1;
    if (bitIndex < 5) return (maskIndex >> (4 - bitIndex)) & 1;
    return (i + levelBits + maskIndex) % 2;
  });

  const positions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [7, 8], [8, 8], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1],
  ];

  for (let i = 0; i < positions.length; i++) {
    const [row, col] = positions[i];
    if (row < size && col < size) {
      required.set(`${row}:${col}`, pattern[i] ? BLACK : WHITE);
    }
  }

  const topLeft = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8],
  ];

  for (let i = 0; i < topLeft.length; i++) {
    const [row, col] = topLeft[i];
    if (row < size && col < size) {
      required.set(`${row}:${col}`, pattern[i] ? BLACK : WHITE);
    }
  }
}

function buildRequiredPattern(version, errorCorrection, maskIndex) {
  const size = getVersionSize(version);
  const required = new Map();

  addFinderPattern(required, 0, 0);
  addFinderPattern(required, 0, size - 7);
  addFinderPattern(required, size - 7, 0);

  for (let index = 0; index < size; index++) {
    if (index !== 6) {
      required.set(`${6}:${index}`, index % 2 === 0 ? BLACK : WHITE);
      required.set(`${index}:${6}`, index % 2 === 0 ? BLACK : WHITE);
    }
  }

  addDarkModule(required, size);
  addFormatPattern(required, size, errorCorrection, maskIndex);

  return required;
}

function createGrid(size) {
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => FREE)
  );

  const required = buildRequiredPattern(state.version, state.errorCorrection, state.mask);
  state.lockedCells = new Set();

  for (const [key, value] of required.entries()) {
    const [rowText, colText] = key.split(':');
    const row = Number(rowText);
    const col = Number(colText);

    if (row >= 0 && row < size && col >= 0 && col < size) {
      grid[row][col] = value;
      state.lockedCells.add(key);
    }
  }

  return grid;
}

function cellClass(stateName) {
  return {
    [FREE]: 'free',
    [WHITE]: 'white',
    [BLACK]: 'black',
    [REQUIRED]: 'required',
  }[stateName] ?? 'free';
}

function renderGrid() {
  const size = state.grid.length;
  const padding = 12;
  const cellPx = Math.max(8, Math.floor((560 - padding * 2) / size));

  qrSvg.innerHTML = '';
  qrSvg.setAttribute('viewBox', `0 0 ${size * cellPx} ${size * cellPx}`);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const value = state.grid[row][col];
      const isLocked = isLockedCell(row, col);
      rect.setAttribute('x', String(col * cellPx));
      rect.setAttribute('y', String(row * cellPx));
      rect.setAttribute('width', String(cellPx));
      rect.setAttribute('height', String(cellPx));

      const cssClass = isLocked ? cellClass(value) : cellClass(value);
      rect.setAttribute('class', `module ${cssClass}`);
      rect.setAttribute('data-row', String(row));
      rect.setAttribute('data-col', String(col));
      rect.style.cursor = isLocked ? 'not-allowed' : 'pointer';
      rect.addEventListener('pointerdown', (event) => {
        if (isLockedCell(row, col))
          return;

        event.preventDefault();
        state.isPointerDown = true;

        if (event.button === 2) {
          state.activePaint = cycleRight(state.grid[row][col]);
        } else {
          state.activePaint = cycleLeft(state.grid[row][col]);
        }

        setCell(row, col, state.activePaint);
      });

      rect.addEventListener('pointerenter', () => {
        if (!state.isPointerDown || isLockedCell(row, col))
          return;

        setCell(row, col, state.activePaint);
      });

      rect.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });

      qrSvg.appendChild(rect);
    }
  }
}

function syncStateFromControls() {
  state.version = Number(versionSelect.value);
  state.errorCorrection = errorCorrectionSelect.value;
  state.mask = Number(maskSelect.value);
  state.mode = modeSelect.value;
  const size = getVersionSize(state.version);
  if (!state.grid.length || state.grid.length !== size) {
    state.grid = createGrid(size);
  } else {
    state.grid = createGrid(size);
  }
  renderGrid();
}

function textToPayloadBits(text) {
  const bytes = new TextEncoder().encode(text || '');
  const bits = [];
  for (const byte of bytes) {
    for (let bitIndex = 7; bitIndex >= 0; bitIndex--) {
      bits.push((byte >> bitIndex) & 1);
    }
  }
  return bits;
}

function getTargetPixelsFromGrid() {
  const constraints = [];
  let moduleIndex = 0;

  for (const row of state.grid) {
    for (const cell of row) {
      if (cell === BLACK) {
        constraints.push({ moduleIndex, value: 1 });
      } else if (cell === WHITE) {
        constraints.push({ moduleIndex, value: 0 });
      }
      moduleIndex++;
    }
  }

  return constraints;
}

function getFreeBitIndexesFromGrid() {
  const indexes = [];
  const flat = state.grid.flat();
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === FREE) indexes.push(i);
  }
  return indexes;
}

function buildModuleBitDefinitions() {
  const size = getVersionSize(state.version);
  const moduleCount = size * size;
  const payloadBits = Array(moduleCount).fill(0);
  const fixedBits = {};
  const freeBitIndexes = [];

  for (let i = 0; i < moduleCount; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    const cell = state.grid[row][col];

    if (cell === BLACK) fixedBits[i] = 1;
    else if (cell === WHITE) fixedBits[i] = 0;
    else freeBitIndexes.push(i);
  }

  return {
    payloadBits,
    fixedBits,
    freeBitIndexes,
    bitDefinitions: makeInputBitDefinitions({
      payloadBits,
      fixedBits,
      freeBitIndexes,
    }),
  };
}

function generateFullGridModuleMatrix(bits) {
  const size = getVersionSize(state.version);
  const moduleCount = size * size;
  const out = new Array(moduleCount).fill(0);

  for (let i = 0; i < Math.min(bits.length, moduleCount); i++) {
    out[i] = bits[i] & 1;
  }

  return out;
}

function solveQrFromForm() {
  const { payloadBits, fixedBits, freeBitIndexes, bitDefinitions } = buildModuleBitDefinitions();
  const constraints = getTargetPixelsFromGrid();

  const result = solveQrModules({
    bitDefinitions,
    generateModuleMatrix: generateFullGridModuleMatrix,
    constraints,
  });

  statusBox.textContent = result
    ? `Solver returned a valid solution space with dimension ${result.dimension}.`
    : 'No valid solution for the selected module constraints.';

  console.log('QR solve request', {
    payloadBits,
    bitDefinitions,
    constraints,
    version: state.version,
    errorCorrection: state.errorCorrection,
    mask: state.mask,
    mode: state.mode,
  });
  console.log('Solver result', result);
}

versionSelect.addEventListener('change', syncStateFromControls);
errorCorrectionSelect.addEventListener('change', syncStateFromControls);
maskSelect.addEventListener('change', syncStateFromControls);
modeSelect.addEventListener('change', syncStateFromControls);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  solveQrFromForm();
});

document.addEventListener('pointerup', () => {
  state.isPointerDown = false;
});

document.addEventListener('pointerleave', () => {
  state.isPointerDown = false;
});

document.querySelector('#resetGrid').addEventListener('click', () => {
  state.grid = createGrid(getVersionSize(state.version));
  renderGrid();
  statusBox.textContent = 'Grid reset.';
});

syncStateFromControls();
