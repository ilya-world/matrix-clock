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
const cellTimeToggle = document.getElementById("cellTimeToggle");
const importButton = document.getElementById("importButton");
const importModal = document.getElementById("importModal");
const importTextarea = document.getElementById("importTextarea");
const importSubmit = document.getElementById("importSubmit");
const importStatus = document.getElementById("importStatus");
const groupForm = document.getElementById("groupForm");
const groupLabelInput = document.getElementById("groupLabelInput");
const groupColorInput = document.getElementById("groupColorInput");
const groupSelect = document.getElementById("groupSelect");
const cellDetails = document.getElementById("cellDetails");
const cellDetailsTime = document.getElementById("cellDetailsTime");
const cellDetailsLabel = document.getElementById("cellDetailsLabel");
const cellDetailsComment = document.getElementById("cellDetailsComment");
const cellCopy = document.getElementById("cellCopy");
const cellPaste = document.getElementById("cellPaste");

const baseCells = 100;
const minutesPerCell = 10;
const msPerCell = minutesPerCell * 60 * 1000;
const dayBoundaryMinutes = 4 * 60;
const storageKey = "matrix-clock-days-v1";
const meetingPalette = { label: "Встреча", color: "#0000FF" };
const defaultGroupId = "ungrouped";

let palette = [];
let paletteGroups = [];
let paletteById = new Map();
let activePaletteId = null;
let isEraserActive = false;
let userPaint = new Map();
let userComments = new Map();
let showCellTime = false;
let inspectedCellIndex = null;
let cellClipboard = null;

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
      return {
        days: {},
        activeDayKey: null,
        palette: [],
        paletteGroups: [],
        showCellTime: false,
      };
    }
    return {
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      activeDayKey: parsed.activeDayKey || null,
      palette: Array.isArray(parsed.palette) ? parsed.palette : [],
      paletteGroups: Array.isArray(parsed.paletteGroups) ? parsed.paletteGroups : [],
      showCellTime: Boolean(parsed.showCellTime),
    };
  } catch (error) {
    return {
      days: {},
      activeDayKey: null,
      palette: [],
      paletteGroups: [],
      showCellTime: false,
    };
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
    paints: {},
    comments: {},
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
  const lastVisitDate = getLastActiveDateForDay(dateKey, dayState);
  return `Последний визит: ${formatTimeFromDate(lastVisitDate)}`;
}

function getLastActiveDateForDay(dateKey, dayState, fallbackDate = new Date()) {
  if (!dayState.lastVisited) {
    return fallbackDate;
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
  return lastVisitDate;
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

function ensureDefaultGroup() {
  if (!paletteGroups.find((group) => group.id === defaultGroupId)) {
    paletteGroups.unshift({ id: defaultGroupId, label: "Без группы", color: "" });
  }
}

function normalizePaletteGroups() {
  paletteGroups = Array.isArray(paletteGroups) ? [...paletteGroups] : [];
  ensureDefaultGroup();
  paletteGroups = paletteGroups.filter(
    (group, index, self) =>
      group &&
      typeof group.id === "string" &&
      self.findIndex((entry) => entry.id === group.id) === index
  );
  if (!paletteGroups.length) {
    paletteGroups.push({ id: defaultGroupId, label: "Без группы", color: "" });
  }
  if (paletteGroups[0].id !== defaultGroupId) {
    const defaultGroup = paletteGroups.find((group) => group.id === defaultGroupId);
    paletteGroups = [
      defaultGroup || { id: defaultGroupId, label: "Без группы", color: "" },
      ...paletteGroups.filter((group) => group.id !== defaultGroupId),
    ];
  }
}

function normalizePaletteItems() {
  palette = palette.map((item) => ({
    ...item,
    groupId: item.groupId || defaultGroupId,
  }));
}

function updateGroupSelectOptions() {
  groupSelect.innerHTML = "";
  paletteGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.label;
    groupSelect.appendChild(option);
  });
  if (!groupSelect.value || !getGroupById(groupSelect.value)) {
    groupSelect.value = defaultGroupId;
  }
}

function getGroupById(id) {
  return paletteGroups.find((group) => group.id === id);
}

function setSelectionNone() {
  activePaletteId = null;
  isEraserActive = false;
  updateSelectionUI();
  hideCellDetails();
}

