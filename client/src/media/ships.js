import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const entries = Array.isArray(window.__SHIP_ENTRIES__) ? window.__SHIP_ENTRIES__ : [];

console.log('Ship viewer module loaded. Entries:', entries.length);

const shipListEl = document.getElementById('shipList');
const searchEl = document.getElementById('search');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const overlayEl = document.getElementById('overlay');
const previewEl = document.getElementById('preview');
const previewImgEl = document.getElementById('previewImg');
const canvas = document.getElementById('viewport');

if (!shipListEl || !searchEl || !titleEl || !subtitleEl || !overlayEl || !previewEl || !previewImgEl || !canvas) {
	console.error('Missing required DOM elements in ships webview.');
	throw new Error('Ship viewer DOM initialization failed.');
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
	scene.remove(activeObject);
	activeObject.traverse((node) => {
		if (node.geometry) {
			node.geometry.dispose();
		}
		if (node.material) {
			const mats = Array.isArray(node.material) ? node.material : [node.material];
			for (const m of mats) {
				if (m && typeof m.dispose === 'function') {
					m.dispose();
				}
			}
		}
	});
	activeObject = null;
}

function showPreview(uri) {
	if (!uri) {
		previewEl.style.display = 'none';
		previewImgEl.removeAttribute('src');
		return;
	}
	previewEl.style.display = 'block';
	previewImgEl.src = uri;
}

const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

function getResourceBase(uri) {
	const idx = uri.lastIndexOf('/');
	return idx >= 0 ? uri.slice(0, idx + 1) : uri;
}

async function loadEntry(entry) {
	clearModel();
	titleEl.textContent = entry.key || '(no key)';
	subtitleEl.textContent = (entry.name || 'Unnamed') + ' | art root: ' + (entry.artFileRoot || '(none)');
	showPreview(entry.previewUri || '');
	console.log('Loading ship entry:', entry.key, entry.modelFormat, entry.modelUri, entry.mtlUri);

	if (!entry.modelUri) {
		setOverlay('No .obj model found for this ship art root.', true);
		return;
	}

	setOverlay('Loading ' + (entry.modelFormat || 'model') + '...');

	try {
		if (entry.modelFormat === 'obj') {
			const resourceBase = getResourceBase(entry.modelUri);

			if (entry.mtlUri) {
				mtlLoader.setResourcePath(resourceBase);
				const materials = await mtlLoader.loadAsync(entry.mtlUri);
				materials.preload();
				objLoader.setMaterials(materials);
				console.log('Loaded MTL:', entry.mtlUri);
			}

			activeObject = await objLoader.loadAsync(entry.modelUri);
		} else {
			setOverlay('Unsupported model type: ' + entry.modelFormat, true);
			console.warn('Unsupported model type for entry:', entry);
			return;
		}

		scene.add(activeObject);
		frameObject(activeObject);
		setOverlay('Loaded: ' + entry.artFileRoot + '.' + entry.modelFormat);
		console.log('Model loaded successfully:', entry.modelUri);
	} catch (err) {
		const msg = err && err.message ? err.message : String(err);
		setOverlay('Failed to load model: ' + msg, true);
		console.error('Model load failure for URI:', entry.modelUri, 'format:', entry.modelFormat, 'error:', err);
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
		btn.innerHTML = '<div class="ship-key">' + (entry.key || '(no key)') + '</div><div class="ship-meta">' + (entry.name || 'Unnamed') + ' | ' + (entry.modelFormat || 'no model') + '</div>';
		btn.addEventListener('click', async () => {
			activeIndex = entry._index;
			renderShipList(searchEl.value);
			await loadEntry(entries[activeIndex]);
		});
		shipListEl.appendChild(btn);
	}
}

searchEl.addEventListener('input', () => renderShipList(searchEl.value));

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

animate();
