const entries = Array.isArray(window.__ICON_ENTRIES__) ? window.__ICON_ENTRIES__ : [];
const viewerConfig = window.__ICON_VIEWER_CONFIG__ || { mode: 'browse', sourceUri: '' };
const isInsertMode = viewerConfig.mode === 'insert';
const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const searchEl = document.getElementById('search');
const galleryEl = document.getElementById('gallery');
const previewEl = document.getElementById('preview');
const selectedIndexEl = document.getElementById('selectedIndex');
const copyBtn = document.getElementById('copyBtn');
const insertBtn = document.getElementById('insertBtn');
const statusEl = document.getElementById('status');

if (!searchEl || !galleryEl || !previewEl || !selectedIndexEl || !copyBtn || !insertBtn || !statusEl) {
	throw new Error('Icon viewer DOM initialization failed.');
}

if (isInsertMode) {
	insertBtn.hidden = false;
}

let activeIndex = -1;

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function setStatus(text) {
	statusEl.textContent = text;
}

function setSelected(index) {
	if (index < 0 || index >= entries.length) {
		activeIndex = -1;
		previewEl.removeAttribute('src');
		selectedIndexEl.textContent = 'None';
		setStatus(entries.length > 0 ? 'Select an icon to begin.' : 'No icons found.');
		galleryEl.querySelectorAll('.tile').forEach((btn) => btn.classList.remove('active'));
		return;
	}

	activeIndex = index;
	const entry = entries[index];
	previewEl.src = entry.imageUri;
	selectedIndexEl.textContent = entry.index;
	setStatus(`Selected icon index ${entry.index}.`);
	galleryEl.querySelectorAll('.tile').forEach((btn) => btn.classList.remove('active'));
	const btn = galleryEl.querySelector(`.tile[data-i="${index}"]`);
	if (btn) {
		btn.classList.add('active');
	}
}

function filteredIndices(query) {
	const q = String(query || '').trim().toLowerCase();
	if (!q) {
		return entries.map((_, i) => i);
	}
	return entries
		.map((entry, i) => ({ entry, i }))
		.filter((pair) => String(pair.entry.index).toLowerCase().includes(q))
		.map((pair) => pair.i);
}

function renderList() {
	const ids = filteredIndices(searchEl.value);
	if (ids.length === 0) {
		galleryEl.innerHTML = '<div class="status">No icons match this filter.</div>';
		if (activeIndex !== -1) {
			setSelected(-1);
		}
		return;
	}

	galleryEl.innerHTML = ids.map((entryIndex) => {
		const entry = entries[entryIndex];
		const isActive = entryIndex === activeIndex;
		return `
			<button class="tile${isActive ? ' active' : ''}" data-i="${entryIndex}" title="Index ${escapeHtml(entry.index)}">
				<img src="${entry.imageUri}" alt="Icon ${escapeHtml(entry.index)}" />
				<div class="idx">${escapeHtml(entry.index)}</div>
			</button>
		`;
	}).join('');

	galleryEl.querySelectorAll('.tile').forEach((btn) => {
		btn.addEventListener('click', () => {
			const i = Number.parseInt(btn.getAttribute('data-i') || '', 10);
			if (!Number.isNaN(i)) {
				setSelected(i);
			}
		});
	});
}

copyBtn.addEventListener('click', () => {
	if (activeIndex < 0 || activeIndex >= entries.length) {
		setStatus('Select an icon before copying.');
		return;
	}
	const entry = entries[activeIndex];
	if (vscodeApi) {
		vscodeApi.postMessage({ command: 'copyIconIndex', index: entry.index });
	} else if (navigator.clipboard) {
		navigator.clipboard.writeText(entry.index).catch(() => undefined);
	}
	setStatus(`Copied index ${entry.index}.`);
});

insertBtn.addEventListener('click', () => {
	if (activeIndex < 0 || activeIndex >= entries.length) {
		setStatus('Select an icon before inserting.');
		return;
	}
	if (!vscodeApi) {
		setStatus('VS Code API unavailable for insert operation.');
		return;
	}
	const entry = entries[activeIndex];
	vscodeApi.postMessage({
		command: 'insertIconIndex',
		index: entry.index,
		targetUri: viewerConfig.sourceUri || ''
	});
	setStatus(`Requested insertion for index ${entry.index}.`);
});

searchEl.addEventListener('input', renderList);

renderList();
if (entries.length > 0) {
	setSelected(0);
} else {
	setSelected(-1);
}
