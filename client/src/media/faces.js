const entries = Array.isArray(window.__FACE_ENTRIES__) ? window.__FACE_ENTRIES__ : [];
const viewerConfig = window.__FACE_VIEWER_CONFIG__ || {};
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const raceStage = document.getElementById('raceStage');
const builderStage = document.getElementById('builderStage');
const raceList = document.getElementById('raceList');
const raceStatus = document.getElementById('raceStatus');
const selectedRaceSummary = document.getElementById('selectedRaceSummary');
const selectedRaceName = document.getElementById('selectedRaceName');
const changeRaceBtn = document.getElementById('changeRaceBtn');
const addLayerBtn = document.getElementById('addLayerBtn');
const clearLayersBtn = document.getElementById('clearLayersBtn');
const layersList = document.getElementById('layersList');
const layersEmpty = document.getElementById('layersEmpty');
const sheetCanvas = document.getElementById('sheetCanvas');
const previewCanvas = document.getElementById('previewCanvas');
const previewFrameEl = previewCanvas ? previewCanvas.closest('.preview-frame') : null;
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const rebuildBtn = document.getElementById('rebuildBtn');
const copyBtn = document.getElementById('copyBtn');
const insertBtn = document.getElementById('insertBtn');

if (!raceStage || !builderStage || !raceList || !raceStatus || !selectedRaceSummary || !selectedRaceName || !changeRaceBtn || !addLayerBtn || !clearLayersBtn || !layersList || !layersEmpty || !sheetCanvas || !previewCanvas || !previewFrameEl || !titleEl || !subtitleEl || !statusEl || !outputEl || !rebuildBtn || !copyBtn || !insertBtn) {
	throw new Error('Face builder DOM initialization failed.');
}

const sheetCtx = sheetCanvas.getContext('2d');
const previewCtx = previewCanvas.getContext('2d');

if (!sheetCtx || !previewCtx) {
	throw new Error('Face builder canvas initialization failed.');
}

const imageCache = new Map();
const FIXED_TILE_SIZE = 512;
let currentEntry = null;
let currentImage = null;
let selectedTile = null;
let layers = [];
let previewMode = 'zoom';

function getTileSize() {
	return FIXED_TILE_SIZE;
}

function setStatus(text) {
	statusEl.textContent = text;
}

function setRaceStatus(text) {
	raceStatus.textContent = text;
}

function formatFaceString() {
	if (layers.length === 0) {
		return '""';
	}
	return '"' + layers.map((layer) => `${layer.raceId} ${layer.color} ${layer.x} ${layer.y}`).join(';') + ';"';
}

function normalizeHexColor(input) {
	const raw = String(input || '').trim().toLowerCase();
	const hex = raw.startsWith('#') ? raw.slice(1) : raw;
	if (/^[0-9a-f]{3}$/.test(hex)) {
		return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
	}
	if (/^[0-9a-f]{6}$/.test(hex)) {
		return `#${hex}`;
	}
	return null;
}

function parseFaceString(raw) {
	const trimmed = String(raw || '').trim();
	if (!trimmed || trimmed === '""') {
		return [];
	}

	let body = trimmed;
	if ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'"))) {
		body = body.slice(1, -1).trim();
	}

	if (!body) {
		return [];
	}

	const tokens = body.split(';').map((part) => part.trim()).filter(Boolean);
	const parsed = [];

	for (const token of tokens) {
		const parts = token.split(/\s+/);
		if (parts.length !== 4) {
			throw new Error(`Invalid layer token: ${token}`);
		}

		const [raceId, colorRaw, xRaw, yRaw] = parts;
		const color = normalizeHexColor(colorRaw);
		if (!color) {
			throw new Error(`Invalid color value: ${colorRaw}`);
		}

		const x = Number.parseInt(xRaw, 10);
		const y = Number.parseInt(yRaw, 10);
		if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
			throw new Error(`Invalid tile coordinates: ${xRaw} ${yRaw}`);
		}

		const entry = entries.find((item) => item.raceId === raceId);
		if (!entry) {
			throw new Error(`Unknown race id in face string: ${raceId}`);
		}

		parsed.push({
			raceId,
			fileName: entry.fileName,
			color,
			x,
			y
		});
	}

	return parsed;
}

function updateOutput() {
	outputEl.value = formatFaceString();
}

function showRaceStage() {
	raceStage.hidden = false;
	builderStage.hidden = true;
	setRaceStatus(entries.length > 0 ? 'Select a race to start building.' : 'No face sheets found.');
}

