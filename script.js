const grid = document.getElementById("grid");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const endTimeHint = document.getElementById("endTimeHint");
const daysList = document.getElementById("daysList");
const paletteForm = document.getElementById("paletteForm");
const colorInput = document.getElementById("colorInput");
const labelInput = document.getElementById("labelInput");
const paletteList = document.getElementById("paletteList");
const eraserButton = document.getElementById("eraser");

const baseCells = 100;
const minutesPerCell = 10;
const msPerCell = minutesPerCell * 60 * 1000;
const dayBoundaryMinutes = 4 * 60;
const storageKey = "matrix-clock-days-v1";

let palette = [];
let paletteById = new Map();
let activePaletteId = null;
let userPaint = new Map();

let updateTimeoutId = null;
let currentDayKey = getCurrentDayKey();

const storage = loadStorage();
ensureDayState(currentDayKey);
let selectedDayKey = storage.activeDayKey && storage.days[storage.activeDayKey]
  ? storage.activeDayKey
  : currentDayKey;

function loadStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return { days: {}, activeDayKey: null };
    }
    return {
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      activeDayKey: parsed.activeDayKey || null,
    };
  } catch (error) {
    return { days: {}, activeDayKey: null };
  }
}

function saveStorage() {
  localStorage.setItem(storageKey, JSON.stringify(storage));
}

function createDayState(dateKey) {
  return {
    dateKey,
    startTime: "07:00",
    endTime: "04:00",
    palette: [],
    paints: {},
    frozenElapsed: 0,
    lastVisited: null,
  };
}

