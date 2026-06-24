import { buildNavViews, getItem, groupLabelForScope, ROOM_TYPES } from './catalog.js';
import {
  getCurrentProject, getProjects, getCurrentId, subscribe,
  createProject, switchProject, renameProject, deleteProject,
  setSelection, getSelection, addRoom, removeRoom, renameRoom,
  hideItem, addCustomItem, removeCustomItem, addPhoto, removePhoto,
  resetCurrentEstimate, getGlobalPriceOverrides, setGlobalPriceOverrides,
  resetGlobalPrices, flushSave, updateProject,
} from './store.js';
import {
  fmtMoney, fmtMoneyDec, calcGrandTotal, calcScopeTotal, calcProgress,
  getScopeItems, calcLineTotal, effectiveCost, getExportSections, countCheckedInScope,
} from './calc.js';
import { renderDealPanel, bindDealInputs } from './deal.js';
import { exportProject, compressImage } from './export.js';

const state = {
  navIndex: 0,
  showSummary: false,
  expandedGroups: new Set(),
  drawerOpen: false,
  dealOpen: false,
  settingsOpen: false,
  modal: null,
};

let appEl;

export function initUI(rootEl) {
  appEl = rootEl;
  subscribe(render);
  bindGlobalEvents();
  render();
}

function render() {
  if (!appEl) return;
  appEl.innerHTML = state.showSummary ? renderSummaryView() : renderMainView();
  bindViewEvents();
}

function renderMainView() {
  const project = getCurrentProject();
  if (!project) return '<p class="empty">No project loaded</p>';

  const views = buildNavViews(project);
  if (state.navIndex >= views.length) state.navIndex = views.length - 1;
  const view = views[state.navIndex];
  const progress = calcProgress(project);
  const total = calcGrandTotal(project);

  return `
    <div class="app-shell">
      ${renderHeader(total, progress, project)}
      ${renderNavTabs(views)}
      <main class="scroll-main" id="scroll-main">
        ${view.kind === 'photos' ? renderPhotosView(project) : renderScopeView(view, project)}
      </main>
      ${renderBottomBar(views)}
    </div>
    ${renderOverlays(project)}
  `;
}

function renderHeader(total, progress, project) {
  return `
    <header class="app-header">
      <div class="header-glow" aria-hidden="true"></div>
      <div class="header-pattern" aria-hidden="true"></div>
      <div class="header-top">
        <button type="button" class="icon-btn glass" data-action="open-drawer" aria-label="Projects">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <img src="./assets/logo.png" alt="Spark Group" class="header-logo" />
        <div class="header-actions">
          <button type="button" class="icon-btn glass deal-btn" data-action="open-deal" title="Deal Analyzer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </button>
          <button type="button" class="icon-btn glass" data-action="open-settings" title="Settings">${iconGear}</button>
          <button type="button" class="icon-btn glass" data-action="export" title="Export">${iconDownload}</button>
        </div>
      </div>
      <div class="header-body">
        <p class="header-label">Running Total</p>
        <p class="header-total" id="running-total">${fmtMoney(total)}</p>
        <div class="header-meta">
          <span class="truncate">${escapeHtml(project.name)}</span>
          <button type="button" class="text-btn" data-action="rename-project">${iconPencil}</button>
        </div>
        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${progress.pct}%"></div>
            <div class="progress-shine" aria-hidden="true"></div>
          </div>
          <span class="progress-text">${progress.checked}/${progress.total} groups</span>
        </div>
      </div>
    </header>`;
}

