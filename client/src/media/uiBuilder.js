(() => {
    const vscode = acquireVsCodeApi();
    const configEl = document.getElementById('ui-builder-config');
    const config = configEl ? JSON.parse(configEl.textContent || '{}') : {};

    const COMPONENTS = [
        { type: 'gui_row', title: 'gui_row()', detail: 'Row container. Can hold nested items.' },
        { type: 'gui_subsection', title: 'gui_subsection()', detail: 'Column-like container that can hold nested items.' },
        { type: 'gui_text', title: 'gui_text()', detail: 'Static text label.' },
        { type: 'gui_button', title: 'gui_button()', detail: 'Clickable button.' },
        { type: 'gui_dropdown', title: 'gui_dropdown()', detail: 'Dropdown selection field.' },
        { type: 'gui_checkbox', title: 'gui_checkbox()', detail: 'Checkbox control.' },
        { type: 'gui_slider', title: 'gui_slider()', detail: 'Slider control.' },
        { type: 'gui_text_input', title: 'gui_text_input()', detail: 'Text entry field.' },
        { type: 'gui_list_box', title: 'gui_list_box()', detail: 'List box element.' },
        { type: 'gui_icon', title: 'gui_icon()', detail: 'Image/icon element.' },
        { type: 'gui_spacer', title: 'gui_spacer()', detail: 'Spacing element.' }
    ];

    const DEFAULT_ARGS = {
        gui_row: '',
        gui_subsection: "label='Section'",
        gui_text: "text='Label'",
        gui_button: "tag='btn', text='Click'",
        gui_dropdown: "tag='drop', values='A,B,C'",
        gui_checkbox: "tag='check', text='Enable'",
        gui_slider: "tag='slider', min=0, max=100",
        gui_text_input: "tag='input', value=''",
        gui_list_box: "tag='list', values='Item 1,Item 2'",
        gui_icon: "image='icon.png'",
        gui_spacer: ''
    };

    const state = {
        tree: [],
        selectedId: null,
        nextId: 1,
        autoCode: true,
        drag: {
            active: false,
            parentPath: [],
            index: 0,
            horizontal: false
        }
    };
    const boundDropContainers = new WeakSet();

    const paletteEl = document.getElementById('palette');
    const canvasEl = document.getElementById('canvas');
    const selectedEmptyEl = document.getElementById('selected-empty');
    const selectedEditorEl = document.getElementById('selected-editor');
    const selectedTypeEl = document.getElementById('selected-type');
    const selectedArgsEl = document.getElementById('selected-args');
    const deleteSelectedEl = document.getElementById('delete-selected');
    const clearCanvasEl = document.getElementById('clear-canvas');
    const regenerateCodeEl = document.getElementById('regenerate-code');
    const codeOutputEl = document.getElementById('code-output');
    const codeModeEl = document.getElementById('code-mode');
    const copyCodeEl = document.getElementById('copy-code');
    const insertCodeEl = document.getElementById('insert-code');

    function canHaveChildrenType(type) {
        return type === 'gui_row' || type === 'gui_subsection';
    }

    function canHaveChildrenNode(node) {
        return canHaveChildrenType(node.type);
    }

    function createNode(type) {
        return {
            id: `node_${state.nextId++}`,
            type,
            args: DEFAULT_ARGS[type] || '',
            children: []
        };
    }

    function parsePath(pathText) {
        if (!pathText) {
            return [];
        }
        return pathText.split('.').filter(Boolean).map((x) => Number(x));
    }

    function pathToText(path) {
        return path.join('.');
    }

    function trimOuterQuotes(text) {
        const t = (text || '').trim();
        if (t.length >= 2) {
            const first = t[0];
            const last = t[t.length - 1];
            if ((first === '"' || first === "'") && first === last) {
                return t.slice(1, -1);
            }
        }
        return t;
    }

    function splitTopLevelArgs(argsText) {
        const text = (argsText || '').trim();
        if (!text) {
            return [];
        }
        const parts = [];
        let start = 0;
        let depth = 0;
        let quote = null;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === '\\') {
                    i += 1;
                    continue;
                }
                if (ch === quote) {
                    quote = null;
                }
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }
            if (ch === '(' || ch === '[' || ch === '{') {
                depth += 1;
                continue;
            }
            if (ch === ')' || ch === ']' || ch === '}') {
                depth = Math.max(0, depth - 1);
                continue;
            }
            if (ch === ',' && depth === 0) {
                parts.push(text.slice(start, i).trim());
                start = i + 1;
            }
        }
        parts.push(text.slice(start).trim());
        return parts.filter(Boolean);
    }

    function parseArgs(argsText) {
        const positional = [];
        const named = {};
        const parts = splitTopLevelArgs(argsText);
        for (const part of parts) {
            const eq = part.indexOf('=');
            if (eq > 0) {
                const key = part.slice(0, eq).trim();
                const val = part.slice(eq + 1).trim();
                if (/^[A-Za-z_]\w*$/.test(key)) {
                    named[key] = val;
                    continue;
                }
            }
            positional.push(part.trim());
        }
        return { positional, named };
    }

    function extractStyleString(node) {
        const parsed = parseArgs(node.args || '');
        if (parsed.named.style) {
            return trimOuterQuotes(parsed.named.style);
        }
        for (const p of parsed.positional) {
            const unquoted = trimOuterQuotes(p);
            if (unquoted.includes(':')) {
                return unquoted;
            }
        }
        return '';
    }

    function extractLabel(node) {
        const parsed = parseArgs(node.args || '');
        if (parsed.named.text) {
            return trimOuterQuotes(parsed.named.text);
        }
        if (parsed.named.label) {
            return trimOuterQuotes(parsed.named.label);
        }
        if (parsed.positional.length > 0) {
            const first = trimOuterQuotes(parsed.positional[0]);
            if (first && !first.includes(':')) {
                return first;
            }
        }
        return node.type.replace(/^gui_/, '');
    }

    function applyStyleString(element, styleString, options = {}) {
        const s = (styleString || '').trim();
        if (!s) {
            return;
        }
        const entries = s.split(';').map((x) => x.trim()).filter(Boolean);
        for (const entry of entries) {
            const idx = entry.indexOf(':');
            if (idx <= 0) {
                continue;
            }
            const rawKey = entry.slice(0, idx).trim().toLowerCase();
            const rawValue = entry.slice(idx + 1).trim();
            const value = rawValue;
            switch (rawKey) {
                case 'row-height':
                    element.style.height = value;
                    element.style.minHeight = value;
                    break;
                case 'col-width':
                    if (options.isRowChild) {
                        element.style.flex = `0 0 ${value}`;
                    }
                    element.style.width = value;
                    break;
                case 'margin':
                    element.style.margin = value;
                    break;
                case 'padding':
                    element.style.padding = value;
                    break;
                case 'background':
                case 'background-color':
                case 'click_background':
                    element.style.background = value;
                    break;
                case 'color':
                case 'click_text':
                    element.style.color = value;
                    break;
                case 'border':
                    element.style.border = value;
                    break;
                case 'border-color':
                    element.style.borderColor = value;
                    break;
                case 'border-radius':
                    element.style.borderRadius = value;
                    break;
                case 'font-size':
                    element.style.fontSize = value;
                    break;
                case 'text-align':
                    element.style.textAlign = value;
                    break;
                case 'justify-content':
                    element.style.justifyContent = value;
                    break;
                case 'align-items':
                    element.style.alignItems = value;
                    break;
                case 'opacity':
                    element.style.opacity = value;
                    break;
                default:
                    break;
            }
        }
    }

    function samePath(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }

    function isDescendantPath(descendant, ancestor) {
        if (descendant.length < ancestor.length) {
            return false;
        }
        for (let i = 0; i < ancestor.length; i++) {
            if (descendant[i] !== ancestor[i]) {
                return false;
            }
        }
        return true;
    }

    function getArrayAtPath(parentPath) {
        let arr = state.tree;
        for (const idx of parentPath) {
            const node = arr[idx];
            if (!node) {
                return null;
            }
            arr = node.children;
        }
        return arr;
    }

    function getNodeByPath(path) {
        if (path.length === 0) {
            return null;
        }
        const parentArr = getArrayAtPath(path.slice(0, -1));
        if (!parentArr) {
            return null;
        }
        return parentArr[path[path.length - 1]] || null;
    }

    function removeNodeAtPath(path) {
        const arr = getArrayAtPath(path.slice(0, -1));
        if (!arr) {
            return null;
        }
        const idx = path[path.length - 1];
        if (idx < 0 || idx >= arr.length) {
            return null;
        }
        const [removed] = arr.splice(idx, 1);
        return removed || null;
    }

    function insertNode(parentPath, index, node) {
        const arr = getArrayAtPath(parentPath);
        if (!arr) {
            return;
        }
        const safeIndex = Math.max(0, Math.min(index, arr.length));
        arr.splice(safeIndex, 0, node);
    }

    function findNodePathById(id, nodes = state.tree, path = []) {
        for (let i = 0; i < nodes.length; i++) {
            const current = nodes[i];
            const nextPath = path.concat(i);
            if (current.id === id) {
                return nextPath;
            }
            const nested = findNodePathById(id, current.children, nextPath);
            if (nested) {
                return nested;
            }
        }
        return null;
    }

    function findNearestRowPathFrom(path) {
        let cursor = path.slice();
        while (cursor.length > 0) {
            const node = getNodeByPath(cursor);
            if (node && node.type === 'gui_row') {
                return cursor;
            }
            cursor = cursor.slice(0, -1);
        }
        return null;
    }

    function getDefaultNewNodeDropTarget() {
        if (!state.selectedId) {
            return null;
        }
        const selectedPath = findNodePathById(state.selectedId);
        if (!selectedPath) {
            return null;
        }
        const rowPath = findNearestRowPathFrom(selectedPath);
        if (!rowPath) {
            return null;
        }
        const rowNode = getNodeByPath(rowPath);
        if (!rowNode || !Array.isArray(rowNode.children)) {
            return null;
        }
        return {
            parentPath: rowPath,
            index: rowNode.children.length
        };
    }

    function getLastTopLevelRowDropTarget() {
        for (let i = state.tree.length - 1; i >= 0; i--) {
            const node = state.tree[i];
            if (node && node.type === 'gui_row' && Array.isArray(node.children)) {
                return {
                    parentPath: [i],
                    index: node.children.length
                };
            }
        }
        return null;
    }

    function ensureDefaultRow() {
        if (state.tree.length > 0) {
            return;
        }
        const row = createNode('gui_row');
        state.tree.push(row);
    }

    function setSelectedById(id) {
        state.selectedId = id;
        render();
    }

    function clearSelectionIfMissing() {
        if (!state.selectedId) {
            return;
        }
        const path = findNodePathById(state.selectedId);
        if (!path) {
            state.selectedId = null;
        }
    }

    function renderPalette() {
        paletteEl.innerHTML = '';
        for (const comp of COMPONENTS) {
            const item = document.createElement('div');
            item.className = 'palette-item';
            item.draggable = true;
            item.innerHTML = `<div>${comp.title}</div><small>${comp.detail}</small>`;
            item.addEventListener('dragstart', (ev) => {
                const payload = JSON.stringify({ kind: 'new', type: comp.type });
                // Some webview drag/drop paths may strip custom MIME types;
                // provide text/plain fallback for reliability.
                ev.dataTransfer.setData('application/json', payload);
                ev.dataTransfer.setData('text/plain', payload);
                ev.dataTransfer.effectAllowed = 'copy';
                state.drag.active = true;
            });
            item.addEventListener('dragend', () => {
                resetDragState();
            });
            paletteEl.appendChild(item);
        }
    }

    function clearDropMarkers() {
        for (const marker of document.querySelectorAll('.drop-marker')) {
            marker.remove();
        }
    }

    function resetDragState() {
        state.drag.active = false;
        state.drag.parentPath = [];
        state.drag.index = 0;
        state.drag.horizontal = false;
        clearDropMarkers();
        canvasEl.classList.remove('root-drop-active');
    }

    function ensureDropMarker(container, index, horizontal) {
        clearDropMarkers();
        const marker = document.createElement('div');
        marker.className = horizontal ? 'drop-marker horizontal' : 'drop-marker vertical';

        const nodeEls = Array.from(container.children).filter((el) =>
            el.classList.contains('node') || el.classList.contains('node-row')
        );

        if (index >= nodeEls.length) {
            container.appendChild(marker);
            return;
        }
        container.insertBefore(marker, nodeEls[index]);
    }

    function computeDropIndex(container, horizontal, ev) {
        const nodeEls = Array.from(container.children).filter((el) =>
            el.classList.contains('node') || el.classList.contains('node-row')
        );
        const coord = horizontal ? ev.clientX : ev.clientY;
        let index = 0;
        for (let i = 0; i < nodeEls.length; i++) {
            const rect = nodeEls[i].getBoundingClientRect();
            const midpoint = horizontal ? (rect.left + rect.width / 2) : (rect.top + rect.height / 2);
            if (coord > midpoint) {
                index = i + 1;
            }
        }
        return index;
    }

    function getPayloadTextFromDataTransfer(dataTransfer) {
        if (!dataTransfer) {
            return '';
        }
        return dataTransfer.getData('application/json') || dataTransfer.getData('text/plain') || '';
    }

    function handleDropPayload(payloadText, targetParentPath, targetIndex) {
        if (!payloadText) {
            return;
        }

        let payload;
        try {
            payload = JSON.parse(payloadText);
        } catch {
            return;
        }

        if (payload.kind === 'new') {
            let insertParentPath = targetParentPath;
            let insertIndex = targetIndex;

            if (payload.type === 'gui_row' && targetParentPath.length === 0) {
                // New rows should always be appended under the last row.
                insertParentPath = [];
                insertIndex = state.tree.length;
            }

            if (payload.type !== 'gui_row' && targetParentPath.length === 0) {
                // Non-row components should not become standalone top-level
                // entries. Route them into the current row when possible.
                const defaultTarget = getDefaultNewNodeDropTarget();
                if (defaultTarget) {
                    insertParentPath = defaultTarget.parentPath;
                    insertIndex = defaultTarget.index;
                } else {
                    const fallbackRow = getLastTopLevelRowDropTarget();
                    if (fallbackRow) {
                        insertParentPath = fallbackRow.parentPath;
                        insertIndex = fallbackRow.index;
                    } else {
                        // A row must be created explicitly via gui_row().
                        return;
                    }
                }
            }

            const node = createNode(payload.type);
            insertNode(insertParentPath, insertIndex, node);
            setSelectedById(node.id);
            return;
        }

        if (payload.kind === 'existing') {
            const sourcePath = parsePath(payload.path || '');
            if (sourcePath.length === 0) {
                return;
            }

            if (isDescendantPath(targetParentPath, sourcePath)) {
                // Cannot move a node into itself or its subtree.
                return;
            }

            const sameParent = samePath(targetParentPath, sourcePath.slice(0, -1));
            const sourceIndex = sourcePath[sourcePath.length - 1];
            let insertIndex = targetIndex;
            const movingNode = removeNodeAtPath(sourcePath);
            if (!movingNode) {
                return;
            }

            if (sameParent && sourceIndex < insertIndex) {
                insertIndex -= 1;
            }
            insertNode(targetParentPath, insertIndex, movingNode);
            setSelectedById(movingNode.id);
        }
    }

    function attachListDropBehavior(container, parentPath) {
        container.dataset.parentPath = pathToText(parentPath);

        if (boundDropContainers.has(container)) {
            return;
        }
        boundDropContainers.add(container);

        container.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const horizontal = container.classList.contains('row-children');
            const index = computeDropIndex(container, horizontal, ev);
            state.drag.active = true;
            state.drag.parentPath = parentPath.slice();
            state.drag.index = index;
            state.drag.horizontal = horizontal;
            ensureDropMarker(container, index, horizontal);
            ev.dataTransfer.dropEffect = 'copy';
        });

        container.addEventListener('drop', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const payloadText = getPayloadTextFromDataTransfer(ev.dataTransfer);
            const targetParentPath = state.drag.parentPath.slice();
            const targetIndex = state.drag.index;
            handleDropPayload(payloadText, targetParentPath, targetIndex);
            resetDragState();
        });
    }

    function renderNode(node, path) {
        if (node.type === 'gui_row') {
            const rowCard = document.createElement('div');
            rowCard.className = 'node-row';
            rowCard.dataset.rowId = node.id;
            rowCard.draggable = true;
            rowCard.addEventListener('click', () => {
                setSelectedById(node.id);
            });
            rowCard.addEventListener('dragstart', (ev) => {
                const payload = JSON.stringify({ kind: 'existing', path: pathToText(path) });
                ev.dataTransfer.setData('application/json', payload);
                ev.dataTransfer.setData('text/plain', payload);
                ev.dataTransfer.effectAllowed = 'move';
                state.drag.active = true;
            });
            rowCard.addEventListener('dragend', () => {
                resetDragState();
            });

            const rowChildren = document.createElement('div');
            rowChildren.className = 'children row-children';
            applyStyleString(rowChildren, extractStyleString(node), { isRowChild: false });
            renderList(rowChildren, node.children, path);
            rowCard.appendChild(rowChildren);

            return rowCard;
        }

        const card = document.createElement('div');
        card.className = 'node';
        card.draggable = true;
        if (state.selectedId === node.id) {
            card.classList.add('selected');
        }

        const head = document.createElement('div');
        head.className = 'node-head';
        const label = extractLabel(node);
        head.innerHTML = `<div class="node-title">${label}</div>`;
        applyStyleString(head, extractStyleString(node), { isRowChild: true });

        head.addEventListener('click', () => {
            setSelectedById(node.id);
        });
        card.addEventListener('dragstart', (ev) => {
            const payload = JSON.stringify({ kind: 'existing', path: pathToText(path) });
            ev.dataTransfer.setData('application/json', payload);
            ev.dataTransfer.setData('text/plain', payload);
            ev.dataTransfer.effectAllowed = 'move';
            state.drag.active = true;
        });
        card.addEventListener('dragend', () => {
            resetDragState();
        });

        card.appendChild(head);

        if (canHaveChildrenNode(node)) {
            const childrenWrap = document.createElement('div');
            childrenWrap.className = 'children';
            renderList(childrenWrap, node.children, path);
            card.appendChild(childrenWrap);
        }

        return card;
    }

    function renderList(container, nodes, parentPath) {
        attachListDropBehavior(container, parentPath);
        for (let i = 0; i < nodes.length; i++) {
            const nodePath = parentPath.concat(i);
            const nodeEl = renderNode(nodes[i], nodePath);
            container.appendChild(nodeEl);
        }
    }

    function renderCanvas() {
        canvasEl.innerHTML = '';
        if (state.tree.length === 0) {
            const note = document.createElement('div');
            note.className = 'empty-note';
            note.textContent = 'Drop GUI elements here to start building your layout.';
            canvasEl.appendChild(note);
        }
        renderList(canvasEl, state.tree, []);
    }

    function renderInspector() {
        clearSelectionIfMissing();
        if (!state.selectedId) {
            selectedEmptyEl.classList.remove('hidden');
            selectedEditorEl.classList.add('hidden');
            return;
        }

        const path = findNodePathById(state.selectedId);
        const node = path ? getNodeByPath(path) : null;
        if (!node) {
            selectedEmptyEl.classList.remove('hidden');
            selectedEditorEl.classList.add('hidden');
            return;
        }

        selectedEmptyEl.classList.add('hidden');
        selectedEditorEl.classList.remove('hidden');
        selectedTypeEl.value = node.type;
        selectedArgsEl.value = node.args || '';
    }

    function emitCodeMode() {
        codeModeEl.textContent = state.autoCode ? 'Auto' : 'Manual edits';
    }

    function nodeToCode(node, depth) {
        const indent = '    '.repeat(depth);
        const args = (node.args || '').trim();
        const call = args ? `${node.type}(${args})` : `${node.type}()`;

        if (!canHaveChildrenNode(node) || node.children.length === 0) {
            return [indent + call];
        }

        const lines = [indent + `with ${call}:`];
        for (const child of node.children) {
            lines.push(...nodeToCode(child, depth + 1));
        }
        return lines;
    }

    function generateCode() {
        if (state.tree.length === 0) {
            return '# Build your GUI by dragging elements onto the canvas.';
        }

        const lines = [];
        for (const node of state.tree) {
            lines.push(...nodeToCode(node, 0));
        }
        return lines.join('\n');
    }

    function updateCodeFromTree() {
        if (!state.autoCode) {
            return;
        }
        codeOutputEl.value = generateCode();
        emitCodeMode();
    }

    function render() {
        ensureDefaultRow();
        renderPalette();
        renderCanvas();
        renderInspector();
        updateCodeFromTree();
    }

    selectedArgsEl.addEventListener('input', () => {
        if (!state.selectedId) {
            return;
        }
        const path = findNodePathById(state.selectedId);
        const node = path ? getNodeByPath(path) : null;
        if (!node) {
            return;
        }
        node.args = selectedArgsEl.value;
        render();
    });

    deleteSelectedEl.addEventListener('click', () => {
        if (!state.selectedId) {
            return;
        }
        const path = findNodePathById(state.selectedId);
        if (!path) {
            return;
        }
        removeNodeAtPath(path);
        state.selectedId = null;
        render();
    });

    clearCanvasEl.addEventListener('click', () => {
        state.tree = [];
        state.selectedId = null;
        state.autoCode = true;
        render();
    });

    regenerateCodeEl.addEventListener('click', () => {
        state.autoCode = true;
        codeOutputEl.value = generateCode();
        emitCodeMode();
    });

    codeOutputEl.addEventListener('input', () => {
        state.autoCode = false;
        emitCodeMode();
    });

    copyCodeEl.addEventListener('click', () => {
        vscode.postMessage({
            command: 'copyGuiCode',
            code: codeOutputEl.value
        });
    });

    insertCodeEl.addEventListener('click', () => {
        vscode.postMessage({
            command: 'insertGuiCode',
            targetUri: config.sourceUri || '',
            code: codeOutputEl.value
        });
    });

    canvasEl.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        canvasEl.classList.add('root-drop-active');
        ev.dataTransfer.dropEffect = 'copy';
    });

    canvasEl.addEventListener('dragleave', (ev) => {
        if (!canvasEl.contains(ev.relatedTarget)) {
            canvasEl.classList.remove('root-drop-active');
        }
    });

    canvasEl.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        canvasEl.classList.remove('root-drop-active');
        // Root-level drops are handled by the list drop behavior bound to
        // the canvas via renderList(...). Do not process insertion here,
        // or drops on the root canvas will be inserted twice.
        resetDragState();
    });

    state.tree = [];
    codeOutputEl.value = generateCode();
    emitCodeMode();
    render();
})();