function ensureDayState(dateKey) {
  if (!storage.days[dateKey]) {
    storage.days[dateKey] = createDayState(dateKey);
  }
  return storage.days[dateKey];
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(dateKey) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function getCurrentDayKey(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const dayDate = new Date(now);
  if (minutes < dayBoundaryMinutes) {
    dayDate.setDate(dayDate.getDate() - 1);
  }
  return formatDateKey(dayDate);
}

function isCurrentDay(dateKey) {
  return dateKey === currentDayKey;
}

function parseStartTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

function formatTime(hours, minutes) {
  const safeHours = ((hours % 24) + 24) % 24;
  const safeMinutes = ((minutes % 60) + 60) % 60;
  return `${String(safeHours).padStart(2, "0")}:${String(safeMinutes).padStart(2, "0")}`;
}

function formatTimeFromDate(date) {
  return formatTime(date.getHours(), date.getMinutes());
}

function getLastVisitDisplay(dateKey, dayState) {
  if (!dayState.lastVisited) {
    return "Нет посещений";
  }
  const lastVisitDate = new Date(dayState.lastVisited);
  if (!isCurrentDay(dateKey)) {
    const boundary = parseDateKey(dateKey);
    boundary.setDate(boundary.getDate() + 1);
    boundary.setHours(4, 0, 0, 0);
    if (lastVisitDate.getTime() > boundary.getTime()) {
      lastVisitDate.setTime(boundary.getTime());
    }
  }
  return `Последний визит: ${formatTimeFromDate(lastVisitDate)}`;
}

function getIntervalLabel(index, startTime) {
  const startMinutes = startTime.hours * 60 + startTime.minutes + index * minutesPerCell;
  const endMinutes = startMinutes + minutesPerCell;
  const startLabel = formatTime(Math.floor(startMinutes / 60), startMinutes % 60);
  const endLabel = formatTime(Math.floor(endMinutes / 60), endMinutes % 60);
  return `${startLabel}–${endLabel}`;
}

function getStartDateForDay(dateKey, startTime) {
  const start = parseDateKey(dateKey);
  start.setHours(startTime.hours, startTime.minutes, 0, 0);
  return start;
}

function getEndDateForDay(dateKey, endTime, startTime) {
  const end = parseDateKey(dateKey);
  end.setHours(endTime.hours, endTime.minutes, 0, 0);
  const startDate = getStartDateForDay(dateKey, startTime);
  if (end.getTime() < startDate.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

function getElapsedCellsBetween(startDate, endDate) {
  const diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / msPerCell);
}

function getElapsedCellsNow(dateKey, startTime) {
  const now = new Date();
  const startDate = getStartDateForDay(dateKey, startTime);
  return getElapsedCellsBetween(startDate, now);
}

function getElapsedCellsForEndTime(dateKey, startTime, endTime) {
  const startDate = getStartDateForDay(dateKey, startTime);
  const endDate = getEndDateForDay(dateKey, endTime, startTime);
  return getElapsedCellsBetween(startDate, endDate);
}

function getMsUntilNextCell(dateKey, startTime) {
  const now = new Date();
  const start = getStartDateForDay(dateKey, startTime);
  const diff = now.getTime() - start.getTime();
  if (diff < 0) {
    return -diff;
  }
  const remainder = diff % msPerCell;
  return remainder === 0 ? msPerCell : msPerCell - remainder;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return null;
  }
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function mixWithWhite(hex, amount = 0.35) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

function syncPaletteLookup() {
  paletteById = new Map(palette.map((item) => [item.id, item]));
}

function applyUserPaint(cell) {
  const index = Number(cell.dataset.index);
  const paletteId = userPaint.get(index);
  const paint = paletteById.get(paletteId);
  if (paint) {
    const isPast =
      cell.classList.contains("elapsed") || cell.classList.contains("overflow");
    cell.style.background = isPast ? paint.color : mixWithWhite(paint.color);
    cell.classList.add("user-painted");
  } else {
    cell.style.background = "";
    cell.classList.remove("user-painted");
  }
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

function getDisplayElapsed(startTime) {
  const dayState = ensureDayState(selectedDayKey);
  if (isCurrentDay(selectedDayKey)) {
    return getElapsedCellsNow(selectedDayKey, startTime);
  }
  if (typeof dayState.frozenElapsed === "number") {
    return dayState.frozenElapsed;
  }
  const endTime = parseStartTime(dayState.endTime || "04:00");
  return getElapsedCellsForEndTime(selectedDayKey, startTime, endTime);
}

function renderGrid() {
  const startTime = parseStartTime(startTimeInput.value);
  const elapsed = getDisplayElapsed(startTime);
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

function scheduleGridUpdate() {
  if (updateTimeoutId) {
    window.clearTimeout(updateTimeoutId);
  }
  if (!isCurrentDay(selectedDayKey)) {
    return;
  }
  const dayState = ensureDayState(selectedDayKey);
  const startTime = parseStartTime(dayState.startTime);
  const delay = getMsUntilNextCell(selectedDayKey, startTime);
  updateTimeoutId = window.setTimeout(() => {
    checkDayRollover();
    if (!isCurrentDay(selectedDayKey)) {
      return;
    }
    updateCurrentDayProgress();
    renderGrid();
    scheduleGridUpdate();
  }, delay);
}

function renderPaletteList() {
  paletteList.innerHTML = "";
  palette.forEach((item) => addPaletteItem(item));
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
    userPaint.set(index, activePaletteId);
  }
  applyUserPaint(cell);
  persistSelectedDay();
}

function persistSelectedDay() {
  const dayState = ensureDayState(selectedDayKey);
  dayState.startTime = startTimeInput.value;
  dayState.endTime = endTimeInput.value;
  dayState.palette = [...palette];
  dayState.paints = Object.fromEntries(userPaint);
  storage.activeDayKey = selectedDayKey;
  saveStorage();
  renderDaysList();
}

function updateCurrentDayProgress() {
  const dayState = ensureDayState(currentDayKey);
  const startTime = parseStartTime(dayState.startTime);
  const now = new Date();
  dayState.frozenElapsed = getElapsedCellsNow(currentDayKey, startTime);
  dayState.lastVisited = now.toISOString();
  dayState.endTime = formatTimeFromDate(now);
  saveStorage();
  renderDaysList();
}

function updateEndTimeState() {
  if (isCurrentDay(selectedDayKey)) {
    endTimeInput.disabled = true;
    endTimeHint.textContent = "Настраивается для прошедших дней.";
  } else {
    endTimeInput.disabled = false;
    endTimeHint.textContent = "Влияет на число красных клеток за день.";
  }
}

function deleteDay(dateKey) {
  if (isCurrentDay(dateKey)) {
    return;
  }
  delete storage.days[dateKey];
  if (storage.activeDayKey === dateKey) {
    storage.activeDayKey = null;
  }
  if (selectedDayKey === dateKey) {
    selectedDayKey = currentDayKey;
    ensureDayState(currentDayKey);
    saveStorage();
    loadDay(currentDayKey);
    return;
  }
  saveStorage();
  renderDaysList();
}

function renderDaysList() {
  daysList.innerHTML = "";
  const keys = Object.keys(storage.days);
  if (!keys.includes(currentDayKey)) {
    keys.push(currentDayKey);
  }
  keys.sort((a, b) => b.localeCompare(a));
  keys.forEach((key) => {
    const dayState = ensureDayState(key);
    const item = document.createElement("div");
    item.className = "days__item";
    if (key === selectedDayKey) {
      item.classList.add("active");
    }
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "days__select";
    const title = key === currentDayKey ? "Сегодня" : formatDisplayDate(key);
    const lastVisit = getLastVisitDisplay(key, dayState);
    const details = key === currentDayKey
      ? `Текущий день · ${lastVisit}`
      : lastVisit;
    selectButton.innerHTML = `<strong>${title}</strong><span>${details}</span>`;
    selectButton.addEventListener("click", () => switchDay(key));
    item.appendChild(selectButton);

    if (!isCurrentDay(key)) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "days__delete";
      deleteButton.setAttribute("aria-label", "Удалить день");
      deleteButton.innerHTML = "🗑️";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteDay(key);
      });
      item.appendChild(deleteButton);
    }

    daysList.appendChild(item);
  });
}