function renderNavTabs(views) {
  return `<nav class="nav-tabs scroll-x" role="tablist">
    ${views.map((v, i) => {
      const active = i === state.navIndex;
      const project = getCurrentProject();
      let badge = '';
      if (v.scopeKey && project) {
        const st = calcScopeTotal(v.scopeKey, project);
        const cnt = countCheckedInScope(v.scopeKey, project);
        if (st > 0) badge = fmtMoney(st);
        else if (cnt > 0) badge = `${cnt} ✓`;
      } else if (v.kind === 'photos' && project?.photos?.length) {
        badge = String(project.photos.length);
      }
      return `<button type="button" role="tab" class="nav-tab ${active ? 'active' : ''}" data-action="nav" data-index="${i}">
        ${escapeHtml(v.label)}${badge ? `<span class="tab-badge">${badge}</span>` : ''}
      </button>`;
    }).join('')}
  </nav>`;
}

function renderScopeView(view, project) {
  const scopeKey = view.scopeKey;
  const { groups, standalone } = getScopeItems(scopeKey, null, project);
  const roomControls = view.kind === 'room' ? renderRoomControls(view.id, project) : '';

  return `
    <div class="scope-view view-enter">
      ${roomControls}
      <div class="scope-header">
        <h2 class="scope-title">${escapeHtml(view.label)}</h2>
        <p class="scope-subtitle">Tap a group to expand and select repair items</p>
      </div>
      ${groups.map(g => renderGroup(scopeKey, g, project)).join('')}
      ${standalone.length ? `<div class="standalone-section">
        <p class="section-label">Other Items</p>
        ${standalone.map(e => renderLineItem(scopeKey, e.itemId, e.item, project, false)).join('')}
      </div>` : ''}
    </div>`;
}

function renderRoomControls(roomId, project) {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return '';
  return `
    <div class="room-bar">
      <button type="button" class="text-btn" data-action="rename-room" data-room-id="${roomId}">${iconPencil}</button>
      <span>${escapeHtml(room.name)}</span>
      ${project.rooms.filter(r => r.type === room.type).length > 1 || project.rooms.length > 1
        ? `<button type="button" class="text-btn danger" data-action="remove-room" data-room-id="${roomId}">${iconTrash}</button>`
        : ''}
    </div>`;
}

function renderGroup(scopeKey, group, project) {
  const gid = group.groupId;
  const expanded = state.expandedGroups.has(`${scopeKey}:${gid}`);
  const label = groupLabelForScope(scopeKey, gid, project);
  let groupTotal = 0;
  let checked = 0;
  for (const e of group.entries) {
    const t = calcLineTotal(e.item, scopeKey, e.itemId);
    groupTotal += t;
    if (getSelection(scopeKey, e.itemId).checked) checked++;
  }

  return `
    <div class="group-card ${checked ? 'has-checked' : ''}" data-group="${scopeKey}:${gid}">
      <button type="button" class="group-head" data-action="toggle-group" data-scope="${scopeKey}" data-gid="${gid}">
        <span class="chevron ${expanded ? 'open' : ''}">${iconChevron}</span>
        <span class="group-label">${escapeHtml(label)}</span>
        ${checked ? `<span class="chip">${checked} ✓</span>` : ''}
        <span class="group-total">${groupTotal > 0 ? fmtMoney(groupTotal) : '—'}</span>
      </button>
      ${expanded ? `<div class="group-body">
        <div class="group-actions">
          <button type="button" class="small-btn" data-action="add-item" data-scope="${scopeKey}" data-gid="${gid}">+ Add Item</button>
        </div>
        ${group.entries.map(e => renderLineItem(scopeKey, e.itemId, e.item, project, true, e.custom)).join('')}
      </div>` : ''}
    </div>`;
}

