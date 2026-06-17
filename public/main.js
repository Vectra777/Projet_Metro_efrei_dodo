"use strict";

const $ = (id) => document.getElementById(id);

const els = {
  pickHint: $("pickHint"),
  fromStation: $("fromStation"),
  toStation: $("toStation"),
  travelDate: $("travelDate"),
  travelTime: $("travelTime"),
  searchBtn: $("searchBtn"),
  resetViewBtn: $("resetViewBtn"),
  connectivityBtn: $("connectivityBtn"),
  mstToggle: $("mstToggle"),
  playMstBtn: $("playMstBtn"),
  connectivityResult: $("connectivityResult"),
  mstResult: $("mstResult"),
  routeResult: $("routeResult"),
  canvas: $("networkCanvas"),
  stationTooltip: $("stationTooltip"),
  legend: $("legend"),
};

const TILE_SIZE = 256;
const TILE_ZOOM = 12;
const TILE_SUBDOMAINS = ["a", "b", "c", "d"];
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

const state = {
  network: null,
  outgoingTransit: [],
  outgoingTransfers: [],
  stationAdj: [],
  stationCoords: [],
  mstEdges: [],
  mstTimer: null,
  mstProgress: 0,
  routeStationEdges: [],
  routeStationSet: new Set(),
  tileCache: new Map(),
  nextPick: "from",
  hoveredStation: null,
  transform: { scale: 1, x: 0, y: 0 },
  projection: null,
  dragging: false,
  movedDuringPointer: false,
  pointerStart: null,
  lastPointer: null,
};

class PriorityQueue {
  constructor() {
    this.items = [];
  }

  push(node, priority) {
    const item = { node, priority };
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= this.items[index].priority) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  sinkDown(index) {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }

  get size() {
    return this.items.length;
  }
}

class DisjointSet {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = new Array(size).fill(0);
  }

  find(value) {
    if (this.parent[value] !== value) this.parent[value] = this.find(this.parent[value]);
    return this.parent[value];
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return false;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA]++;
    return true;
  }
}