function showBuilderStage() {
	raceStage.hidden = true;
	builderStage.hidden = false;
	requestAnimationFrame(() => {
		applyPreviewMode();
	});
}

function applyPreviewMode() {
	if (previewMode === 'zoom') {
		previewCanvas.style.width = '256px';
		previewCanvas.style.height = '256px';
		return;
	}

	const previewPanel = previewCanvas.closest('.sidebar-preview');
	const previewFrame = previewCanvas.closest('.preview-frame');
	if (!previewPanel || !previewFrame) {
		previewCanvas.style.width = '128px';
		previewCanvas.style.height = '128px';
		return;
	}

	const panelHeight = previewPanel.clientHeight;
	if (panelHeight <= 0) {
		return;
	}

	const frameStyle = window.getComputedStyle(previewFrame);
	const framePaddingY = parseFloat(frameStyle.paddingTop || '0') + parseFloat(frameStyle.paddingBottom || '0');
	const available = panelHeight - framePaddingY - 24;
	const fitSize = Math.max(72, Math.min(256, Math.floor(available)));

	previewCanvas.style.width = `${fitSize}px`;
	previewCanvas.style.height = `${fitSize}px`;
}

function clearCanvas(ctx, canvas) {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function loadImage(entry) {
	if (!entry) {
		return Promise.resolve(null);
	}
	const cached = imageCache.get(entry.imageUri);
	if (cached) {
		return Promise.resolve(cached);
	}
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			imageCache.set(entry.imageUri, img);
			resolve(img);
		};
		img.onerror = () => reject(new Error('Failed to load face sheet.'));
		img.src = entry.imageUri;
	});
}

function getGridSize() {
	if (!currentImage) {
		return { cols: 0, rows: 0 };
	}
	const tileSize = getTileSize();
	return {
		cols: Math.max(1, Math.floor(currentImage.naturalWidth / tileSize)),
		rows: Math.max(1, Math.floor(currentImage.naturalHeight / tileSize))
	};
}

function drawSheet() {
	clearCanvas(sheetCtx, sheetCanvas);
	if (!currentImage) {
		return;
	}

	sheetCanvas.width = currentImage.naturalWidth;
	sheetCanvas.height = currentImage.naturalHeight;
	sheetCtx.drawImage(currentImage, 0, 0);

	const tileSize = getTileSize();
	const { cols, rows } = getGridSize();
	sheetCtx.strokeStyle = 'rgba(142, 209, 255, 0.3)';
	sheetCtx.lineWidth = 1;

	for (let x = 0; x <= cols; x++) {
		sheetCtx.beginPath();
		sheetCtx.moveTo(x * tileSize + 0.5, 0);
		sheetCtx.lineTo(x * tileSize + 0.5, rows * tileSize);
		sheetCtx.stroke();
	}

	for (let y = 0; y <= rows; y++) {
		sheetCtx.beginPath();
		sheetCtx.moveTo(0, y * tileSize + 0.5);
		sheetCtx.lineTo(cols * tileSize, y * tileSize + 0.5);
		sheetCtx.stroke();
	}

	if (selectedTile) {
		sheetCtx.strokeStyle = '#ffd08e';
		sheetCtx.lineWidth = 3;
		sheetCtx.strokeRect(selectedTile.x * tileSize + 1.5, selectedTile.y * tileSize + 1.5, tileSize - 3, tileSize - 3);
	}
}

function drawTintedTile(ctx, img, layer, destSize) {
	const tileSize = getTileSize();
	const tempCanvas = document.createElement('canvas');
	tempCanvas.width = tileSize;
	tempCanvas.height = tileSize;
	const tempCtx = tempCanvas.getContext('2d');
	if (!tempCtx) {
		return;
	}
	tempCtx.clearRect(0, 0, tileSize, tileSize);
	tempCtx.drawImage(
		img,
		layer.x * tileSize,
		layer.y * tileSize,
		tileSize,
		tileSize,
		0,
		0,
		tileSize,
		tileSize
	);
	
	// Parse hex color to RGB for tinting
	const hex = layer.color.replace('#', '');
	const tintR = parseInt(hex.slice(0, 2), 16);
	const tintG = parseInt(hex.slice(2, 4), 16);
	const tintB = parseInt(hex.slice(4, 6), 16);
	
	// Get pixel data and apply tint only to non-transparent/non-white pixels
	const imageData = tempCtx.getImageData(0, 0, tileSize, tileSize);
	const data = imageData.data;
	
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const a = data[i + 3];
		
		// Skip if transparent
		if (a < 128) continue;
		
		// Apply tint using multiply blend: new = original * tint / 255
		data[i] = Math.round(r * tintR / 255);
		data[i + 1] = Math.round(g * tintG / 255);
		data[i + 2] = Math.round(b * tintB / 255);
	}
	
	tempCtx.putImageData(imageData, 0, 0);
	ctx.drawImage(tempCanvas, 0, 0, destSize, destSize);
}

