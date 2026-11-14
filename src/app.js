
"use strict";

/* =========================================
   Accessory Designer
   Version: 0.1.0
   ========================================= */

const STORAGE_KEY = "accessory-designer-v01";

const svg = document.getElementById("canvas");
const connectionLayer = document.getElementById("connectionLayer");
const partLayer = document.getElementById("partLayer");
const $ = id => document.getElementById(id);

const state = {
  version: "0.1.0",
  mode: "design",
  parts: [],
  connections: [],
  layers: [
    { id: "layer-1", name: "レイヤー1", visible: true }
  ],
  activeLayerId: "layer-1",
  selectedIds: []
};

let undoStack = [];
let redoStack = [];
let connectionPicking = false;
let dragData = null;
let nextPartNumber = 1;

const DEFAULTS = {
  bead:     { name: "ビーズ", color: "#b9d7e8", width: 8, height: 8 },
  pearl:    { name: "パール", color: "#f4e8d5", width: 8, height: 8 },
  jumpRing: { name: "丸カン", color: "#c5a45e", width: 5, height: 5 },
  pin:      { name: "丸ピン", color: "#c5a45e", width: 2, height: 15 },
  tPin:     { name: "Tピン", color: "#c5a45e", width: 2, height: 15 },
  ninePin:  { name: "9ピン", color: "#c5a45e", width: 2, height: 15 },
  chain:    { name: "チェーン", color: "#c5a45e", width: 18, height: 5 },
  charm:    { name: "チャーム", color: "#d9a4ad", width: 12, height: 15 },
  other:    { name: "その他金具", color: "#aaa5a0", width: 8, height: 8 }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return prefix + "-" + Date.now().toString(36) +
    "-" + Math.random().toString(36).slice(2, 8);
}

function setStatus(message) {
  $("statusMessage").textContent = message;
}

function getPart(id) {
  return state.parts.find(p => p.id === id);
}

function getLayer(id) {
  return state.layers.find(layer => layer.id === id);
}

function saveHistory() {
  undoStack.push(clone(state));
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restoreState(snapshot) {
  Object.assign(state, clone(snapshot));
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(clone(state));
  restoreState(undoStack.pop());
  updateHistoryButtons();
  setStatus("元に戻しました");
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(clone(state));
  restoreState(redoStack.pop());
  updateHistoryButtons();
  setStatus("やり直しました");
}

function updateHistoryButtons() {
  $("undoBtn").disabled = undoStack.length === 0;
  $("redoBtn").disabled = redoStack.length === 0;
}

/* =========================================
   SVG helpers
   ========================================= */

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg", name
  );

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

function canvasPoint(event) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const transformed = point.matrixTransform(matrix.inverse());

  return { x: transformed.x, y: transformed.y };
}

/* =========================================
   Parts
   ========================================= */

function addPart(type) {
  const defaults = DEFAULTS[type];
  if (!defaults) return;

  saveHistory();

  const count = state.parts.length;

  const part = {
    id: createId("part"),
    type,
    name: defaults.name + " " + nextPartNumber++,
    x: 350 + (count % 5) * 45,
    y: 250 + (count % 5) * 35,

    // Physical dimensions: mm
    physicalWidth: defaults.width,
    physicalHeight: defaults.height,

    // Independent visual scale
    displayScale: 1,

    color: defaults.color,
    layerId: state.activeLayerId
  };

  state.parts.push(part);
  state.selectedIds = [part.id];

  renderAll();
  setStatus(part.name + "を追加しました");
}