async function init() {
  setEnabled(false);
  try {
    // The browser only consumes the compact generated graph. Raw GTFS stays out
    // of the client because stop_times.txt is hundreds of megabytes.
    const response = await fetch("./data/network.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.network = await response.json();
    indexNetwork();
    fillControls();
    buildLegend();
    bindEvents();
    resizeCanvas();
    computeMst();
    setEnabled(true);
    draw();
  } catch (error) {
    els.routeResult.innerHTML = "Impossible de charger <code>public/data/network.json</code>. Lancez <code>python3 scripts/build_network.py</code> puis servez le dossier <code>public/</code>.";
    console.error(error);
  }
}

function setEnabled(enabled) {
  for (const element of [
    els.fromStation,
    els.toStation,
    els.travelDate,
    els.travelTime,
    els.searchBtn,
    els.connectivityBtn,
    els.mstToggle,
    els.playMstBtn,
  ]) {
    element.disabled = !enabled;
  }
}

function indexNetwork() {
  const network = state.network;
  // Pre-index outgoing edges once so Dijkstra can relax neighbors quickly.
  state.outgoingTransit = Array.from({ length: network.stops.length }, () => []);
  for (const edge of network.edges) {
    state.outgoingTransit[edge[0]].push(edge);
  }
  state.outgoingTransfers = Array.from({ length: network.stops.length }, () => []);
  for (const transfer of network.transfers) {
    state.outgoingTransfers[transfer[0]].push(transfer);
  }
  state.stationAdj = Array.from({ length: network.stations.length }, () => []);
  for (const edge of network.stationEdges) {
    state.stationAdj[edge[0]].push(edge[1]);
    state.stationAdj[edge[1]].push(edge[0]);
  }
  buildProjection();
}

function fillControls() {
  const network = state.network;
  const options = network.stations
    .map((station, index) => ({ index, name: station.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const fragmentA = document.createDocumentFragment();
  const fragmentB = document.createDocumentFragment();
  for (const optionData of options) {
    const optionA = document.createElement("option");
    optionA.value = String(optionData.index);
    optionA.textContent = optionData.name;
    const optionB = optionA.cloneNode(true);
    fragmentA.append(optionA);
    fragmentB.append(optionB);
  }
  els.fromStation.append(fragmentA);
  els.toStation.append(fragmentB);

  const pont = options.find((item) => item.name.includes("Pont de Neuilly"));
  const villejuif = options.find((item) => item.name.includes("Villejuif") && item.name.includes("Vaillant"));
  if (pont) els.fromStation.value = String(pont.index);
  if (villejuif) els.toStation.value = String(villejuif.index);

  els.travelDate.min = network.dates[0];
  els.travelDate.max = network.dates[network.dates.length - 1];
  els.travelDate.value = network.dates[Math.min(5, network.dates.length - 1)];
}

function buildLegend() {
  els.legend.innerHTML = "";
  for (const route of state.network.routes) {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${route.color}"></span>${route.mode === "rer" ? "RER " : "M"}${route.shortName}`;
    els.legend.append(item);
  }
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);
  els.searchBtn.addEventListener("click", searchRoute);
  els.fromStation.addEventListener("change", draw);
  els.toStation.addEventListener("change", draw);
  els.connectivityBtn.addEventListener("click", showConnectivity);
  els.mstToggle.addEventListener("change", () => {
    window.clearInterval(state.mstTimer);
    state.mstProgress = els.mstToggle.checked ? state.mstEdges.length : 0;
    draw();
  });
  els.playMstBtn.addEventListener("click", playMst);
  els.resetViewBtn.addEventListener("click", () => {
    state.transform = { scale: 1, x: 0, y: 0 };
    draw();
  });

  els.canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.movedDuringPointer = false;
    state.pointerStart = { x: event.clientX, y: event.clientY };
    state.lastPointer = { x: event.clientX, y: event.clientY };
    els.canvas.setPointerCapture(event.pointerId);
  });
  els.canvas.addEventListener("pointermove", (event) => {
    if (state.dragging && state.lastPointer) {
      const dx = event.clientX - state.lastPointer.x;
      const dy = event.clientY - state.lastPointer.y;
      if (state.pointerStart && Math.hypot(event.clientX - state.pointerStart.x, event.clientY - state.pointerStart.y) > 5) {
        state.movedDuringPointer = true;
      }
      state.transform.x += dx;
      state.transform.y += dy;
      state.lastPointer = { x: event.clientX, y: event.clientY };
      draw();
      return;
    }
    updateHover(event);
  });
  els.canvas.addEventListener("pointerup", (event) => {
    if (!state.movedDuringPointer) {
      handleStationClick(event.clientX, event.clientY);
    }
    if (els.canvas.hasPointerCapture(event.pointerId)) {
      els.canvas.releasePointerCapture(event.pointerId);
    }
    state.dragging = false;
    state.pointerStart = null;
    state.lastPointer = null;
  });
  els.canvas.addEventListener("pointerleave", () => {
    state.hoveredStation = null;
    els.stationTooltip.style.display = "none";
    if (!state.dragging) draw();
  });
  els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const oldScale = state.transform.scale;
    const nextScale = Math.max(0.55, Math.min(8, oldScale * (event.deltaY < 0 ? 1.12 : 0.88)));
    state.transform.x = pointerX - ((pointerX - state.transform.x) / oldScale) * nextScale;
    state.transform.y = pointerY - ((pointerY - state.transform.y) / oldScale) * nextScale;
    state.transform.scale = nextScale;
    draw();
  }, { passive: false });
}

function visualScale() {
  return Math.max(0.75, Math.min(1.65, state.transform.scale ** 0.22));
}