async function renderPreview() {
	clearCanvas(previewCtx, previewCanvas);
	const destSize = Math.min(previewCanvas.width, previewCanvas.height);
	for (const layer of layers) {
		const entry = entries.find((item) => item.raceId === layer.raceId);
		if (!entry) {
			continue;
		}
		const img = await loadImage(entry);
		if (!img) {
			continue;
		}
		drawTintedTile(previewCtx, img, layer, destSize);
	}

	// Render the currently selected tile as a temporary candidate layer.
	if (currentEntry && selectedTile) {
		const selectedImg = await loadImage(currentEntry);
		if (selectedImg) {
			drawTintedTile(
				previewCtx,
				selectedImg,
				{
					raceId: currentEntry.raceId,
					fileName: currentEntry.fileName,
					color: '#ffffff',
					x: selectedTile.x,
					y: selectedTile.y
				},
				destSize
			);
		}
	}
}

function renderTilePreview(canvas, layer) {
	const size = 42;
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx || !currentImage) return;
	
	const srcTileSize = getTileSize();
	ctx.drawImage(
		currentImage,
		layer.x * srcTileSize,
		layer.y * srcTileSize,
		srcTileSize,
		srcTileSize,
		0,
		0,
		size,
		size
	);
}

function openColorPicker(currentColor, callback) {
	// Create overlay to close picker on click outside
	const overlay = document.createElement('div');
	overlay.className = 'color-picker-overlay';
	
	// Create color picker popup
	const popup = document.createElement('div');
	popup.className = 'color-picker-popup';
	
	// Close function
	function closePicker(finalColor) {
		document.body.removeChild(overlay);
		document.body.removeChild(popup);
		callback(finalColor);
	}
	
	let hue = 0, sat = 100, val = 100;

	function normalizeHex(input) {
		const trimmed = String(input || '').trim().toLowerCase();
		const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
		if (/^[0-9a-f]{3}$/i.test(raw)) {
			return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
		}
		if (/^[0-9a-f]{6}$/i.test(raw)) {
			return `#${raw}`;
		}
		return null;
	}

	function rgbToHsv(r, g, b) {
		const rf = r / 255;
		const gf = g / 255;
		const bf = b / 255;
		const max = Math.max(rf, gf, bf);
		const min = Math.min(rf, gf, bf);
		const delta = max - min;
		let h = 0;
		if (delta !== 0) {
			if (max === rf) h = ((gf - bf) / delta) * 60;
			else if (max === gf) h = ((bf - rf) / delta) * 60 + 120;
			else h = ((rf - gf) / delta) * 60 + 240;
		}
		if (h < 0) {
			h += 360;
		}
		return {
			h,
			s: max === 0 ? 0 : (delta / max) * 100,
			v: max * 100
		};
	}

	function applyHexToHsv(hexColor) {
		const normalized = normalizeHex(hexColor);
		if (!normalized) {
			return false;
		}
		const hex = normalized.slice(1);
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		const hsv = rgbToHsv(r, g, b);
		hue = hsv.h;
		sat = hsv.s;
		val = hsv.v;
		return true;
	}

	applyHexToHsv(currentColor);
	
	// Hue slider
	const hueCanvas = document.createElement('canvas');
	hueCanvas.className = 'hue-slider';
	hueCanvas.width = 180;
	hueCanvas.height = 20;
	const hueCtx = hueCanvas.getContext('2d');
	if (hueCtx) {
		for (let x = 0; x < hueCanvas.width; x++) {
			const h = (x / hueCanvas.width) * 360;
			hueCtx.fillStyle = `hsl(${h}, 100%, 50%)`;
			hueCtx.fillRect(x, 0, 1, hueCanvas.height);
		}
	}
	
	// Sat/Val canvas
	const svCanvas = document.createElement('canvas');
	svCanvas.className = 'sat-val-canvas';
	svCanvas.width = 180;
	svCanvas.height = 120;
	const svCtx = svCanvas.getContext('2d');
	
	function redrawSV() {
		if (!svCtx) return;
		// Saturation (left to right) and Value (top to bottom)
		const imageData = svCtx.createImageData(svCanvas.width, svCanvas.height);
		const data = imageData.data;
		for (let y = 0; y < svCanvas.height; y++) {
			for (let x = 0; x < svCanvas.width; x++) {
				const s = (x / svCanvas.width) * 100;
				const v = 100 - (y / svCanvas.height) * 100;
				const rgb = hsv2rgb(hue, s, v);
				const idx = (y * svCanvas.width + x) * 4;
				data[idx] = rgb.r;
				data[idx + 1] = rgb.g;
				data[idx + 2] = rgb.b;
				data[idx + 3] = 255;
			}
		}
		svCtx.putImageData(imageData, 0, 0);
	}
	
	redrawSV();
	
	// Color display
	const display = document.createElement('div');
	display.className = 'color-display';

	const hexInput = document.createElement('input');
	hexInput.type = 'text';
	hexInput.className = 'color-hex-input';
	hexInput.maxLength = 7;
	hexInput.placeholder = '#ffffff';
	hexInput.spellcheck = false;
	hexInput.autocomplete = 'off';

	function updateColor(syncInput = true) {
		const rgb = hsv2rgb(hue, sat, val);
		const hex = `#${((rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).padStart(6, '0')}`;
		display.style.background = hex;
		if (syncInput) {
			hexInput.value = hex;
		}
		return hex;
	}

	hexInput.value = normalizeHex(currentColor) || updateColor();
	
	hueCanvas.addEventListener('click', (e) => {
		e.stopPropagation();
		const rect = hueCanvas.getBoundingClientRect();
		hue = ((e.clientX - rect.left) / rect.width) * 360;
		redrawSV();
		updateColor();
	});
	
	svCanvas.addEventListener('mousemove', (e) => {
		if (!(e.buttons & 1)) return; // Not dragging
		const rect = svCanvas.getBoundingClientRect();
		sat = ((e.clientX - rect.left) / rect.width) * 100;
		val = 100 - ((e.clientY - rect.top) / rect.height) * 100;
		updateColor();
	});
	
	svCanvas.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		const rect = svCanvas.getBoundingClientRect();
		sat = ((e.clientX - rect.left) / rect.width) * 100;
		val = 100 - ((e.clientY - rect.top) / rect.height) * 100;
		updateColor();
	});

	hexInput.addEventListener('input', () => {
		const normalized = normalizeHex(hexInput.value);
		if (!normalized) {
			return;
		}
		if (applyHexToHsv(normalized)) {
			redrawSV();
			updateColor(false);
		}
	});

	hexInput.addEventListener('blur', () => {
		const normalized = normalizeHex(hexInput.value);
		if (!normalized) {
			hexInput.value = updateColor();
			return;
		}
		applyHexToHsv(normalized);
		redrawSV();
		updateColor();
	});

	hexInput.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') {
			return;
		}
		event.preventDefault();
		const normalized = normalizeHex(hexInput.value);
		if (!normalized) {
			hexInput.value = updateColor();
			return;
		}
		applyHexToHsv(normalized);
		redrawSV();
		updateColor();
	});
	
	// Close button
	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'color-picker-close';
	closeBtn.textContent = '✕';
	closeBtn.title = 'Close color picker';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		closePicker(updateColor());
	});
	
	const header = document.createElement('div');
	header.style.display = 'flex';
	header.style.justifyContent = 'space-between';
	header.style.alignItems = 'center';
	header.style.marginBottom = '4px';
	
	const title = document.createElement('div');
	title.style.fontSize = '12px';
	title.style.fontWeight = '700';
	title.textContent = 'Color';
	
	header.appendChild(title);
	header.appendChild(closeBtn);
	
	popup.appendChild(header);
	popup.appendChild(hueCanvas);
	popup.appendChild(svCanvas);
	popup.appendChild(display);
	popup.appendChild(hexInput);
	
	// Stop propagation on popup to prevent closing when clicking inside
	popup.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	overlay.addEventListener('click', () => {
		closePicker(updateColor());
	});
	
	document.body.appendChild(overlay);
	document.body.appendChild(popup);
	
	// Position popup near mouse
	popup.style.left = '20px';
	popup.style.top = '20px';
}