function loadDay(dateKey) {
  const dayState = ensureDayState(dateKey);
  selectedDayKey = dateKey;
  startTimeInput.value = dayState.startTime || "07:00";
  endTimeInput.value = dayState.endTime || "04:00";
  palette = Array.isArray(dayState.palette) ? [...dayState.palette] : [];
  userPaint = new Map(
    Object.entries(dayState.paints || {}).map(([index, id]) => [Number(index), id])
  );
  syncPaletteLookup();
  renderPaletteList();
  setActivePalette(null);
  updateEndTimeState();
  renderGrid();
  renderDaysList();
  scheduleGridUpdate();
}

function switchDay(dateKey) {
  if (dateKey === selectedDayKey) {
    return;
  }
  persistSelectedDay();
  if (isCurrentDay(selectedDayKey)) {
    updateCurrentDayProgress();
  }
  loadDay(dateKey);
}

function checkDayRollover() {
  const latestDayKey = getCurrentDayKey();
  if (latestDayKey === currentDayKey) {
    return;
  }
  const previousCurrent = currentDayKey;
  updateCurrentDayProgress();
  currentDayKey = latestDayKey;
  ensureDayState(currentDayKey);
  if (selectedDayKey === previousCurrent) {
    loadDay(currentDayKey);
  } else {
    renderDaysList();
  }
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
  syncPaletteLookup();
  addPaletteItem(paletteItem);
  labelInput.value = "";
  setActivePalette(id);
  persistSelectedDay();
});

eraserButton.addEventListener("click", () => {
  setActivePalette(null);
});

startTimeInput.addEventListener("change", () => {
  const dayState = ensureDayState(selectedDayKey);
  dayState.startTime = startTimeInput.value;
  if (isCurrentDay(selectedDayKey)) {
    updateCurrentDayProgress();
  }
  saveStorage();
  renderGrid();
  scheduleGridUpdate();
});

endTimeInput.addEventListener("change", () => {
  const dayState = ensureDayState(selectedDayKey);
  dayState.endTime = endTimeInput.value;
  if (!isCurrentDay(selectedDayKey)) {
    const startTime = parseStartTime(dayState.startTime || "07:00");
    const endTime = parseStartTime(dayState.endTime || "04:00");
    dayState.frozenElapsed = getElapsedCellsForEndTime(
      selectedDayKey,
      startTime,
      endTime
    );
  }
  saveStorage();
  renderGrid();
  renderDaysList();
});

window.addEventListener("beforeunload", () => {
  persistSelectedDay();
  if (isCurrentDay(selectedDayKey)) {
    updateCurrentDayProgress();
  }
});

setActivePalette(null);
loadDay(selectedDayKey);
updateCurrentDayProgress();
window.setInterval(checkDayRollover, 60000);