function updateSelectionUI() {
  const items = paletteList.querySelectorAll(".palette__item");
  items.forEach((item) => {
    item.classList.toggle("active", item.dataset.id === activePaletteId);
  });
  eraserButton.classList.toggle("active", isEraserActive);
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
  updateCellTooltip(cell, parseStartTime(startTimeInput.value));
}

function createCell(index, type, startTime, isCurrent) {
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
  if (isCurrent) {
    cell.classList.add("current");
  }
  if (showCellTime) {
    const startMinutes = startTime.hours * 60 + startTime.minutes + index * minutesPerCell;
    const timeLabel = formatTime(
      Math.floor(startMinutes / 60),
      startMinutes % 60
    );
    const [hours, minutes] = timeLabel.split(":");
    cell.classList.add("has-time");
    cell.innerHTML = `<span>${hours}</span><span>${minutes}</span>`;
  }
  cell.addEventListener("click", () => handleCellPaint(cell));
  applyUserPaint(cell);
  updateCellTooltip(cell, startTime);
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
  const isCurrent = isCurrentDay(selectedDayKey);
  const baseTotal = elapsed > baseCells ? baseCells + (elapsed - baseCells) : baseCells;
  const totalCells = isCurrent ? Math.max(baseTotal, elapsed + 1) : baseTotal;
  grid.innerHTML = "";

  for (let i = 0; i < totalCells; i += 1) {
    let type = "future";
    if (i < elapsed) {
      type = i < baseCells ? "elapsed" : "overflow";
    }
    const cell = createCell(i, type, startTime, isCurrent && i === elapsed);
    grid.appendChild(cell);
  }
  renderCellDetails();
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
    updateCurrentDayProgress({ updateLastVisited: false });
    renderGrid();
    scheduleGridUpdate();
  }, delay);
}

function renderPaletteList() {
  paletteList.innerHTML = "";
  paletteGroups.forEach((group) => {
    const groupElement = document.createElement("div");
    groupElement.className = "palette__group";
    groupElement.dataset.groupId = group.id;
    const header = document.createElement("div");
    header.className = "palette__group-header";

    const titleRow = document.createElement("div");
    titleRow.className = "palette__group-title";
    const title = document.createElement("strong");
    title.textContent = group.label;
    const actions = document.createElement("div");
    actions.className = "palette__group-actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button button--ghost";
    addButton.textContent = "＋";
    addButton.setAttribute("aria-label", `Добавить событие в группу ${group.label}`);
    addButton.addEventListener("click", () => {
      groupSelect.value = group.id;
      if (group.color) {
        colorInput.value = group.color;
      }
      labelInput.focus();
    });

    actions.appendChild(addButton);

    if (group.id !== defaultGroupId) {
      const removeGroupButton = document.createElement("button");
      removeGroupButton.type = "button";
      removeGroupButton.className = "palette__group-remove";
      removeGroupButton.textContent = "Удалить";
      removeGroupButton.addEventListener("click", () => {
        removePaletteGroup(group.id);
      });
      actions.appendChild(removeGroupButton);
    }

    titleRow.appendChild(title);
    titleRow.appendChild(actions);

    const colorRow = document.createElement("label");
    colorRow.className = "palette__group-color";
    colorRow.innerHTML = `<span>Цвет по умолчанию</span>`;
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = group.color || "#ffffff";
    colorPicker.addEventListener("change", () => {
      group.color = colorPicker.value;
      persistPaletteState();
    });
    colorRow.appendChild(colorPicker);

    header.appendChild(titleRow);
    header.appendChild(colorRow);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "palette__group-items";
    const items = palette.filter((item) => item.groupId === group.id);
    items.forEach((item) => addPaletteItem(item, itemsWrap));

    groupElement.appendChild(header);
    groupElement.appendChild(itemsWrap);

    groupElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      groupElement.classList.add("is-drop-target");
    });
    groupElement.addEventListener("dragleave", () => {
      groupElement.classList.remove("is-drop-target");
    });
    groupElement.addEventListener("drop", (event) => {
      event.preventDefault();
      groupElement.classList.remove("is-drop-target");
      const paletteId = event.dataTransfer.getData("text/plain");
      if (!paletteId) {
        return;
      }
      movePaletteItemToGroup(paletteId, group.id);
    });

    paletteList.appendChild(groupElement);
  });
  updateSelectionUI();
}