function createPartShape(part) {
  const group = svgElement("g", {
    class: "part",
    "data-part-id": part.id,
    transform:
      `translate(${part.x} ${part.y}) scale(${part.displayScale})`
  });

  const w = Math.max(2, part.physicalWidth);
  const h = Math.max(2, part.physicalHeight);

  let shape;

  switch (part.type) {
    case "bead":
    case "pearl":
      shape = svgElement("circle", {
        cx: 0, cy: 0,
        r: Math.max(w, h) / 2,
        fill: part.color,
        stroke: "#887c75",
        "stroke-width": 1.5
      });
      group.appendChild(shape);
      break;

    case "jumpRing":
      group.appendChild(svgElement("circle", {
        cx: 0, cy: 0,
        r: Math.max(w, h) / 2,
        fill: "none",
        stroke: part.color,
        "stroke-width": Math.max(2, Math.min(w, h) / 4)
      }));
      break;

    case "pin":
    case "tPin":
    case "ninePin":
      group.appendChild(svgElement("line", {
        x1: 0, y1: -h / 2,
        x2: 0, y2: h / 2,
        stroke: part.color,
        "stroke-width": Math.max(2, w),
        "stroke-linecap": "round"
      }));

      if (part.type === "tPin") {
        group.appendChild(svgElement("line", {
          x1: -w * 2, y1: -h / 2,
          x2: w * 2, y2: -h / 2,
          stroke: part.color,
          "stroke-width": Math.max(2, w)
        }));
      }

      if (part.type === "ninePin") {
        group.appendChild(svgElement("circle", {
          cx: 0, cy: -h / 2,
          r: Math.max(2, w * 1.5),
          fill: "none",
          stroke: part.color,
          "stroke-width": 2
        }));
      }
      break;

    case "chain":
      group.appendChild(svgElement("rect", {
        x: -w / 2, y: -h / 2,
        width: w, height: h,
        rx: h / 2,
        fill: part.color,
        stroke: "#887c75",
        "stroke-width": 1
      }));
      break;

    case "charm":
      group.appendChild(svgElement("path", {
        d: `M 0 ${-h / 2} L ${w / 2} ${h / 2}
            L ${-w / 2} ${h / 2} Z`,
        fill: part.color,
        stroke: "#887c75",
        "stroke-width": 1.5
      }));
      break;

    default:
      group.appendChild(svgElement("rect", {
        x: -w / 2, y: -h / 2,
        width: w, height: h,
        rx: 2,
        fill: part.color,
        stroke: "#887c75",
        "stroke-width": 1.5
      }));
  }

  if (state.selectedIds.includes(part.id)) {
    group.appendChild(svgElement("circle", {
      cx: 0, cy: 0,
      r: Math.max(w, h) / 2 + 7,
      fill: "none",
      stroke: "#a77c83",
      "stroke-width": 1.5,
      "stroke-dasharray": "4 3"
    }));
  }

  return group;
}

/* =========================================
   Connections
   ========================================= */

function connectParts(idA, idB) {
  if (idA === idB) {
    setStatus("同じパーツ同士は接続できません");
    return;
  }

  const a = getPart(idA);
  const b = getPart(idB);

  if (!a || !b) return;

  const exists = state.connections.some(connection =>
    (connection.a === idA && connection.b === idB) ||
    (connection.a === idB && connection.b === idA)
  );

  if (exists) {
    setStatus("この接続はすでに存在します");
    return;
  }

  saveHistory();

  state.connections.push({
    id: createId("connection"),
    a: idA,
    b: idB
  });

  renderAll();
  setStatus("パーツを接続しました");
}

function disconnectSelected() {
  const selected = new Set(state.selectedIds);

  if (selected.size < 2) {
    setStatus("接続を解除する2つのパーツを選択してください");
    return;
  }

  const before = state.connections.length;

  const remaining = state.connections.filter(connection =>
    !(selected.has(connection.a) && selected.has(connection.b))
  );

  if (remaining.length === before) {
    setStatus("選択したパーツ間に接続はありません");
    return;
  }

  saveHistory();
  state.connections = remaining;
  renderAll();
  setStatus("選択したパーツ間の接続を解除しました");
}

function renderConnections() {
  connectionLayer.replaceChildren();

  state.connections.forEach(connection => {
    const a = getPart(connection.a);
    const b = getPart(connection.b);

    if (!a || !b) return;

    const layerA = getLayer(a.layerId);
    const layerB = getLayer(b.layerId);

    if (!layerA?.visible || !layerB?.visible) return;

    connectionLayer.appendChild(svgElement("line", {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      class: "connection",
      "data-connection-id": connection.id
    }));
  });
}

