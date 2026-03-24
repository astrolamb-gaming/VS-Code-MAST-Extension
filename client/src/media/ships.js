import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const entries = Array.isArray(window.__SHIP_ENTRIES__) ? window.__SHIP_ENTRIES__ : [];
const viewerConfig = window.__SHIP_VIEWER_CONFIG__ || { mode: 'browse', argumentName: '' };
const isInsertMode = viewerConfig.mode === 'insert';
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

console.log('Ship viewer module loaded. Entries:', entries.length);

const shipListEl = document.getElementById('shipList');
const searchEl = document.getElementById('search');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const insertKeyBtn = document.getElementById('insertKeyBtn');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const diffuseToggleBtn = document.getElementById('diffuseToggleBtn');
const diffuseRotateBtn = document.getElementById('diffuseRotateBtn');
const specularToggleBtn = document.getElementById('specularToggleBtn');
const specularRotateBtn = document.getElementById('specularRotateBtn');
const emissiveToggleBtn = document.getElementById('emissiveToggleBtn');
const emissiveRotateBtn = document.getElementById('emissiveRotateBtn');
const normalToggleBtn = document.getElementById('normalToggleBtn');
const normalRotateBtn = document.getElementById('normalRotateBtn');
const mapDebugBtn = document.getElementById('mapDebugBtn');
const overlayEl = document.getElementById('overlay');
const mapDebugPanelEl = document.getElementById('mapDebugPanel');
const canvas = document.getElementById('viewport');
const materialSettingButtons = Array.from(document.querySelectorAll('.material-setting-btn'));
const pendingPreviewGeneration = new Set();

if (!shipListEl || !searchEl || !titleEl || !subtitleEl || !overlayEl || !mapDebugPanelEl || !canvas || !insertKeyBtn || !copyKeyBtn || !mapDebugBtn || !diffuseToggleBtn || !diffuseRotateBtn || !specularToggleBtn || !specularRotateBtn || !emissiveToggleBtn || !emissiveRotateBtn || !normalToggleBtn || !normalRotateBtn) {
	console.error('Missing required DOM elements in ships webview.');
	throw new Error('Ship viewer DOM initialization failed.');
}