function addPaletteItem({ id, color, label }, container = paletteList) {
  const item = document.createElement("div");
  item.className = "palette__item";
  item.dataset.id = id;
  item.draggable = true;
  item.addEventListener("dragstart", (event) => {
    item.classList.add("dragging");
    event.dataTransfer.setData("text/plain", id);
  });
  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
  });
  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "palette__select";
  selectButton.innerHTML = `<span class="palette__swatch" style="background:${color}"></span><span class="palette__label">${label}</span>`;
  selectButton.addEventListener("click", () => setActivePalette(id));
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "palette__remove";
  removeButton.setAttribute("aria-label", "Удалить цвет");
  removeButton.textContent = "×";
  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (removeButton.classList.contains("is-confirm")) {
      removePaletteItem(id);
      return;
    }
    removeButton.classList.add("is-confirm");
  });
  item.appendChild(selectButton);
  item.appendChild(removeButton);
  container.appendChild(item);
}

function setActivePalette(id) {
  if (activePaletteId === id && !isEraserActive) {
    setSelectionNone();
    return;
  }
  activePaletteId = id;
  isEraserActive = false;
  updateSelectionUI();
  hideCellDetails();
}

function handleCellPaint(cell) {
  const index = Number(cell.dataset.index);
  if (isEraserActive) {
    userPaint.delete(index);
    userComments.delete(index);
    applyUserPaint(cell);
    persistSelectedDay();
    renderCellDetails();
    return;
  }
  if (activePaletteId) {
    userPaint.set(index, activePaletteId);
    applyUserPaint(cell);
    persistSelectedDay();
    renderCellDetails();
    return;
  }
  inspectedCellIndex = index;
  renderCellDetails();
}

function persistSelectedDay() {
  const dayState = ensureDayState(selectedDayKey);
  dayState.startTime = startTimeInput.value;
  dayState.endTime = endTimeInput.value;
  storage.palette = [...palette];
  storage.paletteGroups = [...paletteGroups];
  storage.showCellTime = showCellTime;
  dayState.paints = Object.fromEntries(userPaint);
  dayState.comments = Object.fromEntries(userComments);
  storage.activeDayKey = selectedDayKey;
  saveStorage();
  renderDaysList();
}

function updateCurrentDayProgress({ updateLastVisited = true } = {}) {
  const dayState = ensureDayState(currentDayKey);
  const startTime = parseStartTime(dayState.startTime);
  const now = new Date();
  const referenceDate = updateLastVisited
    ? now
    : getLastActiveDateForDay(currentDayKey, dayState, now);
  const startDate = getStartDateForDay(currentDayKey, startTime);
  dayState.frozenElapsed = getElapsedCellsBetween(startDate, referenceDate);
  if (updateLastVisited) {
    dayState.lastVisited = now.toISOString();
  }
  dayState.endTime = formatTimeFromDate(referenceDate);
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
  palette = Array.isArray(storage.palette) ? [...storage.palette] : [];
  paletteGroups = Array.isArray(storage.paletteGroups)
    ? [...storage.paletteGroups]
    : [];
  normalizePaletteGroups();
  normalizePaletteItems();
  showCellTime = Boolean(storage.showCellTime);
  cellTimeToggle.checked = showCellTime;
  userPaint = new Map(
    Object.entries(dayState.paints || {}).map(([index, id]) => [Number(index), id])
  );
  userComments = new Map(
    Object.entries(dayState.comments || {}).map(([index, comment]) => [
      Number(index),
      comment,
    ])
  );
  syncPaletteLookup();
  updateGroupSelectOptions();
  renderPaletteList();
  setSelectionNone();
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
    updateCurrentDayProgress({ updateLastVisited: true });
  }
  loadDay(dateKey);
}

function checkDayRollover() {
  const latestDayKey = getCurrentDayKey();
  if (latestDayKey === currentDayKey) {
    return;
  }
  const previousCurrent = currentDayKey;
  updateCurrentDayProgress({ updateLastVisited: false });
  currentDayKey = latestDayKey;
  ensureDayState(currentDayKey);
  if (selectedDayKey === previousCurrent) {
    loadDay(currentDayKey);
  } else {
    renderDaysList();
  }
}

function removePaletteItem(id) {
  palette = palette.filter((item) => item.id !== id);
  syncPaletteLookup();
  Object.values(storage.days).forEach((dayState) => {
    if (!dayState.paints) {
      return;
    }
    Object.entries(dayState.paints).forEach(([index, paintId]) => {
      if (paintId === id) {
        delete dayState.paints[index];
      }
    });
  });
  userPaint.forEach((paintId, index) => {
    if (paintId === id) {
      userPaint.delete(index);
      userComments.delete(index);
    }
  });
  if (activePaletteId === id) {
    setSelectionNone();
  }
  persistPaletteState();
  renderPaletteList();
  renderGrid();
}