/* =========================================
   Selection and dragging
   ========================================= */

function selectPart(id, additive = false) {
  if (additive) {
    if (state.selectedIds.includes(id)) {
      state.selectedIds = state.selectedIds.filter(x => x !== id);
    } else {
      state.selectedIds.push(id);
    }
  } else {
    state.selectedIds = [id];
  }

  renderAll();
}

svg.addEventListener("pointerdown", event => {
  const group = event.target.closest("[data-part-id]");
  if (!group) {
    if (!connectionPicking) {
      state.selectedIds = [];
      renderAll();
    }
    return;
  }

  const id = group.dataset.partId;
  const part = getPart(id);

  if (!part) return;

  if (connectionPicking) {
    if (!state.selectedIds.includes(id)) {
      state.selectedIds.push(id);
    }

    renderAll();

    if (state.selectedIds.length >= 2) {
      const ids = [...state.selectedIds];
      connectParts(ids[0], ids[1]);
      state.selectedIds = [];
      connectionPicking = false;
      $("connectBtn").textContent = "選択したパーツを接続";
      renderAll();
    }
    return;
  }

  const additive = event.shiftKey || event.ctrlKey || event.metaKey;

  selectPart(id, additive);

  if (additive) return;

  const point = canvasPoint(event);

  saveHistory();

  dragData = {
    id,
    startX: point.x,
    startY: point.y,
    originalX: part.x,
    originalY: part.y,
    moved: false
  };

  svg.setPointerCapture(event.pointerId);
});

svg.addEventListener("pointermove", event => {
  if (!dragData) return;

  const point = canvasPoint(event);
  const part = getPart(dragData.id);
  if (!part) return;

  const dx = point.x - dragData.startX;
  const dy = point.y - dragData.startY;

  if (Math.abs(dx) + Math.abs(dy) > 1) {
    dragData.moved = true;
  }

  part.x = dragData.originalX + dx;
  part.y = dragData.originalY + dy;

  renderAll();
});

function finishDrag() {
  if (!dragData) return;

  if (!dragData.moved) {
    undoStack.pop();
    updateHistoryButtons();
  }

  dragData = null;
}

svg.addEventListener("pointerup", finishDrag);
svg.addEventListener("pointercancel", finishDrag);

/* =========================================
   Editing
   ========================================= */

function updateEditor() {
  const selected = state.selectedIds.length === 1
    ? getPart(state.selectedIds[0])
    : null;

  $("partEditor").hidden = !selected;
  $("selectionMessage").hidden = !!selected;

  if (!selected) {
    $("selectionMessage").textContent =
      state.selectedIds.length > 1
        ? state.selectedIds.length + "個のパーツを選択中"
        : "パーツを選択してください。";
    return;
  }

  $("partName").value = selected.name;
  $("physicalWidth").value = selected.physicalWidth;
  $("physicalHeight").value = selected.physicalHeight;
  $("displayScale").value = selected.displayScale;
  $("partColor").value = selected.color;
}

function applyPartChanges() {
  const part = getPart(state.selectedIds[0]);
  if (!part) return;

  const width = Number($("physicalWidth").value);
  const height = Number($("physicalHeight").value);
  const scale = Number($("displayScale").value);

  if (
    !Number.isFinite(width) || width <= 0 ||
    !Number.isFinite(height) || height <= 0 ||
    !Number.isFinite(scale) || scale <= 0
  ) {
    setStatus("寸法と表示倍率には正の数値を入力してください");
    return;
  }

  saveHistory();

  part.name = $("partName").value.trim() || part.name;
  part.physicalWidth = width;
  part.physicalHeight = height;
  part.displayScale = scale;
  part.color = $("partColor").value;

  renderAll();
  setStatus("パーツ情報を更新しました");
}

function duplicateSelected() {
  const original = getPart(state.selectedIds[0]);
  if (!original) return;

  saveHistory();

  const copy = clone(original);
  copy.id = createId("part");
  copy.name = original.name + " コピー";
  copy.x += 30;
  copy.y += 30;

  state.parts.push(copy);
  state.selectedIds = [copy.id];

  renderAll();
  setStatus("パーツを複製しました");
}