if (isInsertMode) {
	insertKeyBtn.hidden = false;
	insertKeyBtn.textContent = 'Insert Selected Ship Key';
	subtitleEl.textContent = 'Pick a ship, then insert its key into the active MAST file.';
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
camera.position.set(2.2, 1.3, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(5, 8, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x80c6ff, 0.5);
rim.position.set(-6, 3, -5);
scene.add(rim);

const grid = new THREE.GridHelper(8, 16, 0x35516f, 0x1f3145);
grid.position.y = 0;
scene.add(grid);

let activeObject = null;
let activeIndex = -1;
let mapDebugVisible = false;
let diffuseVisible = true;
let specularVisible = true;
let emissiveVisible = true;
let normalVisible = true;
let diffuseRotationTurns = 0;
let specularRotationTurns = 0;
let emissiveRotationTurns = 0;
let normalRotationTurns = 0;
let loadRequestId = 0;

const mtlLoader = new MTLLoader();
const textureLoader = new THREE.TextureLoader();

const MATERIAL_TEXTURE_PROPS = [
	'map',
	'specularMap',
	'emissiveMap',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'aoMap',
	'alphaMap',
	'bumpMap',
	'lightMap',
	'displacementMap'
];

const DEBUG_MAP_FIELDS = [
	{ prop: 'map', label: 'diffuse' },
	{ prop: 'specularMap', label: 'specular' },
	{ prop: 'emissiveMap', label: 'emissive' },
	{ prop: 'normalMap', label: 'normal' }
];

const CHANNEL_VISIBILITY_CONFIG = {
	diffuse: {
		prop: 'map',
		storedKey: '__originalDiffuseMap',
		storedFlag: '__originalDiffuseMapStored',
		storedRotationKey: '__originalDiffuseMapRotation',
		button: diffuseToggleBtn,
		rotateButton: diffuseRotateBtn,
		label: 'Diffuse'
	},
	specular: {
		prop: 'specularMap',
		storedKey: '__originalSpecularMap',
		storedFlag: '__originalSpecularMapStored',
		storedRotationKey: '__originalSpecularMapRotation',
		button: specularToggleBtn,
		rotateButton: specularRotateBtn,
		label: 'Specular'
	},
	emissive: {
		prop: 'emissiveMap',
		storedKey: '__originalEmissiveMap',
		storedFlag: '__originalEmissiveMapStored',
		storedRotationKey: '__originalEmissiveMapRotation',
		button: emissiveToggleBtn,
		rotateButton: emissiveRotateBtn,
		label: 'Emissive'
	},
	normal: {
		prop: 'normalMap',
		storedKey: '__originalNormalMap',
		storedFlag: '__originalNormalMapStored',
		storedRotationKey: '__originalNormalMapRotation',
		button: normalToggleBtn,
		rotateButton: normalRotateBtn,
		label: 'Normal'
	}
};

const ALLOW_AGGRESSIVE_SECONDARY_FALLBACK = true;

function setMapDebugVisible(isVisible) {
	mapDebugVisible = isVisible;
	mapDebugPanelEl.hidden = !mapDebugVisible;
	mapDebugBtn.classList.toggle('active', mapDebugVisible);
	mapDebugBtn.textContent = mapDebugVisible ? 'Hide Map Debug' : 'Show Map Debug';
	for (const btn of materialSettingButtons) {
		btn.hidden = !mapDebugVisible;
		btn.disabled = !mapDebugVisible;
	}
}

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizeQuarterTurns(turns) {
	return ((turns % 4) + 4) % 4;
}

function quarterTurnsToRadians(turns) {
	return normalizeQuarterTurns(turns) * (Math.PI / 2);
}

function radiansToDegrees(radians) {
	return Math.round((radians * 180) / Math.PI);
}

function getChannelRotationTurns(channel) {
	switch (channel) {
		case 'diffuse':
			return diffuseRotationTurns;
		case 'specular':
			return specularRotationTurns;
		case 'emissive':
			return emissiveRotationTurns;
		case 'normal':
			return normalRotationTurns;
		default:
			return 0;
	}
}

function setChannelRotationTurns(channel, turns) {
	const normalized = normalizeQuarterTurns(turns);
	switch (channel) {
		case 'diffuse':
			diffuseRotationTurns = normalized;
			break;
		case 'specular':
			specularRotationTurns = normalized;
			break;
		case 'emissive':
			emissiveRotationTurns = normalized;
			break;
		case 'normal':
			normalRotationTurns = normalized;
			break;
	}
}

function updateChannelRotationButtonText(channel) {
	const cfg = CHANNEL_VISIBILITY_CONFIG[channel];
	if (!cfg || !cfg.rotateButton) {
		return;
	}
	const deg = normalizeQuarterTurns(getChannelRotationTurns(channel)) * 90;
	cfg.rotateButton.textContent = `${cfg.label} Rot ${deg}deg`;
}

function applyChannelRotation(mat, channel) {
	const cfg = CHANNEL_VISIBILITY_CONFIG[channel];
	if (!cfg || !mat || !mat[cfg.prop]) {
		return;
	}

	const tex = mat[cfg.prop];
	const defaultRotation = typeof mat.userData[cfg.storedRotationKey] === 'number' ? mat.userData[cfg.storedRotationKey] : (typeof tex.rotation === 'number' ? tex.rotation : 0);
	tex.center.set(0.5, 0.5);
	tex.rotation = defaultRotation + quarterTurnsToRadians(getChannelRotationTurns(channel));
	tex.needsUpdate = true;
}

function applyChannelVisibility(root, channel, isVisible) {
	const cfg = CHANNEL_VISIBILITY_CONFIG[channel];
	if (!cfg) {
		return;
	}

	if (!root) {
		return;
	}

	root.traverse((node) => {
		if (!node.isMesh || !node.material) {
			return;
		}

		const mats = Array.isArray(node.material) ? node.material : [node.material];
		for (const mat of mats) {
			if (!mat || !(cfg.prop in mat)) {
				continue;
			}

			if (!mat.userData[cfg.storedFlag]) {
				const originalMap = mat[cfg.prop] || null;
				mat.userData[cfg.storedKey] = originalMap;
				mat.userData[cfg.storedFlag] = true;
				mat.userData[cfg.storedRotationKey] = originalMap && typeof originalMap.rotation === 'number' ? originalMap.rotation : 0;
			}

			mat[cfg.prop] = isVisible ? (mat.userData[cfg.storedKey] || null) : null;
			if (isVisible && mat[cfg.prop]) {
				applyChannelRotation(mat, channel);
			}
			mat.needsUpdate = true;
		}
	});
}

function applyAllChannelVisibility(root) {
	applyChannelVisibility(root, 'diffuse', diffuseVisible);
	applyChannelVisibility(root, 'specular', specularVisible);
	applyChannelVisibility(root, 'emissive', emissiveVisible);
	applyChannelVisibility(root, 'normal', normalVisible);
}

function setDiffuseVisible(isVisible) {
	diffuseVisible = isVisible;
	diffuseToggleBtn.classList.toggle('active', diffuseVisible);
	diffuseToggleBtn.textContent = diffuseVisible ? 'Diffuse On' : 'Diffuse Off';
	applyChannelVisibility(activeObject, 'diffuse', diffuseVisible);
}

function setSpecularVisible(isVisible) {
	specularVisible = isVisible;
	specularToggleBtn.classList.toggle('active', specularVisible);
	specularToggleBtn.textContent = specularVisible ? 'Specular On' : 'Specular Off';
	applyChannelVisibility(activeObject, 'specular', specularVisible);
}

function setEmissiveVisible(isVisible) {
	emissiveVisible = isVisible;
	emissiveToggleBtn.classList.toggle('active', emissiveVisible);
	emissiveToggleBtn.textContent = emissiveVisible ? 'Emissive On' : 'Emissive Off';
	applyChannelVisibility(activeObject, 'emissive', emissiveVisible);
}

function setNormalVisible(isVisible) {
	normalVisible = isVisible;
	normalToggleBtn.classList.toggle('active', normalVisible);
	normalToggleBtn.textContent = normalVisible ? 'Normal On' : 'Normal Off';
	applyChannelVisibility(activeObject, 'normal', normalVisible);
}

function rotateChannel(channel) {
	setChannelRotationTurns(channel, getChannelRotationTurns(channel) + 1);
	updateChannelRotationButtonText(channel);

	if (!activeObject) {
		return;
	}

	const cfg = CHANNEL_VISIBILITY_CONFIG[channel];
	const channelVisible = channel === 'diffuse' ? diffuseVisible : channel === 'specular' ? specularVisible : channel === 'emissive' ? emissiveVisible : normalVisible;
	if (!cfg || !channelVisible) {
		return;
	}

	activeObject.traverse((node) => {
		if (!node.isMesh || !node.material) {
			return;
		}
		const mats = Array.isArray(node.material) ? node.material : [node.material];
		for (const mat of mats) {
			if (!mat || !(cfg.prop in mat) || !mat[cfg.prop]) {
				continue;
			}
			applyChannelRotation(mat, channel);
			mat.needsUpdate = true;
		}
	});
}

function getMaterialDebugName(meshName, mat, materialIndex) {
	const meshLabel = meshName || '(unnamed mesh)';
	const materialLabel = mat?.name || `(material ${materialIndex + 1})`;
	return `${meshLabel} -> ${materialLabel}`;
}

function renderMapDebugReport(root, fallbackAssignments, mtlLoaded) {
	function getTextureLabel(tex) {
		if (!tex) {
			return '';
		}

		const uri = typeof tex.name === 'string' ? tex.name : '';
		if (!uri) {
			return '';
		}

		const normalized = uri.split('?')[0];
		const parts = normalized.split('/');
		return parts.length > 0 ? parts[parts.length - 1] : normalized;
	}

	if (!root) {
		mapDebugPanelEl.textContent = 'No model loaded.';
		return;
	}

	const lines = [];
	let materialCount = 0;
	let fallbackCount = 0;
	let mtlCount = 0;
	let noneCount = 0;

	root.traverse((node) => {
		if (!node.isMesh || !node.material) {
			return;
		}

		const mats = Array.isArray(node.material) ? node.material : [node.material];
		for (let i = 0; i < mats.length; i++) {
			const mat = mats[i];
			if (!mat) {
				continue;
			}

			materialCount += 1;
			lines.push(getMaterialDebugName(node.name, mat, i));
			const assigned = fallbackAssignments.get(mat.uuid) || new Set();

			for (const field of DEBUG_MAP_FIELDS) {
				let source = 'none';
				const mapLabel = getTextureLabel(mat[field.prop]);
				const channel = field.prop === 'map' ? 'diffuse' : field.prop === 'specularMap' ? 'specular' : field.prop === 'emissiveMap' ? 'emissive' : 'normal';
				const cfg = CHANNEL_VISIBILITY_CONFIG[channel];
				const defaultRotation = typeof mat.userData[cfg.storedRotationKey] === 'number' ? mat.userData[cfg.storedRotationKey] : 0;
				const currentRotation = mat[field.prop] && typeof mat[field.prop].rotation === 'number' ? mat[field.prop].rotation : defaultRotation;
				if (assigned.has(field.prop)) {
					source = 'fallback';
					fallbackCount += 1;
				} else if (mat[field.prop]) {
					source = mtlLoaded ? 'mtl' : 'existing';
					mtlCount += 1;
				} else {
					noneCount += 1;
				}

				const fileSuffix = mapLabel ? ` (${mapLabel})` : '';
				const rotationSuffix = ` [default:${radiansToDegrees(defaultRotation)}deg current:${radiansToDegrees(currentRotation)}deg]`;
				lines.push(`  ${field.label}: ${source}${fileSuffix}${rotationSuffix}`);
			}
		}
	});

	const header = [
		`Materials: ${materialCount}`,
		`Fallback maps: ${fallbackCount}`,
		`MTL/existing maps: ${mtlCount}`,
		`Missing maps: ${noneCount}`,
		''
	];

	mapDebugPanelEl.textContent = header.concat(lines).join('\n');
}

function resize() {
	const rect = canvas.getBoundingClientRect();
	const w = Math.max(1, rect.width);
	const h = Math.max(1, rect.height);
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}

function frameObject(obj) {
	// Ensure camera aspect is current before fit calculations.
	resize();

	const initialBox = new THREE.Box3().setFromObject(obj);
	const initialCenter = new THREE.Vector3();
	initialBox.getCenter(initialCenter);

	// Center model on X/Z and place its base on the ground plane.
	obj.position.x -= initialCenter.x;
	obj.position.z -= initialCenter.z;
	obj.position.y -= initialBox.min.y;
	obj.updateMatrixWorld(true);

	const box = new THREE.Box3().setFromObject(obj);
	const size = new THREE.Vector3();
	const center = new THREE.Vector3();
	const sphere = new THREE.Sphere();
	box.getSize(size);
	box.getCenter(center);
	box.getBoundingSphere(sphere);

	const radius = Math.max(0.01, sphere.radius);
	const vFov = THREE.MathUtils.degToRad(camera.fov);
	const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
	const fitHeightDist = radius / Math.tan(vFov / 2);
	const fitWidthDist = radius / Math.tan(hFov / 2);
	const distance = Math.max(fitHeightDist, fitWidthDist) * 1.35;

	// Keep framing centered on the mesh center so the model starts centered on canvas.
	controls.target.set(center.x, center.y, center.z);

	const viewDir = new THREE.Vector3(1, 0.5, 1).normalize();
	camera.position.copy(controls.target).addScaledVector(viewDir, distance);
	camera.near = Math.max(0.01, distance / 500);
	camera.far = Math.max(5000, distance * 20);
	camera.updateProjectionMatrix();
	controls.update();
}

function setOverlay(text, warning = false) {
	overlayEl.textContent = text;
	overlayEl.classList.toggle('warning', warning);
}

function clearModel() {
	if (!activeObject) {
		return;
	}

	const texturesToDispose = new Set();
	scene.remove(activeObject);
	activeObject.traverse((node) => {
		if (node.geometry) {
			node.geometry.dispose();
		}
		if (node.material) {
			const mats = Array.isArray(node.material) ? node.material : [node.material];
			for (const m of mats) {
				if (m && typeof m.dispose === 'function') {
					if (m.userData) {
						for (const key of ['__originalDiffuseMap', '__originalSpecularMap', '__originalEmissiveMap', '__originalNormalMap']) {
							const tex = m.userData[key];
							if (tex && typeof tex.dispose === 'function') {
								texturesToDispose.add(tex);
							}
						}
					}
					for (const prop of MATERIAL_TEXTURE_PROPS) {
						const tex = m[prop];
						if (tex && typeof tex.dispose === 'function') {
							texturesToDispose.add(tex);
						}
					}
					m.dispose();
				}
			}
		}
	});
	texturesToDispose.forEach((tex) => tex.dispose());
	activeObject = null;
}

function buildButtonPreviewMarkup(entry) {
	if (!entry.previewUri) {
		return '<div class="ship-thumb">3D</div>';
	}
	return '<div class="ship-thumb"><img src="' + escapeHtml(entry.previewUri) + '" alt="' + escapeHtml(entry.key || entry.artFileRoot || 'ship') + '" /></div>';
}

function generatePreviewDataUrl() {
	const targetSize = 128;
	const sourceWidth = canvas.width || canvas.clientWidth || targetSize;
	const sourceHeight = canvas.height || canvas.clientHeight || targetSize;
	const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
	const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
	const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
	const offsetX = Math.floor((targetSize - drawWidth) / 2);
	const offsetY = Math.floor((targetSize - drawHeight) / 2);

	const output = document.createElement('canvas');
	output.width = targetSize;
	output.height = targetSize;
	const ctx = output.getContext('2d');
	if (!ctx) {
		return '';
	}

	ctx.clearRect(0, 0, targetSize, targetSize);
	ctx.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
	return output.toDataURL('image/png');
}

function renderTopDownPreviewDataUrl(obj) {
	if (!obj) {
		return generatePreviewDataUrl();
	}

	const savedPosition = camera.position.clone();
	const savedQuaternion = camera.quaternion.clone();
	const savedUp = camera.up.clone();
	const savedNear = camera.near;
	const savedFar = camera.far;
	const savedTarget = controls.target.clone();
	const materialSwaps = [];

	try {
		resize();

		const box = new THREE.Box3().setFromObject(obj);
		const size = new THREE.Vector3();
		const center = new THREE.Vector3();
		box.getSize(size);
		box.getCenter(center);

		const halfWidth = Math.max(0.01, size.x / 2);
		const halfDepth = Math.max(0.01, size.z / 2);
		const vFov = THREE.MathUtils.degToRad(camera.fov);
		const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
		const fitDepthDist = halfDepth / Math.tan(vFov / 2);
		const fitWidthDist = halfWidth / Math.tan(hFov / 2);
		const distance = Math.max(fitDepthDist, fitWidthDist, size.y) * 1.2;

		obj.traverse((node) => {
			if (!node.isMesh || !node.material) {
				return;
			}

			const originalMaterials = Array.isArray(node.material) ? node.material : [node.material];
			const previewMaterials = originalMaterials.map((material) => {
				const color = material && material.color && typeof material.color.clone === 'function'
					? material.color.clone()
					: new THREE.Color(0xdbe8f5);
				return new THREE.MeshBasicMaterial({
					color,
					transparent: false,
					opacity: 1,
					side: THREE.DoubleSide
				});
			});

			materialSwaps.push({
				node,
				original: node.material,
				preview: previewMaterials
			});

			node.material = Array.isArray(node.material) ? previewMaterials : previewMaterials[0];
		});

		controls.target.copy(center);
		camera.up.set(0, 0, -1);
		camera.position.set(center.x, center.y + distance, center.z);
		camera.near = Math.max(0.01, distance / 500);
		camera.far = Math.max(5000, distance * 20);
		camera.lookAt(center);
		camera.updateProjectionMatrix();
		controls.update();
		renderer.render(scene, camera);

		return generatePreviewDataUrl();
	} finally {
		for (const swap of materialSwaps) {
			swap.node.material = swap.original;
			for (const material of swap.preview) {
				material.dispose();
			}
		}

		camera.position.copy(savedPosition);
		camera.quaternion.copy(savedQuaternion);
		camera.up.copy(savedUp);
		camera.near = savedNear;
		camera.far = savedFar;
		controls.target.copy(savedTarget);
		camera.updateProjectionMatrix();
		controls.update();
		renderer.render(scene, camera);
	}
}

function maybeGeneratePreview(entry) {
	if (!entry || entry.previewUri || !entry.artFileRoot || !vscodeApi || pendingPreviewGeneration.has(entry.artFileRoot)) {
		return;
	}

	pendingPreviewGeneration.add(entry.artFileRoot);
	try {
		const dataUrl = renderTopDownPreviewDataUrl(activeObject);
		if (!dataUrl) {
			pendingPreviewGeneration.delete(entry.artFileRoot);
			return;
		}
		vscodeApi.postMessage({
			command: 'saveShipPreview',
			artFileRoot: entry.artFileRoot,
			dataUrl
		});
	} catch (err) {
		pendingPreviewGeneration.delete(entry.artFileRoot);
		console.error('Failed to generate ship preview:', err);
	}
}

function getResourceBase(uri) {
	const idx = uri.lastIndexOf('/');
	return idx >= 0 ? uri.slice(0, idx + 1) : uri;
}

async function loadTextureSafe(uri, useSrgbColorSpace) {
	if (!uri) {
		return null;
	}

	try {
		const texture = await textureLoader.loadAsync(uri);
		texture.name = uri;
		if (useSrgbColorSpace) {
			texture.colorSpace = THREE.SRGBColorSpace;
		}
		texture.needsUpdate = true;
		return texture;
	} catch (err) {
		console.warn('Failed to load texture:', uri, err);
		return null;
	}
}

function applyFallbackTextures(root, maps) {
	const fallbackAssignments = new Map();
	const existingChannelUsage = {
		specularMap: false,
		emissiveMap: false,
		normalMap: false
	};

	root.traverse((node) => {
		if (!node.isMesh || !node.material) {
			return;
		}

		const mats = Array.isArray(node.material) ? node.material : [node.material];
		for (const m of mats) {
			if (!m) {
				continue;
			}
			if (m.specularMap) {
				existingChannelUsage.specularMap = true;
			}
			if (m.emissiveMap) {
				existingChannelUsage.emissiveMap = true;
			}
			if (m.normalMap) {
				existingChannelUsage.normalMap = true;
			}
		}
	});

	function markFallbackApplied(mat, prop) {
		if (!fallbackAssignments.has(mat.uuid)) {
			fallbackAssignments.set(mat.uuid, new Set());
		}
		fallbackAssignments.get(mat.uuid).add(prop);
	}

	function cloneTextureForMaterial(template, uvReference) {
		if (!template) {
			return null;
		}

		const texture = template.clone();
		texture.flipY = template.flipY;

		if (uvReference) {
			texture.wrapS = uvReference.wrapS;
			texture.wrapT = uvReference.wrapT;
			texture.offset.copy(uvReference.offset);
			texture.repeat.copy(uvReference.repeat);
			texture.center.copy(uvReference.center);
			texture.rotation = uvReference.rotation;
			texture.matrixAutoUpdate = uvReference.matrixAutoUpdate;
			texture.matrix.copy(uvReference.matrix);
		}

		texture.needsUpdate = true;
		return texture;
	}

	root.traverse((node) => {
		if (!node.isMesh || !node.material) {
			return;
		}

		const mats = Array.isArray(node.material) ? node.material : [node.material];
		for (const m of mats) {
			if (!m) {
				continue;
			}
			const uvReference = m.map || null;
			const allowSpecularFallback = ALLOW_AGGRESSIVE_SECONDARY_FALLBACK || existingChannelUsage.specularMap;
			const allowEmissiveFallback = ALLOW_AGGRESSIVE_SECONDARY_FALLBACK || existingChannelUsage.emissiveMap;
			const allowNormalFallback = ALLOW_AGGRESSIVE_SECONDARY_FALLBACK || existingChannelUsage.normalMap;

			if (maps.diffuse && !m.map && 'map' in m) {
				m.map = cloneTextureForMaterial(maps.diffuse, null);
				if (m.map) {
					markFallbackApplied(m, 'map');
				}
			}
			if (allowSpecularFallback && maps.specular && !m.specularMap && 'specularMap' in m) {
				m.specularMap = cloneTextureForMaterial(maps.specular, uvReference);
				if (m.specularMap) {
					markFallbackApplied(m, 'specularMap');
				}
			}
			if (allowEmissiveFallback && maps.emissive && !m.emissiveMap && 'emissiveMap' in m) {
				m.emissiveMap = cloneTextureForMaterial(maps.emissive, uvReference);
				if (m.emissiveMap) {
					markFallbackApplied(m, 'emissiveMap');
				}
				if (m.emissive && typeof m.emissive.getHex === 'function' && m.emissive.getHex() === 0x000000) {
					m.emissive.setHex(0xffffff);
				}
			}
			if (allowNormalFallback && maps.normal && !m.normalMap && 'normalMap' in m) {
				m.normalMap = cloneTextureForMaterial(maps.normal, uvReference);
				if (m.normalMap) {
					markFallbackApplied(m, 'normalMap');
				}
			}

			m.needsUpdate = true;
		}
	});

	return fallbackAssignments;
}

async function loadEntry(entry) {
	const requestId = ++loadRequestId;
	clearModel();
	titleEl.textContent = entry.key || '(no key)';
	subtitleEl.textContent = (entry.name || 'Unnamed') + ' | art root: ' + (entry.artFileRoot || '(none)');
	console.log('Loading ship entry:', entry.key, entry.modelFormat, entry.modelUri, entry.mtlUri);

	if (!entry.modelUri) {
		setOverlay('No .obj model found for this ship art root.', true);
		return;
	}

	setOverlay('Loading ' + (entry.modelFormat || 'model') + '...');

	try {
		if (entry.modelFormat === 'obj') {
			const objLoader = new OBJLoader();
			const resourceBase = getResourceBase(entry.modelUri);
			const mtlLoaded = Boolean(entry.mtlUri);

			if (entry.mtlUri) {
				mtlLoader.setResourcePath(resourceBase);
				const materials = await mtlLoader.loadAsync(entry.mtlUri);
				materials.preload();
				objLoader.setMaterials(materials);
				console.log('Loaded MTL:', entry.mtlUri);
			}

			activeObject = await objLoader.loadAsync(entry.modelUri);
			if (requestId !== loadRequestId) {
				return;
			}

			const [diffuseMap, specularMap, emissiveMap, normalMap] = await Promise.all([
				loadTextureSafe(entry.diffuseUri, true),
				loadTextureSafe(entry.specularUri, false),
				loadTextureSafe(entry.emissiveUri, false),
				loadTextureSafe(entry.normalUri, false)
			]);
			if (requestId !== loadRequestId) {
				for (const baseMap of [diffuseMap, specularMap, emissiveMap, normalMap]) {
					if (baseMap && typeof baseMap.dispose === 'function') {
						baseMap.dispose();
					}
				}
				return;
			}

			const fallbackAssignments = applyFallbackTextures(activeObject, {
				diffuse: diffuseMap,
				specular: specularMap,
				emissive: emissiveMap,
				normal: normalMap
			});

			applyAllChannelVisibility(activeObject);

			renderMapDebugReport(activeObject, fallbackAssignments, mtlLoaded);

			for (const baseMap of [diffuseMap, specularMap, emissiveMap, normalMap]) {
				if (baseMap && typeof baseMap.dispose === 'function') {
					baseMap.dispose();
				}
			}
		} else {
			setOverlay('Unsupported model type: ' + entry.modelFormat, true);
			console.warn('Unsupported model type for entry:', entry);
			return;
		}

		if (requestId !== loadRequestId) {
			return;
		}

		scene.add(activeObject);
		frameObject(activeObject);
		renderer.render(scene, camera);
		maybeGeneratePreview(entry);
		setOverlay('Loaded: ' + entry.artFileRoot + '.' + entry.modelFormat);
		console.log('Model loaded successfully:', entry.modelUri);
	} catch (err) {
		const msg = err && err.message ? err.message : String(err);
		setOverlay('Failed to load model: ' + msg, true);
		console.error('Model load failure for URI:', entry.modelUri, 'format:', entry.modelFormat, 'error:', err);
	}
}

function insertSelectedKey() {
	if (activeIndex < 0 || activeIndex >= entries.length) {
		setOverlay('Select a ship first to insert its key.', true);
		return;
	}
	const selected = entries[activeIndex];
	if (!selected || !selected.key) {
		setOverlay('Selected ship has no key to insert.', true);
		return;
	}
	if (!vscodeApi) {
		setOverlay('VS Code API unavailable for insertion.', true);
		return;
	}
	vscodeApi.postMessage({
		command: 'insertShipKey',
		key: selected.key,
		targetUri: viewerConfig.sourceUri || ''
	});
	setOverlay('Inserted ship key: ' + selected.key);
}

async function copySelectedKey() {
	if (activeIndex < 0 || activeIndex >= entries.length) {
		setOverlay('Select a ship first to copy its key.', true);
		return;
	}
	const selected = entries[activeIndex];
	if (!selected || !selected.key) {
		setOverlay('Selected ship has no key to copy.', true);
		return;
	}

	const key = selected.key;
	try {
		if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
			await navigator.clipboard.writeText(key);
		} else {
			const textarea = document.createElement('textarea');
			textarea.value = key;
			textarea.setAttribute('readonly', '');
			textarea.style.position = 'fixed';
			textarea.style.opacity = '0';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
		}
		setOverlay('Copied ship key: ' + key);
	} catch (err) {
		setOverlay('Failed to copy ship key.', true);
		console.error('Copy ship key failed:', err);
	}
}

function renderShipList(filterText) {
	shipListEl.innerHTML = '';
	const q = (filterText || '').trim().toLowerCase();
	const filtered = entries
		.map((e, i) => ({ ...e, _index: i }))
		.filter((e) => {
			if (!q) {
				return true;
			}
			const hay = (e.key + ' ' + e.name + ' ' + e.artFileRoot + ' ' + (e.roles || []).join(' ')).toLowerCase();
			return hay.includes(q);
		});

	for (const entry of filtered) {
		const btn = document.createElement('button');
		btn.className = 'ship-btn' + (entry._index === activeIndex ? ' active' : '');
		btn.innerHTML = buildButtonPreviewMarkup(entry) + '<div class="ship-btn-body"><div class="ship-key">' + escapeHtml(entry.key || '(no key)') + '</div><div class="ship-meta">' + escapeHtml(entry.name || 'Unnamed') + ' | ' + escapeHtml(entry.modelFormat || 'no model') + '</div></div>';
		btn.addEventListener('click', async () => {
			activeIndex = entry._index;
			renderShipList(searchEl.value);
			await loadEntry(entries[activeIndex]);
		});
		btn.addEventListener('dblclick', () => {
			if (isInsertMode) {
				insertSelectedKey();
			}
		});
		shipListEl.appendChild(btn);
	}
}

searchEl.addEventListener('input', () => renderShipList(searchEl.value));
insertKeyBtn.addEventListener('click', () => insertSelectedKey());
copyKeyBtn.addEventListener('click', () => copySelectedKey());
mapDebugBtn.addEventListener('click', () => setMapDebugVisible(!mapDebugVisible));
diffuseToggleBtn.addEventListener('click', () => setDiffuseVisible(!diffuseVisible));
specularToggleBtn.addEventListener('click', () => setSpecularVisible(!specularVisible));
emissiveToggleBtn.addEventListener('click', () => setEmissiveVisible(!emissiveVisible));
normalToggleBtn.addEventListener('click', () => setNormalVisible(!normalVisible));
diffuseRotateBtn.addEventListener('click', () => rotateChannel('diffuse'));
specularRotateBtn.addEventListener('click', () => rotateChannel('specular'));
emissiveRotateBtn.addEventListener('click', () => rotateChannel('emissive'));
normalRotateBtn.addEventListener('click', () => rotateChannel('normal'));

window.addEventListener('message', (event) => {
	const message = event.data;
	if (!message || message.command !== 'shipPreviewSaved') {
		return;
	}

	const artFileRoot = typeof message.artFileRoot === 'string' ? message.artFileRoot : '';
	const previewUri = typeof message.previewUri === 'string' ? message.previewUri : '';
	if (!artFileRoot || !previewUri) {
		return;
	}

	pendingPreviewGeneration.delete(artFileRoot);
	const entry = entries.find((item) => item.artFileRoot === artFileRoot);
	if (!entry) {
		return;
	}
	entry.previewUri = previewUri;
	renderShipList(searchEl.value);
});

function animate() {
	requestAnimationFrame(animate);
	controls.update();
	renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
resize();
renderShipList('');

if (entries.length > 0) {
	activeIndex = 0;
	renderShipList('');
	loadEntry(entries[0]);
} else {
	setOverlay('No ships were provided by ShipData.', true);
}

setMapDebugVisible(false);
setDiffuseVisible(true);
setSpecularVisible(true);
setEmissiveVisible(true);
setNormalVisible(true);
updateChannelRotationButtonText('diffuse');
updateChannelRotationButtonText('specular');
updateChannelRotationButtonText('emissive');
updateChannelRotationButtonText('normal');

animate();