function removePaletteGroup(groupId) {
  if (groupId === defaultGroupId) {
    return;
  }
  palette = palette.map((item) =>
    item.groupId === groupId ? { ...item, groupId: defaultGroupId } : item
  );
  paletteGroups = paletteGroups.filter((group) => group.id !== groupId);
  persistPaletteState();
  renderPaletteList();
}

function persistPaletteState() {
  storage.palette = [...palette];
  storage.paletteGroups = [...paletteGroups];
  saveStorage();
}

function movePaletteItemToGroup(paletteId, groupId) {
  const item = palette.find((entry) => entry.id === paletteId);
  if (!item || item.groupId === groupId) {
    return;
  }
  item.groupId = groupId;
  persistPaletteState();
  renderPaletteList();
}

paletteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const color = colorInput.value.trim();
  const label = labelInput.value.trim();
  if (!color || !label) {
    return;
  }
  const groupId = groupSelect.value || defaultGroupId;
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const paletteItem = { id, color, label, groupId };
  palette.push(paletteItem);
  syncPaletteLookup();
  persistPaletteState();
  renderPaletteList();
  labelInput.value = "";
  setActivePalette(id);
});

eraserButton.addEventListener("click", () => {
  if (isEraserActive) {
    setSelectionNone();
    return;
  }
  activePaletteId = null;
  isEraserActive = true;
  updateSelectionUI();
  hideCellDetails();
});

cellTimeToggle.addEventListener("change", () => {
  showCellTime = cellTimeToggle.checked;
  persistSelectedDay();
  renderGrid();
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

function updateCellTooltip(cell, startTime) {
  const index = Number(cell.dataset.index);
  const interval = getIntervalLabel(index, startTime);
  const paletteId = userPaint.get(index);
  const label = paletteById.get(paletteId)?.label || "Без события";
  const comment = userComments.get(index) || "—";
  cell.title = `${interval}\nНазначение: ${label}\nКомментарий: ${comment}`;
}

function hideCellDetails() {
  inspectedCellIndex = null;
  cellDetails.hidden = true;
}

function renderCellDetails() {
  if (inspectedCellIndex === null) {
    cellDetails.hidden = true;
    return;
  }
  const startTime = parseStartTime(startTimeInput.value);
  const interval = getIntervalLabel(inspectedCellIndex, startTime);
  const paletteId = userPaint.get(inspectedCellIndex);
  const label = paletteById.get(paletteId)?.label || "Без события";
  const comment = userComments.get(inspectedCellIndex) || "";
  cellDetailsTime.textContent = interval;
  cellDetailsLabel.textContent = label;
  cellDetailsComment.value = comment;
  cellDetails.hidden = false;
}

function setImportModalOpen(isOpen) {
  importModal.classList.toggle("is-open", isOpen);
  importModal.setAttribute("aria-hidden", String(!isOpen));
  if (isOpen) {
    importTextarea.focus();
  } else {
    importTextarea.value = "";
    importStatus.textContent = "";
  }
}

function getMeetingPaletteId() {
  const existing = palette.find(
    (item) =>
      item.label.toLowerCase() === meetingPalette.label.toLowerCase() &&
      item.color.toLowerCase() === meetingPalette.color.toLowerCase()
  );
  if (existing) {
    return existing.id;
  }
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const paletteItem = { id, ...meetingPalette, groupId: defaultGroupId };
  palette.push(paletteItem);
  syncPaletteLookup();
  persistPaletteState();
  renderPaletteList();
  return id;
}

function parseMeetingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/);
  if (!match) {
    return { error: trimmed };
  }
  return { start: match[1], end: match[2], name: match[3].trim() };
}

function toMinutes(timeValue) {
  const { hours, minutes } = parseStartTime(timeValue);
  return hours * 60 + minutes;
}