function deleteSelected() {
  if (!state.selectedIds.length) return;

  saveHistory();

  const ids = new Set(state.selectedIds);

  state.parts = state.parts.filter(part => !ids.has(part.id));

  // Connections to deleted parts are removed.
  // Other connected parts remain.
  state.connections = state.connections.filter(connection =>
    !ids.has(connection.a) && !ids.has(connection.b)
  );

  state.selectedIds = [];

  renderAll();
  setStatus("選択したパーツを削除しました");
}

/* =========================================
   Layers
   ========================================= */

function renderLayers() {
  const container = $("layerList");
  container.replaceChildren();

  state.layers.forEach(layer => {
    const row = document.createElement("div");
    row.className = "layer-item" +
      (layer.id === state.activeLayerId ? " active" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = layer.visible;
    checkbox.title = "表示切替";

    checkbox.addEventListener("change", () => {
      saveHistory();
      layer.visible = checkbox.checked;

      state.selectedIds = state.selectedIds.filter(id => {
        const part = getPart(id);
        return part && getLayer(part.layerId)?.visible;
      });

      renderAll();
    });

    const name = document.createElement("span");
    name.textContent = layer.name;

    const activate = document.createElement("button");
    activate.type = "button";
    activate.textContent = "選択";
    activate.addEventListener("click", () => {
      state.activeLayerId = layer.id;
      renderLayers();
      setStatus(layer.name + "を編集対象にしました");
    });

    row.append(checkbox, name, activate);
    container.appendChild(row);
  });
}

function addLayer() {
  const name = $("newLayerName").value.trim();
  if (!name) {
    setStatus("レイヤー名を入力してください");
    return;
  }

  saveHistory();

  const layer = {
    id: createId("layer"),
    name,
    visible: true
  };

  state.layers.push(layer);
  state.activeLayerId = layer.id;

  $("newLayerName").value = "";

  renderAll();
  setStatus("レイヤーを追加しました");
}

/* =========================================
   Modes
   ========================================= */

function setMode(mode) {
  state.mode = mode;

  $("designModeBtn").classList.toggle("active", mode === "design");
  $("freeModeBtn").classList.toggle("active", mode === "free");

  $("modeMessage").textContent =
    mode === "design" ? "設計モード" : "デザインモード";

  setStatus(
    mode === "design"
      ? "設計モードに切り替えました"
      : "デザインモードに切り替えました"
  );
}

/* =========================================
   Rendering
   ========================================= */

function renderParts() {
  partLayer.replaceChildren();

  state.parts.forEach(part => {
    const layer = getLayer(part.layerId);
    if (!layer || !layer.visible) return;

    partLayer.appendChild(createPartShape(part));
  });
}

function renderAll() {
  renderConnections();
  renderParts();
  renderLayers();
  updateEditor();
  updateHistoryButtons();
}

/* =========================================
   Save / Load / JSON
   ========================================= */

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus("このブラウザに保存しました");
  } catch (error) {
    setStatus("保存できませんでした");
    console.error(error);
  }
}

function validateData(data) {
  if (!data || !Array.isArray(data.parts) ||
      !Array.isArray(data.connections) ||
      !Array.isArray(data.layers)) {
    throw new Error("データ形式が正しくありません");
  }

  const ids = new Set(data.parts.map(part => part.id));

  data.parts.forEach(part => {
    if (!part.id || !Number.isFinite(part.x) ||
        !Number.isFinite(part.y) ||
        !Number.isFinite(part.physicalWidth) ||
        !Number.isFinite(part.physicalHeight) ||
        !Number.isFinite(part.displayScale) ||
        !data.layers.some(layer => layer.id === part.layerId)) {
      throw new Error("パーツ情報に不正な値があります");
    }
  });

  data.connections.forEach(connection => {
    if (!ids.has(connection.a) || !ids.has(connection.b) ||
        connection.a === connection.b) {
      throw new Error("接続情報に不正な値があります");
    }
  });

  if (!data.layers.length) {
    throw new Error("レイヤーがありません");
  }

  if (!data.layers.some(layer => layer.id === data.activeLayerId)) {
    throw new Error("選択中のレイヤーがありません");
  }

  return true;
}