function hsv2rgb(h, s, v) {
	s /= 100;
	v /= 100;
	const c = v * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = v - c;
	let r, g, b;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

function renderLayers() {
	layersList.innerHTML = '';
	layersEmpty.hidden = layers.length > 0;

	layers.forEach((layer, index) => {
		const item = document.createElement('div');
		item.className = 'layer-item';

		const top = document.createElement('div');
		top.className = 'layer-top';

		// Actions
		const actions = document.createElement('div');
		actions.className = 'layer-actions layer-actions-inline';
		const moveActions = document.createElement('div');
		moveActions.className = 'layer-actions-move';
		const removeActions = document.createElement('div');
		removeActions.className = 'layer-actions-remove';

		// Tile preview
		const previewCanvas = document.createElement('canvas');
		previewCanvas.className = 'layer-preview';
		renderTilePreview(previewCanvas, layer);

		// Info section
		const info = document.createElement('div');
		info.className = 'layer-info';

		const label = document.createElement('div');
		label.className = 'layer-label';
		label.textContent = `${index + 1}. ${layer.raceId} (${layer.x}, ${layer.y})`;

		const meta = document.createElement('div');
		meta.className = 'layer-meta';
		meta.textContent = `Color ${layer.color}`;

		info.appendChild(label);
		info.appendChild(meta);

		// Color picker button
		const colorBtn = document.createElement('button');
		colorBtn.className = 'color-picker-trigger';
		colorBtn.style.background = layer.color;
		colorBtn.title = 'Click to pick color';
		colorBtn.addEventListener('click', () => {
			openColorPicker(layer.color, (newColor) => {
				layers[index] = { ...layers[index], color: newColor };
				renderLayers();
				renderPreview();
				updateOutput();
			});
		});

		top.appendChild(previewCanvas);
		top.appendChild(info);
		top.appendChild(actions);
		top.appendChild(colorBtn);

		const upBtn = document.createElement('button');
		upBtn.type = 'button';
		upBtn.textContent = 'Up';
		upBtn.disabled = index === 0;
		upBtn.addEventListener('click', () => {
			if (index === 0) return;
			const next = layers.slice();
			[next[index - 1], next[index]] = [next[index], next[index - 1]];
			layers = next;
			renderLayers();
			renderPreview();
			updateOutput();
		});

		const downBtn = document.createElement('button');
		downBtn.type = 'button';
		downBtn.textContent = 'Down';
		downBtn.disabled = index === layers.length - 1;
		downBtn.addEventListener('click', () => {
			if (index === layers.length - 1) return;
			const next = layers.slice();
			[next[index + 1], next[index]] = [next[index], next[index + 1]];
			layers = next;
			renderLayers();
			renderPreview();
			updateOutput();
		});

		const removeBtn = document.createElement('button');
		removeBtn.type = 'button';
		removeBtn.textContent = 'Remove';
		removeBtn.addEventListener('click', () => {
			layers = layers.filter((_, layerIndex) => layerIndex !== index);
			renderLayers();
			renderPreview();
			updateOutput();
		});

		moveActions.appendChild(upBtn);
		moveActions.appendChild(downBtn);
		removeActions.appendChild(removeBtn);
		actions.appendChild(moveActions);
		actions.appendChild(removeActions);

		item.appendChild(top);
		layersList.appendChild(item);
	});
}

async function selectRace(raceId, options = {}) {
	const { addDefaultLayer = true } = options;
	const entry = entries.find((item) => item.raceId === raceId) || null;
	currentEntry = entry;
	selectedTile = null;
	if (!entry) {
		currentImage = null;
		clearCanvas(sheetCtx, sheetCanvas);
		setStatus('No race sheets available.');
		titleEl.textContent = 'No race selected';
		subtitleEl.textContent = 'No face sheet could be resolved from allFaceFiles.txt.';
		return;
	}

	showBuilderStage();
	selectedRaceName.textContent = entry.raceId;
	selectedRaceSummary.textContent = `Building a face string for ${entry.raceId} using ${entry.fileName}.`;
	titleEl.textContent = entry.raceId;
	subtitleEl.textContent = `Source sheet ${entry.fileName}`;
	setStatus('Loading face sheet...');
	try {
		currentImage = await loadImage(entry);
		setStatus('Face sheet ready.');
		drawSheet();
		if (addDefaultLayer && layers.length === 0) {
			layers = [{
				raceId: entry.raceId,
				fileName: entry.fileName,
				color: '#ffffff',
				x: 0,
				y: 0
			}];
			renderLayers();
			renderPreview();
			updateOutput();
			setStatus('Face sheet ready. Added default layer at tile (0, 0).');
		}
	} catch (error) {
		currentImage = null;
		clearCanvas(sheetCtx, sheetCanvas);
		setStatus('Failed to load face sheet.');
		subtitleEl.textContent = String(error && error.message ? error.message : error);
	}
}

async function rebuildLayersFromOutput() {
	try {
		const parsedLayers = parseFaceString(outputEl.value);
		if (parsedLayers.length === 0) {
			layers = [];
			renderLayers();
			renderPreview();
			updateOutput();
			setStatus('Cleared layers from face string.');
			return;
		}

		await selectRace(parsedLayers[0].raceId, { addDefaultLayer: false });
		layers = parsedLayers;
		renderLayers();
		renderPreview();
		updateOutput();
		setStatus(`Loaded ${parsedLayers.length} layers from face string.`);
	} catch (error) {
		setStatus(String(error && error.message ? error.message : error));
	}
}

function renderRaceOptions() {
	raceList.innerHTML = '';
	entries.forEach((entry) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'race-option';

		const title = document.createElement('div');
		title.className = 'race-option-title';
		title.textContent = entry.raceId;

		const meta = document.createElement('div');
		meta.className = 'race-option-meta';
		meta.textContent = entry.fileName;

		button.appendChild(title);
		button.appendChild(meta);
		button.addEventListener('click', () => {
			selectRace(entry.raceId);
		});
		raceList.appendChild(button);
	});
}