function renderLineItem(scopeKey, itemId, item, project, grouped, isCustom = false) {
  if (!item) return '';
  const sel = getSelection(scopeKey, itemId);
  const total = calcLineTotal(item, scopeKey, itemId);
  const cost = effectiveCost(item, scopeKey, itemId);
  const overridden = sel.unitCostOverride != null && sel.unitCostOverride !== '';

  if (item.noAction) {
    return `
      <div class="line-item na ${sel.checked ? 'checked' : ''}" data-scope="${scopeKey}" data-id="${itemId}">
        <button type="button" class="check-btn ${sel.checked ? 'on' : ''}" data-action="toggle" data-scope="${scopeKey}" data-id="${itemId}">${sel.checked ? iconCheck : ''}</button>
        <span class="na-label">No action needed</span>
      </div>`;
  }

  const meta = [item.notes, item.min ? `min ${fmtMoney(item.min)}` : null].filter(Boolean).join(' · ');

  return `
    <div class="line-item ${sel.checked ? 'checked' : ''} ${grouped ? 'grouped' : ''}" data-scope="${scopeKey}" data-id="${itemId}">
      <div class="line-top">
        <button type="button" class="check-btn ${sel.checked ? 'on' : ''}" data-action="toggle" data-scope="${scopeKey}" data-id="${itemId}">${sel.checked ? iconCheck : ''}</button>
        <div class="line-info">
          <div class="line-title-row">
            <p class="line-name">${escapeHtml(item.name)}</p>
            <p class="line-total">${total > 0 ? fmtMoney(total) : '—'}</p>
          </div>
          <p class="line-meta">
            <button type="button" class="cost-link ${overridden ? 'overridden' : ''}" data-action="edit-cost" data-scope="${scopeKey}" data-id="${itemId}">${fmtMoneyDec(cost)} / ${escapeHtml(item.unit)}</button>
            ${meta ? ` · ${escapeHtml(meta)}` : ''}
          </p>
        </div>
        ${isCustom || item.custom ? `<button type="button" class="icon-btn sm danger" data-action="delete-custom" data-id="${itemId}">${iconTrash}</button>` : `<button type="button" class="icon-btn sm" data-action="hide-item" data-scope="${scopeKey}" data-id="${itemId}" title="Remove from project">${iconTrash}</button>`}
      </div>
      ${sel.checked ? `
        <div class="line-fields">
          <label>Qty
            <input type="number" data-action="qty" data-scope="${scopeKey}" data-id="${itemId}" value="${sel.qty}" min="0" step="any" inputmode="decimal" placeholder="${item.defaultQty ?? '0'}" />
          </label>
          <span class="unit-tag">${escapeHtml(item.unit)}</span>
          ${item.hasYear ? `<label>Year<input type="number" data-action="year" data-scope="${scopeKey}" data-id="${itemId}" value="${sel.year || ''}" min="1970" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="2015" /></label>` : ''}
          <button type="button" class="small-btn outline" data-action="photo-item" data-scope="${scopeKey}" data-id="${itemId}">📷 Photo</button>
        </div>
        ${item.hasYear ? renderItemPhotos(scopeKey, itemId, project) : ''}
      ` : ''}
    </div>`;
}

function renderItemPhotos(scopeKey, itemId, project) {
  const photos = (project.photos || []).filter(p => p.scopeKey === scopeKey && p.itemId === itemId);
  if (!photos.length) return '';
  return `<div class="photo-strip">${photos.map(p => `
    <div class="photo-thumb">
      <img src="${p.dataUrl}" alt="" />
      <button type="button" class="photo-rm" data-action="rm-photo" data-id="${p.id}">×</button>
    </div>`).join('')}</div>`;
}