function importMeetingsFromText(text) {
  const lines = text.split("\n");
  const errors = [];
  const meetingId = getMeetingPaletteId();
  const dayStart = parseStartTime(startTimeInput.value);
  const dayStartMinutes = dayStart.hours * 60 + dayStart.minutes;
  const maxCells = Math.max(baseCells, grid.children.length);

  lines.forEach((line) => {
    const parsed = parseMeetingLine(line);
    if (!parsed) {
      return;
    }
    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }
    const startMinutes = toMinutes(parsed.start);
    let endMinutes = toMinutes(parsed.end);
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }
    let startOffset = startMinutes - dayStartMinutes;
    let endOffset = endMinutes - dayStartMinutes;
    if (endOffset <= 0) {
      return;
    }
    if (startOffset < 0) {
      startOffset = 0;
    }
    const startIndex = Math.floor(startOffset / minutesPerCell);
    const endIndex = Math.ceil(endOffset / minutesPerCell) - 1;
    const lastIndex = Math.max(0, maxCells - 1);
    for (let i = startIndex; i <= endIndex; i += 1) {
      if (i < 0 || i > lastIndex) {
        continue;
      }
      userPaint.set(i, meetingId);
      userComments.set(i, parsed.name);
    }
  });

  persistSelectedDay();
  renderGrid();

  if (errors.length) {
    return `Некоторые строки не распознаны: ${errors.slice(0, 3).join("; ")}`;
  }
  return "Встречи импортированы.";
}

importButton.addEventListener("click", () => {
  setImportModalOpen(true);
});

importModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-modal-close]")) {
    setImportModalOpen(false);
  }
});

importSubmit.addEventListener("click", () => {
  const text = importTextarea.value;
  if (!text.trim()) {
    importStatus.textContent = "Добавьте хотя бы одну встречу.";
    return;
  }
  const status = importMeetingsFromText(text);
  importStatus.textContent = status;
});

groupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = groupLabelInput.value.trim();
  if (!label) {
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const color = groupColorInput.value.trim();
  paletteGroups.push({ id, label, color });
  normalizePaletteGroups();
  updateGroupSelectOptions();
  persistPaletteState();
  renderPaletteList();
  groupLabelInput.value = "";
});

groupSelect.addEventListener("change", () => {
  const group = getGroupById(groupSelect.value);
  if (group?.color) {
    colorInput.value = group.color;
  }
});

cellDetailsComment.addEventListener("input", () => {
  if (inspectedCellIndex === null) {
    return;
  }
  const value = cellDetailsComment.value;
  if (value.trim()) {
    userComments.set(inspectedCellIndex, value);
  } else {
    userComments.delete(inspectedCellIndex);
  }
  persistSelectedDay();
  const cell = grid.querySelector(`[data-index="${inspectedCellIndex}"]`);
  if (cell) {
    updateCellTooltip(cell, parseStartTime(startTimeInput.value));
  }
});

cellCopy.addEventListener("click", () => {
  if (inspectedCellIndex === null) {
    return;
  }
  cellClipboard = {
    paletteId: userPaint.get(inspectedCellIndex) || null,
    comment: userComments.get(inspectedCellIndex) || "",
  };
});

cellPaste.addEventListener("click", () => {
  if (inspectedCellIndex === null || !cellClipboard) {
    return;
  }
  if (cellClipboard.paletteId) {
    userPaint.set(inspectedCellIndex, cellClipboard.paletteId);
  } else {
    userPaint.delete(inspectedCellIndex);
  }
  if (cellClipboard.comment) {
    userComments.set(inspectedCellIndex, cellClipboard.comment);
  } else {
    userComments.delete(inspectedCellIndex);
  }
  const cell = grid.querySelector(`[data-index="${inspectedCellIndex}"]`);
  if (cell) {
    applyUserPaint(cell);
  }
  persistSelectedDay();
  renderCellDetails();
});

window.addEventListener("beforeunload", () => {
  persistSelectedDay();
  if (isCurrentDay(selectedDayKey)) {
    updateCurrentDayProgress();
  }
});

if (!storage.palette.length) {
  const legacyPaletteSource = storage.activeDayKey && storage.days[storage.activeDayKey]
    ? storage.days[storage.activeDayKey]
    : storage.days[currentDayKey];
  if (legacyPaletteSource && Array.isArray(legacyPaletteSource.palette)) {
    storage.palette = [...legacyPaletteSource.palette];
  }
}

showCellTime = Boolean(storage.showCellTime);
cellTimeToggle.checked = showCellTime;
paletteGroups = Array.isArray(storage.paletteGroups)
  ? [...storage.paletteGroups]
  : [];
normalizePaletteGroups();
normalizePaletteItems();
updateGroupSelectOptions();
setSelectionNone();
loadDay(selectedDayKey);
updateCurrentDayProgress();
window.setInterval(checkDayRollover, 60000);