function addSelectedTile() {
	if (!currentEntry || !selectedTile) {
		setStatus('Select a tile before adding a layer.');
		return;
	}
	const tileToAdd = { ...selectedTile };
	layers = layers.concat({
		raceId: currentEntry.raceId,
		fileName: currentEntry.fileName,
		color: '#ffffff',
		x: tileToAdd.x,
		y: tileToAdd.y
	});
	selectedTile = null;
	drawSheet();
	renderLayers();
	renderPreview();
	updateOutput();
	setStatus(`Added ${currentEntry.raceId} tile (${tileToAdd.x}, ${tileToAdd.y}).`);
}

sheetCanvas.addEventListener('click', (event) => {
	if (!currentImage) {
		return;
	}
	const rect = sheetCanvas.getBoundingClientRect();
	const scaleX = sheetCanvas.width / rect.width;
	const scaleY = sheetCanvas.height / rect.height;
	const x = (event.clientX - rect.left) * scaleX;
	const y = (event.clientY - rect.top) * scaleY;
	const tileSize = getTileSize();
	selectedTile = {
		x: Math.floor(x / tileSize),
		y: Math.floor(y / tileSize)
	};
	drawSheet();
	renderPreview();
	});

addLayerBtn.addEventListener('click', addSelectedTile);
clearLayersBtn.addEventListener('click', () => {
	layers = [];
	renderLayers();
	renderPreview();
	updateOutput();
	setStatus('Cleared face layers.');
});