function renderPhotosView(project) {
  const photos = project.photos || [];
  return `
    <div class="photos-view">
      <div class="photos-header">
        <h2>Project Photos</h2>
        <button type="button" class="btn primary" data-action="photo-project">+ Add Photo</button>
      </div>
      ${photos.length ? `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <img src="${p.dataUrl}" alt="" />
          <p class="photo-cap">${escapeHtml(p.caption || p.itemId || 'Project photo')}</p>
          <button type="button" class="photo-rm" data-action="rm-photo" data-id="${p.id}">×</button>
        </div>`).join('')}</div>`
        : `<div class="empty-state">
            <div class="empty-icon">${iconCamera}</div>
            <p class="empty-title">No photos yet</p>
            <p class="empty">Capture serial numbers, damage, or site conditions.</p>
          </div>`}
    </div>`;
}

function renderBottomBar(views) {
  const last = state.navIndex >= views.length - 1;
  const first = state.navIndex <= 0;
  return `
    <footer class="bottom-bar">
      <button type="button" class="btn outline" data-action="prev" ${first ? 'disabled' : ''}>← Previous</button>
      ${last
        ? '<button type="button" class="btn primary" data-action="summary">View Summary</button>'
        : '<button type="button" class="btn primary" data-action="next">Next →</button>'}
    </footer>`;
}

function renderSummaryView() {
  const project = getCurrentProject();
  const total = calcGrandTotal(project);
  const sections = getExportSections(project);

  return `
    <div class="summary-view">
      <header class="app-header compact">
        <div class="header-top">
          <button type="button" class="text-btn light" data-action="back">← Back</button>
          <span class="header-brand">Summary</span>
          <button type="button" class="icon-btn" data-action="export">${iconDownload}</button>
        </div>
        <p class="header-label">Total Estimate</p>
        <p class="header-total">${fmtMoney(total)}</p>
        <p class="header-meta plain">${escapeHtml(project.name)}</p>
      </header>
      <div class="summary-body">
        ${sections.length ? sections.map(s => `
          <section class="summary-section">
            <div class="summary-sec-head"><strong>${escapeHtml(s.label)}</strong><span>${fmtMoney(s.total)}</span></div>
            ${s.rows.map(r => `
              <div class="summary-row">
                <div><p>${escapeHtml(r.item.name)}</p><small>${r.sel.qty} ${escapeHtml(r.item.unit)} × ${fmtMoneyDec(r.cost)}</small></div>
                <strong>${fmtMoney(r.total)}</strong>
              </div>`).join('')}
          </section>`).join('')
          : `<div class="empty-state">
              <div class="empty-icon">${iconClipboard}</div>
              <p class="empty-title">No items selected yet</p>
              <p class="empty">Check repair items in each section to build your estimate.</p>
            </div>`}
      </div>
      <div class="summary-actions">
        <button type="button" class="btn primary full" data-action="back">← Edit Estimate</button>
        <button type="button" class="btn danger outline full" data-action="reset">Start New Estimate</button>
      </div>
    </div>
    ${renderOverlays(project)}`;
}

function renderOverlays(project) {
  const projects = getProjects();
  const globalCount = Object.keys(getGlobalPriceOverrides()).length;

  return `
    <div class="overlay ${state.drawerOpen ? 'open' : ''}" data-action="close-drawer"></div>
    <aside class="drawer ${state.drawerOpen ? 'open' : ''}">
      <div class="drawer-head">
        <strong>Projects</strong>
        <button type="button" class="icon-btn" data-action="close-drawer">×</button>
      </div>
      <div class="drawer-list">
        ${projects.length ? projects.map(p => `
          <div class="drawer-item ${p.id === getCurrentId() ? 'active' : ''}">
            <button type="button" class="drawer-proj" data-action="switch" data-id="${p.id}">
              <span class="proj-name">${escapeHtml(p.name)}</span>
              <small>${formatDate(p.savedAt)}</small>
            </button>
            <button type="button" class="icon-btn sm" data-action="rename-proj" data-id="${p.id}" data-name="${escapeAttr(p.name)}">${iconPencil}</button>
            ${p.id !== getCurrentId() ? `<button type="button" class="icon-btn sm danger" data-action="delete-proj" data-id="${p.id}" data-name="${escapeAttr(p.name)}">${iconTrash}</button>` : ''}
          </div>`).join('')
          : '<p class="empty">No projects</p>'}
      </div>
      <div class="drawer-foot">
        <button type="button" class="btn primary full" data-action="new-project">+ New Project</button>
        <div class="add-room-row">
          ${ROOM_TYPES.map(rt => `<button type="button" class="small-btn" data-action="add-room" data-type="${rt.type}">+ ${rt.label}</button>`).join('')}
        </div>
      </div>
    </aside>

    <div class="sheet ${state.dealOpen ? 'open' : ''}" id="deal-sheet">
      <div class="sheet-head"><strong>Deal Profit Analyzer</strong><button type="button" class="icon-btn" data-action="close-deal">×</button></div>
      <div class="sheet-body" id="deal-body">${renderDealPanel()}</div>
    </div>
    ${state.dealOpen ? '<div class="overlay open" data-action="close-deal"></div>' : ''}

    <div class="sheet ${state.settingsOpen ? 'open' : ''}">
      <div class="sheet-head"><strong>Settings</strong><button type="button" class="icon-btn" data-action="close-settings">×</button></div>
      <div class="sheet-body">
        <h3>Global Price Schedule</h3>
        <p class="hint">Upload CSV with <code>id</code> and <code>cost</code> columns to update default prices for all projects.</p>
        <div class="status-box ${globalCount ? 'active' : ''}">${globalCount ? `${globalCount} custom price(s) active` : 'Using default prices from price list'}</div>
        <label class="btn primary full file-label">Upload Prices (CSV)<input type="file" accept=".csv" id="price-csv" hidden /></label>
        ${globalCount ? '<button type="button" class="btn danger outline full" data-action="reset-prices">Reset to Defaults</button>' : ''}
      </div>
    </div>
    ${state.settingsOpen ? '<div class="overlay open" data-action="close-settings"></div>' : ''}

    <div class="modal ${state.modal ? 'open' : ''}" id="app-modal">
      <div class="modal-bg" data-action="modal-cancel"></div>
      <div class="modal-box">
        <h3 id="modal-title">${state.modal?.title || ''}</h3>
        ${state.modal?.fields ? state.modal.fields.map(f => `
          <label class="field"><span>${f.label}</span>
            <input type="${f.type || 'text'}" id="modal-${f.id}" placeholder="${f.placeholder || ''}" value="${f.value || ''}" step="any" />
          </label>`).join('')
          : `<input type="text" id="modal-input" placeholder="${state.modal?.placeholder || ''}" value="${state.modal?.value || ''}" />`}
        <div class="modal-actions">
          <button type="button" class="btn outline" data-action="modal-cancel">Cancel</button>
          <button type="button" class="btn primary" data-action="modal-confirm">Save</button>
        </div>
      </div>
    </div>`;
}

function resolveItem(scopeKey, itemId) {
  const item = getItem(itemId);
  if (item) return item;
  const c = getCurrentProject()?.customItems.find(x => x.id === itemId);
  if (c) return { id: c.id, name: c.name, cost: c.cost, unit: c.unit, custom: true };
  return null;
}

function bindGlobalEvents() {
  document.body.addEventListener('click', onClick);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('change', e => {
    if (e.target.id === 'price-csv') onPriceCsv(e);
  });

  window.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
}

function bindViewEvents() {
  const dealBody = document.getElementById('deal-body');
  if (dealBody) bindDealInputs(dealBody, () => {
    const el = document.getElementById('running-total');
    if (el) el.textContent = fmtMoney(calcGrandTotal(getCurrentProject()));
  });

  const modalInput = document.getElementById('modal-input');
  if (modalInput) {
    setTimeout(() => { modalInput.focus(); modalInput.select(); }, 50);
    modalInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmModal();
      if (e.key === 'Escape') closeModal();
    });
  }
}

function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case 'open-drawer': state.drawerOpen = true; render(); break;
    case 'close-drawer': state.drawerOpen = false; render(); break;
    case 'open-deal': state.dealOpen = true; render(); break;
    case 'close-deal': state.dealOpen = false; render(); break;
    case 'open-settings': state.settingsOpen = true; render(); break;
    case 'close-settings': state.settingsOpen = false; render(); break;
    case 'export': exportProject(); break;
    case 'nav': state.navIndex = parseInt(btn.dataset.index); scrollTop(); render(); break;
    case 'prev': state.navIndex = Math.max(0, state.navIndex - 1); scrollTop(); render(); break;
    case 'next': state.navIndex += 1; scrollTop(); render(); break;
    case 'summary': state.showSummary = true; render(); break;
    case 'back': state.showSummary = false; render(); break;
    case 'reset':
      if (confirm('Start a new estimate? All entries will be cleared.')) {
        resetCurrentEstimate();
        state.navIndex = 0;
        state.showSummary = false;
        state.expandedGroups.clear();
      }
      break;
    case 'toggle-group': {
      const key = `${btn.dataset.scope}:${btn.dataset.gid}`;
      if (state.expandedGroups.has(key)) state.expandedGroups.delete(key);
      else state.expandedGroups.add(key);
      render();
      break;
    }
    case 'toggle': {
      const { scope, id } = btn.dataset;
      const sel = getSelection(scope, id);
      const item = resolveItem(scope, id);
      setSelection(scope, id, {
        checked: !sel.checked,
        qty: !sel.checked && item?.defaultQty != null ? String(item.defaultQty) : sel.checked ? '' : sel.qty,
      });
      render();
      if (!sel.checked) {
        setTimeout(() => document.querySelector(`[data-action="qty"][data-scope="${scope}"][data-id="${id}"]`)?.focus(), 50);
      }
      break;
    }
    case 'edit-cost': {
      const { scope, id } = btn.dataset;
      const item = resolveItem(scope, id);
      const sel = getSelection(scope, id);
      openModal({
        title: 'Edit Unit Cost',
        fields: [{ id: 'cost', label: `${item?.name || id} ($/${item?.unit})`, type: 'number', value: sel.unitCostOverride ?? effectiveCost(item, scope, id) }],
        onConfirm: (vals) => setSelection(scope, id, { unitCostOverride: parseFloat(vals.cost) }),
      });
      break;
    }
    case 'hide-item':
      if (confirm('Remove this item from the project?')) hideItem(btn.dataset.scope, btn.dataset.id);
      break;
    case 'delete-custom': removeCustomItem(btn.dataset.id); break;
    case 'add-item': {
      const { scope, gid } = btn.dataset;
      openModal({
        title: 'Add Custom Item',
        fields: [
          { id: 'name', label: 'Item name', placeholder: 'Closet shelving' },
          { id: 'cost', label: 'Unit cost', type: 'number', placeholder: '0' },
          { id: 'unit', label: 'Unit', placeholder: 'ea.', value: 'ea.' },
        ],
        onConfirm: (vals) => {
          if (vals.name) {
            addCustomItem(scope, gid, vals);
            state.expandedGroups.add(`${scope}:${gid}`);
          }
        },
      });
      break;
    }
    case 'photo-item':
    case 'photo-project':
      capturePhoto(btn.dataset.scope || null, btn.dataset.id || null);
      break;
    case 'rm-photo': removePhoto(btn.dataset.id); break;
    case 'rename-project':
      openModal({
        title: 'Rename Project',
        placeholder: '123 Main St',
        value: getCurrentProject()?.name,
        onConfirm: (v) => renameProject(getCurrentId(), v),
      });
      break;
    case 'rename-room':
      openModal({
        title: 'Rename Room',
        value: getCurrentProject()?.rooms.find(r => r.id === btn.dataset.roomId)?.name,
        onConfirm: (v) => renameRoom(btn.dataset.roomId, v),
      });
      break;
    case 'remove-room':
      if (confirm('Remove this room and all its entries?')) removeRoom(btn.dataset.roomId);
      break;
    case 'new-project':
      state.drawerOpen = false;
      openModal({
        title: 'New Project',
        placeholder: '123 Main St',
        onConfirm: (name) => {
          flushSave();
          createProject(name);
          state.navIndex = 0;
          state.expandedGroups.clear();
        },
      });
      break;
    case 'switch':
      flushSave();
      switchProject(btn.dataset.id);
      state.navIndex = 0;
      state.drawerOpen = false;
      break;
    case 'rename-proj':
      openModal({
        title: 'Rename Project',
        value: btn.dataset.name,
        onConfirm: (v) => renameProject(btn.dataset.id, v),
      });
      break;
    case 'delete-proj':
      if (confirm(`Delete "${btn.dataset.name}"?`)) deleteProject(btn.dataset.id);
      break;
    case 'add-room': {
      const newId = addRoom(btn.dataset.type);
      const views = buildNavViews(getCurrentProject());
      const idx = views.findIndex(v => v.id === newId);
      state.navIndex = idx >= 0 ? idx : 0;
      state.drawerOpen = false;
      break;
    }
    case 'reset-prices':
      if (confirm('Reset all global prices to defaults?')) resetGlobalPrices();
      break;
    case 'modal-cancel': closeModal(); break;
    case 'modal-confirm': confirmModal(); break;
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.action === 'qty') {
    setSelection(el.dataset.scope, el.dataset.id, { qty: el.value });
    updateTotalsLive(el.dataset.scope, el.dataset.id);
  }
  if (el.dataset.action === 'year') {
    setSelection(el.dataset.scope, el.dataset.id, { year: el.value });
  }
}

function updateTotalsLive(scopeKey, itemId) {
  const def = resolveItem(scopeKey, itemId);
  if (!def) return;
  const total = calcLineTotal(def, scopeKey, itemId);

  const card = document.querySelector(`.line-item[data-scope="${scopeKey}"][data-id="${itemId}"]`);
  card?.querySelector('.line-total')?.replaceChildren(document.createTextNode(total > 0 ? fmtMoney(total) : '—'));

  const hdr = document.getElementById('running-total');
  if (hdr) hdr.textContent = fmtMoney(calcGrandTotal(getCurrentProject()));
}

function capturePhoto(scopeKey, itemId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.style.cssText = 'position:fixed;top:-999px;opacity:0';
  document.body.appendChild(input);
  input.onchange = async () => {
    document.body.removeChild(input);
    if (!input.files?.length) return;
    for (const file of input.files) {
      const dataUrl = await compressImage(file);
      addPhoto({
        dataUrl,
        scopeKey: scopeKey || null,
        itemId: itemId || null,
        caption: itemId ? (getItem(itemId)?.name || 'Item photo') : 'Project photo',
      });
    }
  };
  input.click();
}

function onPriceCsv(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const rows = parseCsv(ev.target.result);
    const overrides = { ...getGlobalPriceOverrides() };
    let n = 0;
    for (const row of rows) {
      const id = row.id?.trim();
      const cost = parseFloat(row.cost);
      if (id && !isNaN(cost) && cost >= 0) { overrides[id] = cost; n++; }
    }
    setGlobalPriceOverrides(overrides);
    alert(`${n} price(s) updated.`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i] ?? '']));
  });
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function openModal(opts) {
  state.modal = opts;
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function confirmModal() {
  const m = state.modal;
  if (!m) return;
  if (m.fields) {
    const vals = {};
    for (const f of m.fields) {
      vals[f.id] = document.getElementById(`modal-${f.id}`)?.value?.trim();
    }
    m.onConfirm?.(vals);
  } else {
    const v = document.getElementById('modal-input')?.value?.trim();
    if (v) m.onConfirm?.(v);
  }
  closeModal();
}

function scrollTop() {
  document.getElementById('scroll-main')?.scrollTo(0, 0);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

const iconCheck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
const iconChevron = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
const iconPencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const iconTrash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
const iconGear = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const iconDownload = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
const iconCamera = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const iconClipboard = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