function loadData(data) {
  validateData(data);

  saveHistory();

  state.version = data.version || "0.1.0";
  state.mode = data.mode || "design";
  state.parts = clone(data.parts);
  state.connections = clone(data.connections);
  state.layers = clone(data.layers);
  state.activeLayerId = data.activeLayerId;
  state.selectedIds = [];

  nextPartNumber = state.parts.length + 1;

  renderAll();
}

function exportJSON() {
  const blob = new Blob(
    [JSON.stringify(state, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "accessory-design.json";
  anchor.click();

  URL.revokeObjectURL(url);
  setStatus("JSONを書き出しました");
}

function importJSON(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      loadData(data);
      setStatus("JSONを読み込みました");
    } catch (error) {
      alert("読み込みに失敗しました: " + error.message);
    }
  };

  reader.onerror = () => {
    alert("ファイルを読み込めませんでした");
  };

  reader.readAsText(file);
}

function loadLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;

  try {
    const data = JSON.parse(saved);
    validateData(data);

    state.version = data.version || "0.1.0";
    state.mode = data.mode || "design";
    state.parts = data.parts;
    state.connections = data.connections;
    state.layers = data.layers;
    state.activeLayerId = data.activeLayerId;

    nextPartNumber = state.parts.length + 1;
    return true;
  } catch (error) {
    console.error("保存データの読み込みに失敗:", error);
    return false;
  }
}

/* =========================================
   Reset
   ========================================= */

function resetAll() {
  if (!confirm("すべてのパーツと接続を削除しますか？")) return;

  saveHistory();

  state.parts = [];
  state.connections = [];
  state.layers = [
    { id: "layer-1", name: "レイヤー1", visible: true }
  ];
  state.activeLayerId = "layer-1";
  state.selectedIds = [];

  nextPartNumber = 1;

  renderAll();
  setStatus("キャンバスを初期化しました");
}

/* =========================================
   Event listeners
   ========================================= */

$("addPartBtn").addEventListener("click", () => {
  addPart($("partType").value);
});

$("undoBtn").addEventListener("click", undo);
$("redoBtn").addEventListener("click", redo);

$("applyPartBtn").addEventListener("click", applyPartChanges);
$("duplicateBtn").addEventListener("click", duplicateSelected);
$("deleteBtn").addEventListener("click", deleteSelected);

$("connectBtn").addEventListener("click", () => {
  connectionPicking = !connectionPicking;
  state.selectedIds = [];

  $("connectBtn").textContent = connectionPicking
    ? "接続するパーツを2つ選択中…"
    : "選択したパーツを接続";

  renderAll();

  setStatus(
    connectionPicking
      ? "キャンバス上のパーツを2つ選択してください"
      : "接続モードを終了しました"
  );
});

$("disconnectBtn").addEventListener("click", disconnectSelected);

$("addLayerBtn").addEventListener("click", addLayer);

$("designModeBtn").addEventListener("click", () => setMode("design"));
$("freeModeBtn").addEventListener("click", () => setMode("free"));

$("saveBtn").addEventListener("click", saveLocal);
$("exportBtn").addEventListener("click", exportJSON);

$("importFile").addEventListener("change", event => {
  importJSON(event.target.files[0]);
  event.target.value = "";
});

$("resetBtn").addEventListener("click", resetAll);

/* =========================================
   Keyboard shortcuts
   ========================================= */

document.addEventListener("keydown", event => {
  const target = event.target;
  const editing = target &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

  if (editing) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelected();
  }

  if (event.key === "Escape") {
    connectionPicking = false;
    state.selectedIds = [];
    $("connectBtn").textContent = "選択したパーツを接続";
    renderAll();
  }
});

/* =========================================
   Start
   ========================================= */

if (!loadLocal()) {
  setStatus("新しい設計を開始します");
} else {
  setStatus("保存データを読み込みました");
}

renderAll();