changeRaceBtn.addEventListener('click', () => {
	selectedTile = null;
	currentEntry = null;
	currentImage = null;
	clearCanvas(sheetCtx, sheetCanvas);
	showRaceStage();
});

previewFrameEl.addEventListener('click', () => {
	previewMode = previewMode === 'zoom' ? 'fit' : 'zoom';
	applyPreviewMode();
});

rebuildBtn.addEventListener('click', () => {
	rebuildLayersFromOutput();
});

window.addEventListener('resize', () => {
	if (previewMode === 'fit') {
		applyPreviewMode();
	}
});

copyBtn.addEventListener('click', () => {
	if (!vscodeApi) {
		return;
	}
	vscodeApi.postMessage({
		command: 'copyFaceString',
		value: outputEl.value
	});
});

insertBtn.addEventListener('click', () => {
	if (!vscodeApi) {
		return;
	}
	vscodeApi.postMessage({
		command: 'insertFaceString',
		value: outputEl.value,
		targetUri: viewerConfig.sourceUri || ''
	});
	});

updateOutput();
renderLayers();
renderPreview();
applyPreviewMode();

if (entries.length === 0) {
	showRaceStage();
	setStatus('No face sheets found.');
	setRaceStatus('No face sheets found.');
	titleEl.textContent = 'No race sheets found';
	subtitleEl.textContent = 'Check allFaceFiles.txt and the graphics folders in your Artemis installation.';
	insertBtn.disabled = true;
	copyBtn.disabled = true;
} else {
	showRaceStage();
	renderRaceOptions();
}