function buildProjection() {
  const stations = state.network.stations;
  // Web Mercator keeps station coordinates aligned with the raster map tiles.
  const raw = stations.map((station) => lonLatToWorld(station.lon, station.lat, TILE_ZOOM));
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  state.projection = {
    raw,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function lonLatToWorld(lon, lat, zoom) {
  const scale = TILE_SIZE * (2 ** zoom);
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function resizeCanvas() {
  syncCanvasSize();
  draw();
}

function syncCanvasSize() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
  const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
  if (els.canvas.width !== nextWidth) els.canvas.width = nextWidth;
  if (els.canvas.height !== nextHeight) els.canvas.height = nextHeight;
}

function projectStation(index) {
  return projectWorld(state.projection.raw[index]);
}

function viewParams() {
  const rect = els.canvas.getBoundingClientRect();
  const projection = state.projection;
  const padding = 42;
  const width = Math.max(1, rect.width - padding * 2);
  const height = Math.max(1, rect.height - padding * 2);
  const scale = Math.min(
    width / Math.max(0.001, projection.maxX - projection.minX),
    height / Math.max(0.001, projection.maxY - projection.minY),
  );
  return { rect, padding, scale };
}

function projectWorld(point) {
  const projection = state.projection;
  const { padding, scale } = viewParams();
  const baseX = padding + (point.x - projection.minX) * scale;
  const baseY = padding + (point.y - projection.minY) * scale;
  return {
    x: baseX * state.transform.scale + state.transform.x,
    y: baseY * state.transform.scale + state.transform.y,
  };
}

function screenToWorld(screenX, screenY) {
  const projection = state.projection;
  const { padding, scale } = viewParams();
  return {
    x: ((screenX - state.transform.x) / state.transform.scale - padding) / scale + projection.minX,
    y: ((screenY - state.transform.y) / state.transform.scale - padding) / scale + projection.minY,
  };
}

function draw() {
  if (!state.network || !state.projection) return;
  // The result panel can change layout size; syncing here prevents stretched
  // canvas pixels and keeps mouse hit-testing aligned with what is drawn.
  syncCanvasSize();
  clampTransform();
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawMapBackground(ctx);

  for (const edge of state.network.stationEdges) {
    if (!isBackgroundEdgeVisible(edge)) continue;
    drawStationLine(ctx, edge, state.network.routes[edge[2]].color, 3.1, 0.58);
  }

  if (els.mstToggle.checked || state.mstProgress > 0) {
    for (let index = 0; index < Math.min(state.mstProgress, state.mstEdges.length); index++) {
      drawStationLine(ctx, state.mstEdges[index], "#ffcb47", 5.2, 0.9);
    }
  }

  for (const edge of state.routeStationEdges) {
    drawStationLine(ctx, edge, "#ffffff", 8.2, 0.95);
    drawStationLine(ctx, edge, state.network.routes[edge[2]]?.color || "#08a6c8", 5.2, 1);
  }

  drawStations(ctx);
}

function projectedNetworkBounds() {
  const projection = state.projection;
  const { padding, scale } = viewParams();
  const baseWidth = (projection.maxX - projection.minX) * scale;
  const baseHeight = (projection.maxY - projection.minY) * scale;
  return {
    left: padding * state.transform.scale + state.transform.x,
    top: padding * state.transform.scale + state.transform.y,
    right: (padding + baseWidth) * state.transform.scale + state.transform.x,
    bottom: (padding + baseHeight) * state.transform.scale + state.transform.y,
  };
}

function clampTransform() {
  const rect = els.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const margin = Math.min(140, Math.max(70, Math.min(rect.width, rect.height) * 0.16));
  const bounds = projectedNetworkBounds();
  const contentWidth = bounds.right - bounds.left;
  const contentHeight = bounds.bottom - bounds.top;

  if (contentWidth <= rect.width - margin * 2) {
    state.transform.x += (rect.width - contentWidth) / 2 - bounds.left;
  } else {
    if (bounds.left > rect.width - margin) state.transform.x -= bounds.left - (rect.width - margin);
    if (bounds.right < margin) state.transform.x += margin - bounds.right;
  }

  const nextBounds = projectedNetworkBounds();
  if (contentHeight <= rect.height - margin * 2) {
    state.transform.y += (rect.height - contentHeight) / 2 - nextBounds.top;
  } else {
    if (nextBounds.top > rect.height - margin) state.transform.y -= nextBounds.top - (rect.height - margin);
    if (nextBounds.bottom < margin) state.transform.y += margin - nextBounds.bottom;
  }
}

function limitedWorldBounds() {
  const projection = state.projection;
  const marginX = (projection.maxX - projection.minX) * 0.08;
  const marginY = (projection.maxY - projection.minY) * 0.08;
  return {
    minX: projection.minX - marginX,
    maxX: projection.maxX + marginX,
    minY: projection.minY - marginY,
    maxY: projection.maxY + marginY,
  };
}

function drawStationLine(ctx, edge, color, width, alpha) {
  const from = projectStation(edge[0]);
  const to = projectStation(edge[1]);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width * visualScale();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function isBackgroundEdgeVisible(edge) {
  // GTFS in this repo has no shapes.txt, so long express segments would appear
  // as misleading diagonals. Hide them in the background map only; keep them
  // available for route calculation and selected-route display.
  const route = state.network.routes[edge[2]];
  const distance = stationDistanceKm(edge[0], edge[1]);
  if (route.mode === "metro") return distance <= 3.2;
  return distance <= 8;
}

function stationDistanceKm(fromIndex, toIndex) {
  const from = state.network.stations[fromIndex];
  const to = state.network.stations[toIndex];
  const radius = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function drawMapBackground(ctx) {
  const rect = els.canvas.getBoundingClientRect();
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(rect.width, rect.height);
  const limits = limitedWorldBounds();
  const minX = Math.max(limits.minX, Math.min(topLeft.x, bottomRight.x));
  const maxX = Math.min(limits.maxX, Math.max(topLeft.x, bottomRight.x));
  const minY = Math.max(limits.minY, Math.min(topLeft.y, bottomRight.y));
  const maxY = Math.min(limits.maxY, Math.max(topLeft.y, bottomRight.y));
  if (minX >= maxX || minY >= maxY) {
    ctx.fillStyle = "#dff4ff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    return;
  }
  const maxTile = (2 ** TILE_ZOOM) - 1;
  const startX = Math.max(0, Math.floor(minX / TILE_SIZE));
  const endX = Math.min(maxTile, Math.floor(maxX / TILE_SIZE));
  const startY = Math.max(0, Math.floor(minY / TILE_SIZE));
  const endY = Math.min(maxTile, Math.floor(maxY / TILE_SIZE));

  ctx.globalAlpha = 0.62;
  for (let tileX = startX; tileX <= endX; tileX++) {
    for (let tileY = startY; tileY <= endY; tileY++) {
      const key = `${TILE_ZOOM}/${tileX}/${tileY}`;
      const img = getTileImage(key, tileX, tileY);
      const p1 = projectWorld({ x: tileX * TILE_SIZE, y: tileY * TILE_SIZE });
      const p2 = projectWorld({ x: (tileX + 1) * TILE_SIZE, y: (tileY + 1) * TILE_SIZE });
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, p1.x, p1.y, p2.x - p1.x + 1, p2.y - p1.y + 1);
      } else {
        ctx.fillStyle = (tileX + tileY) % 2 ? "#dff4ff" : "#edfaff";
        ctx.fillRect(p1.x, p1.y, p2.x - p1.x + 1, p2.y - p1.y + 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
  ctx.fillRect(0, 0, rect.width, rect.height);
}

function getTileImage(key, tileX, tileY) {
  if (state.tileCache.has(key)) return state.tileCache.get(key);
  const img = new Image();
  const subdomain = TILE_SUBDOMAINS[Math.abs(tileX + tileY) % TILE_SUBDOMAINS.length];
  img.src = TILE_URL
    .replace("{s}", subdomain)
    .replace("{z}", String(TILE_ZOOM))
    .replace("{x}", String(tileX))
    .replace("{y}", String(tileY));
  img.onload = draw;
  state.tileCache.set(key, img);
  return img;
}

function drawStations(ctx) {
  const selectedFrom = Number(els.fromStation.value);
  const selectedTo = Number(els.toStation.value);
  const scale = visualScale();
  for (let index = 0; index < state.network.stations.length; index++) {
    const point = projectStation(index);
    const highlighted = state.routeStationSet.has(index) || index === selectedFrom || index === selectedTo;
    const hovered = state.hoveredStation === index;
    ctx.fillStyle = index === selectedFrom ? "#17c3b2" : index === selectedTo ? "#ff4f8b" : highlighted ? "#ffffff" : "#1d2530";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = (hovered || highlighted ? 1.6 : 0.8) * scale;
    ctx.globalAlpha = highlighted || hovered ? 1 : 0.82;
    ctx.beginPath();
    ctx.arc(point.x, point.y, (hovered ? 4.8 : highlighted ? 3.5 : 1.75) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function updateHover(event) {
  const rect = els.canvas.getBoundingClientRect();
  const station = findNearestStation(event.clientX - rect.left, event.clientY - rect.top, 10);
  state.hoveredStation = station;
  if (station === null) {
    els.stationTooltip.style.display = "none";
  } else {
    const item = state.network.stations[station];
    els.stationTooltip.textContent = item.name;
    els.stationTooltip.style.display = "block";
    els.stationTooltip.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 14}px)`;
  }
  els.canvas.style.cursor = station === null ? "grab" : "pointer";
  draw();
}

function handleStationClick(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  const station = findNearestStation(clientX - rect.left, clientY - rect.top, 12);
  if (station === null) return;

  if (state.nextPick === "from") {
    els.fromStation.value = String(station);
    state.nextPick = "to";
    els.pickHint.textContent = `${state.network.stations[station].name} choisi comme départ. Clique l'arrivée.`;
  } else {
    els.toStation.value = String(station);
    state.nextPick = "from";
    els.pickHint.textContent = "Clique sur une station pour choisir le départ, puis une autre pour l'arrivée.";
    searchRoute();
  }
  draw();
}

function findNearestStation(screenX, screenY, threshold) {
  let best = null;
  let bestDistance = threshold;
  for (let index = 0; index < state.network.stations.length; index++) {
    const point = projectStation(index);
    const distance = Math.hypot(point.x - screenX, point.y - screenY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function parseInputTime() {
  const [hours, minutes] = els.travelTime.value.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

function selectedStartAbs() {
  const dateIndex = state.network.dates.indexOf(els.travelDate.value);
  return dateIndex * 86400 + parseInputTime();
}

function activeOn(mask, dayIndex) {
  if (dayIndex < 0 || dayIndex >= state.network.dates.length) return false;
  return Math.floor(mask / (2 ** dayIndex)) % 2 === 1;
}

function nextSchedule(edge, currentAbs) {
  // Pick the earliest scheduled departure that can still be boarded after the
  // current absolute time. Dates are checked through the service bit masks.
  const schedules = edge[4];
  const currentDay = Math.floor(currentAbs / 86400);
  let best = null;
  for (const schedule of schedules) {
    const [serviceIndex, departure, arrival] = schedule;
    const mask = state.network.services[serviceIndex];
    const firstDay = Math.max(0, currentDay - 1);
    const lastDay = Math.min(state.network.dates.length - 1, currentDay + 3);
    for (let day = firstDay; day <= lastDay; day++) {
      if (!activeOn(mask, day)) continue;
      const absoluteDeparture = day * 86400 + departure;
      if (absoluteDeparture < currentAbs) continue;
      const absoluteArrival = day * 86400 + arrival;
      if (!best || absoluteArrival < best.arrival) {
        best = {
          departure: absoluteDeparture,
          arrival: absoluteArrival,
          route: edge[2],
          headsign: edge[3],
        };
      }
    }
  }
  return best;
}

function searchRoute() {
  const fromStation = Number(els.fromStation.value);
  const toStation = Number(els.toStation.value);
  if (fromStation === toStation) {
    els.routeResult.textContent = "Le départ et l'arrivée sont identiques.";
    return;
  }
  const startAbs = selectedStartAbs();
  if (!Number.isFinite(startAbs) || startAbs < 0) {
    els.routeResult.textContent = "Choisissez une date comprise dans les données disponibles.";
    return;
  }
  const result = dijkstra(fromStation, toStation, startAbs);
  if (!result) {
    els.routeResult.textContent = "Aucun trajet trouvé à partir de cette date et de cette heure.";
    state.routeStationEdges = [];
    state.routeStationSet = new Set();
    draw();
    return;
  }
  renderRouteResult(result, startAbs);
  draw();
}

function dijkstra(fromStation, toStation, startAbs) {
  // Time-dependent Dijkstra: the cost of a transit edge depends on the next
  // available departure after the traveler reaches the stop.
  const stops = state.network.stops;
  const stations = state.network.stations;
  const dist = new Float64Array(stops.length);
  dist.fill(Number.POSITIVE_INFINITY);
  const previous = new Array(stops.length);
  const queue = new PriorityQueue();

  for (const stopIndex of stations[fromStation].stops) {
    dist[stopIndex] = startAbs;
    queue.push(stopIndex, startAbs);
  }

  let bestStop = null;
  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || current.priority !== dist[current.node]) continue;
    const stopIndex = current.node;
    if (stops[stopIndex].station === toStation) {
      bestStop = stopIndex;
      break;
    }

    for (const transfer of state.outgoingTransfers[stopIndex]) {
      const toStop = transfer[1];
      const arrival = current.priority + transfer[2];
      if (arrival < dist[toStop]) {
        dist[toStop] = arrival;
        previous[toStop] = { type: "transfer", from: stopIndex, seconds: transfer[2] };
        queue.push(toStop, arrival);
      }
    }

    for (const edge of state.outgoingTransit[stopIndex]) {
      const schedule = nextSchedule(edge, current.priority);
      if (!schedule) continue;
      const toStop = edge[1];
      if (schedule.arrival < dist[toStop]) {
        dist[toStop] = schedule.arrival;
        previous[toStop] = {
          type: "ride",
          from: stopIndex,
          route: schedule.route,
          headsign: schedule.headsign,
          departure: schedule.departure,
          arrival: schedule.arrival,
        };
        queue.push(toStop, schedule.arrival);
      }
    }
  }

  if (bestStop === null) return null;
  const legs = [];
  let cursor = bestStop;
  while (previous[cursor]) {
    const step = previous[cursor];
    legs.push({ ...step, to: cursor });
    cursor = step.from;
  }
  legs.reverse();
  return { arrival: dist[bestStop], legs };
}

function renderRouteResult(result, startAbs) {
  const duration = result.arrival - startAbs;
  const collapsed = collapseLegs(result.legs);
  const from = state.network.stations[Number(els.fromStation.value)].name;
  const to = state.network.stations[Number(els.toStation.value)].name;
  const routeEdges = [];
  const routeStations = new Set([Number(els.fromStation.value), Number(els.toStation.value)]);

  for (const leg of result.legs) {
    const fromStation = state.network.stops[leg.from].station;
    const toStation = state.network.stops[leg.to].station;
    routeStations.add(fromStation);
    routeStations.add(toStation);
    if (leg.type === "ride" && fromStation !== toStation) {
      routeEdges.push([fromStation, toStation, leg.route, Math.max(1, leg.arrival - leg.departure)]);
    }
  }
  state.routeStationEdges = routeEdges;
  state.routeStationSet = routeStations;

  const stepsHtml = collapsed.map(renderCollapsedLeg).join("");
  els.routeResult.innerHTML = `
    <div class="route-title">
      <span>${formatDuration(duration)}</span>
      <span>${formatClock(result.arrival)}</span>
    </div>
    <div class="route-meta">${escapeHtml(from)} → ${escapeHtml(to)} · départ ${formatClock(startAbs)}</div>
    ${stepsHtml}
  `;
}

function collapseLegs(legs) {
  const collapsed = [];
  for (const leg of legs) {
    if (leg.type === "ride") {
      const last = collapsed[collapsed.length - 1];
      if (last && last.type === "ride" && last.route === leg.route && last.headsign === leg.headsign) {
        last.to = leg.to;
        last.arrival = leg.arrival;
        last.stopCount++;
      } else {
        collapsed.push({ ...leg, stopCount: 1 });
      }
    } else {
      collapsed.push({ ...leg });
    }
  }
  return collapsed;
}

function renderCollapsedLeg(leg) {
  const fromStation = state.network.stations[state.network.stops[leg.from].station];
  const toStation = state.network.stations[state.network.stops[leg.to].station];
  if (leg.type === "transfer") {
    return `
      <div class="step">
        <strong>Correspondance à ${escapeHtml(fromStation.name)}</strong>
        <span class="route-meta">${formatDuration(leg.seconds)}</span>
      </div>
    `;
  }
  const route = state.network.routes[leg.route];
  const headsign = state.network.headsigns[leg.headsign] || "";
  return `
    <div class="step">
      <strong><span class="line-pill" style="background:${route.color};color:${route.textColor}">${route.mode === "rer" ? "RER " : ""}${escapeHtml(route.shortName)}</span> ${escapeHtml(fromStation.name)} → ${escapeHtml(toStation.name)}</strong>
      <span class="route-meta">Direction ${escapeHtml(headsign)} · ${formatClock(leg.departure)} → ${formatClock(leg.arrival)} · ${leg.stopCount} arrêt${leg.stopCount > 1 ? "s" : ""}</span>
    </div>
  `;
}

function showConnectivity() {
  // Connexity means every station belongs to one reachable component.
  // A disconnected result reveals isolated graph groups in the data.
  const stationCount = state.network.stations.length;
  const visited = new Array(stationCount).fill(false);
  const components = [];
  for (let start = 0; start < stationCount; start++) {
    if (visited[start]) continue;
    const queue = [start];
    const component = [];
    visited[start] = true;
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      for (const next of state.stationAdj[current]) {
        if (visited[next]) continue;
        visited[next] = true;
        queue.push(next);
      }
    }
    components.push(component);
  }

  if (components.length === 1) {
    els.connectivityResult.textContent = `Tout est relié : les ${stationCount} stations sont atteignables entre elles.`;
  } else {
    const sizes = components.map((component) => component.length).sort((a, b) => b - a).join(", ");
    els.connectivityResult.textContent = `Réseau séparé : ${components.length} groupes non reliés (${sizes}).`;
  }
}

function computeMst() {
  // Kruskal on the station-level graph gives the minimum spanning tree used by
  // the "arbre couvrant" overlay.
  const stationCount = state.network.stations.length;
  const dsu = new DisjointSet(stationCount);
  const edges = [...state.network.stationEdges].sort((a, b) => a[3] - b[3]);
  state.mstEdges = [];
  let total = 0;
  for (const edge of edges) {
    if (!dsu.union(edge[0], edge[1])) continue;
    state.mstEdges.push(edge);
    total += edge[3];
  }
  state.mstWeight = total;
  els.mstResult.textContent = `ACPM : ${state.mstEdges.length} arêtes, poids total ${formatDuration(total)}.`;
}

function playMst() {
  window.clearInterval(state.mstTimer);
  els.mstToggle.checked = true;
  state.mstProgress = 0;
  state.mstTimer = window.setInterval(() => {
    state.mstProgress += Math.max(1, Math.ceil(state.mstEdges.length / 180));
    if (state.mstProgress >= state.mstEdges.length) {
      state.mstProgress = state.mstEdges.length;
      window.clearInterval(state.mstTimer);
    }
    draw();
  }, 28);
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")}`;
  return `${minutes} min ${String(rest).padStart(2, "0")}`;
}

function formatClock(absSeconds) {
  const day = Math.floor(absSeconds / 86400);
  const seconds = ((Math.round(absSeconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const label = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const selectedDay = state.network.dates.indexOf(els.travelDate.value);
  if (day > selectedDay && state.network.dates[day]) return `${label} (+${day - selectedDay}j)`;
  return label;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
