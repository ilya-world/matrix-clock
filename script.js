const grid = document.getElementById("grid");
const startTimeInput = document.getElementById("startTime");
const paletteForm = document.getElementById("paletteForm");
const colorInput = document.getElementById("colorInput");
const labelInput = document.getElementById("labelInput");
const paletteList = document.getElementById("paletteList");
const eraserButton = document.getElementById("eraser");

const baseCells = 100;
const palette = [];
let activePaletteId = null;
const userPaint = new Map();

const minutesPerCell = 10;
const msPerCell = minutesPerCell * 60 * 1000;

function parseStartTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

function formatTime(hours, minutes) {
  const safeHours = ((hours % 24) + 24) % 24;
  const safeMinutes = ((minutes % 60) + 60) % 60;
  return `${String(safeHours).padStart(2, "0")}:${String(safeMinutes).padStart(2, "0")}`;
}

function getIntervalLabel(index, startTime) {
  const startMinutes = startTime.hours * 60 + startTime.minutes + index * minutesPerCell;
  const endMinutes = startMinutes + minutesPerCell;
  const startLabel = formatTime(Math.floor(startMinutes / 60), startMinutes % 60);
  const endLabel = formatTime(Math.floor(endMinutes / 60), endMinutes % 60);
  return `${startLabel}–${endLabel}`;
}

function getElapsedCells(startTime) {
  const now = new Date();
  const start = new Date();
  start.setHours(startTime.hours, startTime.minutes, 0, 0);
  const diff = now.getTime() - start.getTime();
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / msPerCell);
}

function createCell(index, type, startTime) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "matrix__cell";
  cell.dataset.index = index;
  if (type === "elapsed") {
    cell.classList.add("elapsed");
  }
  if (type === "overflow") {
    cell.classList.add("overflow");
  }
  cell.title = getIntervalLabel(index, startTime);
  cell.addEventListener("click", () => handleCellPaint(cell));
  applyUserPaint(cell);
  return cell;
}

function applyUserPaint(cell) {
  const index = Number(cell.dataset.index);
  const paint = userPaint.get(index);
  if (paint) {
    cell.style.background = paint.color;
    cell.classList.add("user-painted");
  } else {
    cell.style.background = "";
    cell.classList.remove("user-painted");
  }
}

function renderGrid() {
  const startTime = parseStartTime(startTimeInput.value);
  const elapsed = getElapsedCells(startTime);
  const totalCells = elapsed > baseCells ? baseCells + (elapsed - baseCells) : baseCells;
  grid.innerHTML = "";

  for (let i = 0; i < totalCells; i += 1) {
    let type = "future";
    if (i < elapsed) {
      type = i < baseCells ? "elapsed" : "overflow";
    }
    const cell = createCell(i, type, startTime);
    grid.appendChild(cell);
  }
}

function addPaletteItem({ id, color, label }) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "palette__item";
  item.dataset.id = id;
  item.innerHTML = `<span class="palette__swatch" style="background:${color}"></span><span>${label}</span>`;
  item.addEventListener("click", () => setActivePalette(id));
  paletteList.appendChild(item);
}

function setActivePalette(id) {
  activePaletteId = id;
  const items = paletteList.querySelectorAll(".palette__item");
  items.forEach((item) => {
    item.classList.toggle("active", item.dataset.id === id);
  });
  eraserButton.classList.toggle("active", id === null);
}

function handleCellPaint(cell) {
  const index = Number(cell.dataset.index);
  if (activePaletteId === null) {
    userPaint.delete(index);
  } else {
    const selected = palette.find((item) => item.id === activePaletteId);
    if (!selected) {
      return;
    }
    userPaint.set(index, selected);
  }
  applyUserPaint(cell);
}

paletteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const color = colorInput.value.trim();
  const label = labelInput.value.trim();
  if (!color || !label) {
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const paletteItem = { id, color, label };
  palette.push(paletteItem);
  addPaletteItem(paletteItem);
  labelInput.value = "";
  setActivePalette(id);
});

eraserButton.addEventListener("click", () => {
  setActivePalette(null);
});

startTimeInput.addEventListener("change", () => {
  renderGrid();
});

setActivePalette(null);
renderGrid();
setInterval(renderGrid, 60 * 1000);
