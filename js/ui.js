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
  getScopeItems, calcLineTotal, effectiveCost, getExportSections,
  countCheckedInScope, isGroupComplete,
} from './calc.js';
import { renderDealPanel, bindDealInputs } from './deal.js';
import { exportProject, compressImage } from './export.js';
import { toggleDarkMode, isDarkMode } from './app.js';

// ── qty memory ───────────────────────────────────────────────
const QTY_MEMORY_KEY = 'spark_qty_memory';
function qtyMemory() {
  try { return JSON.parse(localStorage.getItem(QTY_MEMORY_KEY) || '{}'); } catch { return {}; }
}
function rememberQty(id, qty) {
  if (!qty || parseFloat(qty) <= 0) return;
  const m = qtyMemory(); m[id] = qty;
  localStorage.setItem(QTY_MEMORY_KEY, JSON.stringify(m));
}
function recallQty(id) { return qtyMemory()[id] || ''; }

// ── app state ────────────────────────────────────────────────
const state = {
  navIndex: 0,
  showSummary: false,
  expandedGroups: new Set(),
  drawerOpen: false,
  dealOpen: false,
  settingsOpen: false,
  modal: null,
  touchStartX: 0,
  touchStartY: 0,
  /** id of last project we fully rendered for */
  _lastProjectId: null,
  _lastNavIndex: -1,
  _lastSummary: false,
};

let appEl;

export function initUI(rootEl) {
  appEl = rootEl;
  // Full re-render only when project data changes externally (store events)
  subscribe(() => {
    const proj = getCurrentProject();
    const projId = proj?.id ?? null;
    // project switched or created/deleted → full render
    if (projId !== state._lastProjectId) {
      state._lastProjectId = projId;
      fullRender();
      return;
    }
    // otherwise just refresh the dynamic header numbers + tab badges
    patchHeader();
    patchNavBadges();
  });
  bindGlobalEvents();
  fullRender();
}

// ═══════════════════════════════════════════════════════════
//  FULL RENDER  (tab change, project switch, summary toggle)
// ═══════════════════════════════════════════════════════════
function fullRender() {
  if (!appEl) return;
  const project = getCurrentProject();
  appEl.innerHTML = state.showSummary ? renderSummaryView() : renderMainView(project);
  state._lastNavIndex = state.navIndex;
  state._lastSummary = state.showSummary;
  afterRender();
}

// ── switch active tab without touching header ────────────────
function switchTab() {
  const main = document.getElementById('scroll-main');
  const nav  = document.getElementById('spark-nav');
  const bot  = document.getElementById('spark-bottom');
  const project = getCurrentProject();
  if (!main || !project) { fullRender(); return; }

  const views = buildNavViews(project);
  if (state.navIndex >= views.length) state.navIndex = views.length - 1;
  const view = views[state.navIndex];

  // swap main content
  main.innerHTML = view.kind === 'photos' ? renderPhotosView(project) : renderScopeView(view, project);
  main.scrollTo(0, 0);

  // update nav active state
  if (nav) {
    nav.querySelectorAll('.nav-tab').forEach((btn, i) => {
      btn.classList.toggle('active', i === state.navIndex);
    });
  }

  // update bottom bar (replace innerHTML so the #spark-bottom wrapper stays)
  if (bot) bot.innerHTML = renderBottomBar(views);

  state._lastNavIndex = state.navIndex;
  afterRender();
}

// ── patch header numbers only ────────────────────────────────
function patchHeader() {
  const project = getCurrentProject();
  if (!project) return;
  const total    = calcGrandTotal(project);
  const progress = calcProgress(project);
  const el = document.getElementById('running-total');
  if (el) el.textContent = fmtMoney(total);
  const fill = document.querySelector('.progress-fill');
  if (fill) fill.style.width = `${progress.pct}%`;
  const txt = document.querySelector('.progress-text');
  if (txt) txt.textContent = `${progress.checked}/${progress.total} groups`;
}

// ── patch nav tab badges only ────────────────────────────────
function patchNavBadges() {
  const project = getCurrentProject();
  if (!project) return;
  const views = buildNavViews(project);
  document.querySelectorAll('.nav-tab').forEach((btn, i) => {
    const v = views[i]; if (!v) return;
    let badge = '';
    if (v.scopeKey) {
      const st  = calcScopeTotal(v.scopeKey, project);
      const cnt = countCheckedInScope(v.scopeKey, project);
      if (st > 0) badge = fmtMoney(st);
      else if (cnt > 0) badge = `${cnt}\u2713`;
    } else if (v.kind === 'photos' && project?.photos?.length) {
      badge = String(project.photos.length);
    }
    let badgeEl = btn.querySelector('.tab-badge');
    if (badge) {
      if (!badgeEl) { badgeEl = document.createElement('span'); badgeEl.className = 'tab-badge'; btn.appendChild(badgeEl); }
      badgeEl.textContent = badge;
    } else {
      badgeEl?.remove();
    }
  });
}

function afterRender() {
  const dealBody = document.getElementById('deal-body');
  if (dealBody) bindDealInputs(dealBody, patchHeader);
  const modalInput = document.getElementById('modal-input');
  if (modalInput) {
    setTimeout(() => { try { modalInput.focus(); modalInput.select(); } catch {} }, 50);
    modalInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmModal();
      if (e.key === 'Escape') closeModal();
    });
  }
}


// ═══════════════════════════════════════════════════════════
//  RENDER HELPERS
// ═══════════════════════════════════════════════════════════
function renderMainView(project) {
  if (!project) return renderNoProject();
  const views = buildNavViews(project);
  if (state.navIndex >= views.length) state.navIndex = views.length - 1;
  const view = views[state.navIndex];
  const progress = calcProgress(project);
  const total    = calcGrandTotal(project);
  return `
    <div class="app-shell">
      ${renderHeader(total, progress, project)}
      <nav class="nav-tabs scroll-x" id="spark-nav" role="tablist">${renderNavTabItems(views)}</nav>
      <main class="scroll-main" id="scroll-main">
        ${view.kind === 'photos' ? renderPhotosView(project) : renderScopeView(view, project)}
      </main>
      <div id="spark-bottom">${renderBottomBar(views)}</div>
    </div>
    ${renderOverlays(project)}`;
}

function renderNoProject() {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div class="header-glow" aria-hidden="true"></div>
        <div class="header-top">
          <button type="button" class="icon-btn glass" data-action="open-drawer" aria-label="Projects">${iconMenu}</button>
          <div class="header-brand-block">
            <img src="./assets/logo.png" alt="Spark Group" class="header-logo" />
            <span class="header-sub">Estimator</span>
          </div>
          <button type="button" class="dark-toggle" data-action="toggle-dark" aria-label="Toggle dark mode">${isDarkMode() ? iconSun : iconMoon}</button>
        </div>
        <div class="header-body">
          <p class="header-label">Repair Estimator</p>
          <p class="header-total">$0</p>
        </div>
      </header>
      <div class="scroll-main" style="display:flex;align-items:center;justify-content:center;">
        <div class="empty-state">
          <div class="empty-icon">${iconHome}</div>
          <p class="empty-title">No project yet</p>
          <p class="empty">Start your first walkthrough by creating a project.</p>
          <div class="onboarding-hint">
            <span class="onboarding-arrow">&#8592;</span>
            <div class="onboarding-tip">Tap the <strong>&#9776;</strong> menu to create your first estimate</div>
          </div>
        </div>
      </div>
    </div>
    ${renderOverlays(null)}`;
}

function renderHeader(total, progress, project) {
  return `
    <header class="app-header">
      <div class="header-glow" aria-hidden="true"></div>
      <div class="header-top">
        <button type="button" class="icon-btn glass" data-action="open-drawer" aria-label="Projects">${iconMenu}</button>
        <div class="header-brand-block">
          <img src="./assets/logo.png" alt="Spark Group" class="header-logo" />
          <span class="header-sub">Estimator</span>
        </div>
        <div class="header-actions">
          <button type="button" class="icon-btn glass" data-action="open-deal" title="Deal Analyzer">${iconDollar}</button>
          <button type="button" class="icon-btn glass" data-action="open-settings" title="Settings">${iconGear}</button>
          <button type="button" class="icon-btn glass" data-action="export" title="Export">${iconDownload}</button>
          <button type="button" class="dark-toggle" data-action="toggle-dark" aria-label="Toggle dark mode">${isDarkMode() ? iconSun : iconMoon}</button>
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

function renderNavTabItems(views) {
  const project = getCurrentProject();
  return views.map((v, i) => {
    const active = i === state.navIndex;
    let badge = '';
    if (v.scopeKey && project) {
      const st  = calcScopeTotal(v.scopeKey, project);
      const cnt = countCheckedInScope(v.scopeKey, project);
      if (st > 0) badge = fmtMoney(st);
      else if (cnt > 0) badge = `${cnt}\u2713`;
    } else if (v.kind === 'photos' && project?.photos?.length) {
      badge = String(project.photos.length);
    }
    return `<button type="button" role="tab" class="nav-tab${active ? ' active' : ''}" data-action="nav" data-index="${i}">
      ${escapeHtml(v.label)}${badge ? `<span class="tab-badge">${badge}</span>` : ''}
    </button>`;
  }).join('');
}

function renderScopeView(view, project) {
  const { groups, standalone } = getScopeItems(view.scopeKey, null, project);
  const roomControls = view.kind === 'room' ? renderRoomControls(view.id, project) : '';
  const allDone = groups.length > 0 && groups.every(g => isGroupComplete(view.scopeKey, g.groupId, project));
  return `
    <div class="scope-view view-enter">
      ${roomControls}
      <div class="scope-header">
        <div>
          <h2 class="scope-title">${escapeHtml(view.label)}</h2>
          <p class="scope-subtitle">Tap a group to expand and select repair items</p>
        </div>
        ${allDone ? `<span class="scope-complete-badge">${iconCheckSmall} Done</span>` : ''}
      </div>
      ${groups.map(g => renderGroup(view.scopeKey, g, project)).join('')}
      ${standalone.length ? `<div class="standalone-section">
        <p class="section-label">Other Items</p>
        ${standalone.map(e => renderLineItem(view.scopeKey, e.itemId, e.item, project, false)).join('')}
      </div>` : ''}
    </div>`;
}

function renderRoomControls(roomId, project) {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return '';
  const canDelete = project.rooms.filter(r => r.type === room.type).length > 1 || project.rooms.length > 1;
  return `
    <div class="room-bar">
      <button type="button" class="text-btn" data-action="rename-room" data-room-id="${roomId}">${iconPencil}</button>
      <span>${escapeHtml(room.name)}</span>
      ${canDelete ? `<button type="button" class="text-btn danger" data-action="remove-room" data-room-id="${roomId}">${iconTrash}</button>` : ''}
    </div>`;
}

function renderGroup(scopeKey, group, project) {
  const gid      = group.groupId;
  const expanded = state.expandedGroups.has(`${scopeKey}:${gid}`);
  const label    = groupLabelForScope(scopeKey, gid, project);
  let groupTotal = 0, checked = 0;
  for (const e of group.entries) {
    groupTotal += calcLineTotal(e.item, scopeKey, e.itemId);
    if (getSelection(scopeKey, e.itemId).checked) checked++;
  }
  return `
    <div class="group-card${checked ? ' has-checked' : ''}" data-group="${scopeKey}:${gid}">
      <button type="button" class="group-head" data-action="toggle-group" data-scope="${scopeKey}" data-gid="${gid}">
        <span class="chevron${expanded ? ' open' : ''}">${iconChevron}</span>
        <span class="group-label">${escapeHtml(label)}</span>
        ${checked ? `<span class="chip">${checked}\u2713</span>` : ''}
        <span class="group-total">${groupTotal > 0 ? fmtMoney(groupTotal) : '\u2014'}</span>
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
  const sel        = getSelection(scopeKey, itemId);
  const total      = calcLineTotal(item, scopeKey, itemId);
  const cost       = effectiveCost(item, scopeKey, itemId);
  const overridden = sel.unitCostOverride != null && sel.unitCostOverride !== '';
  const remembered = recallQty(itemId);

  if (item.noAction) {
    return `
      <div class="line-item na${sel.checked ? ' checked' : ''}" data-scope="${scopeKey}" data-id="${itemId}">
        <button type="button" class="check-btn${sel.checked ? ' on' : ''}" data-action="toggle" data-scope="${scopeKey}" data-id="${itemId}">${sel.checked ? iconCheck : ''}</button>
        <span class="na-label">No action needed</span>
      </div>`;
  }

  const meta = [item.notes, item.min ? `min ${fmtMoney(item.min)}` : null].filter(Boolean).join(' \u00b7 ');
  return `
    <div class="line-item${sel.checked ? ' checked' : ''}${grouped ? ' grouped' : ''}" data-scope="${scopeKey}" data-id="${itemId}">
      <div class="line-top">
        <button type="button" class="check-btn${sel.checked ? ' on' : ''}" data-action="toggle" data-scope="${scopeKey}" data-id="${itemId}">${sel.checked ? iconCheck : ''}</button>
        <div class="line-info">
          <div class="line-title-row">
            <p class="line-name">${escapeHtml(item.name)}</p>
            <p class="line-total">${total > 0 ? fmtMoney(total) : '\u2014'}</p>
          </div>
          <p class="line-meta">
            <button type="button" class="cost-link${overridden ? ' overridden' : ''}" data-action="edit-cost" data-scope="${scopeKey}" data-id="${itemId}">${fmtMoneyDec(cost)} / ${escapeHtml(item.unit)}</button>
            ${meta ? ` \u00b7 ${escapeHtml(meta)}` : ''}
          </p>
        </div>
        ${isCustom || item.custom
          ? `<button type="button" class="icon-btn sm danger" data-action="delete-custom" data-id="${itemId}">${iconTrash}</button>`
          : `<button type="button" class="icon-btn sm" data-action="hide-item" data-scope="${scopeKey}" data-id="${itemId}" title="Remove">${iconTrash}</button>`}
      </div>
      ${sel.checked ? `
        <div class="line-fields">
          <label>Qty
            <input type="number" data-action="qty" data-scope="${scopeKey}" data-id="${itemId}"
              value="${sel.qty}" min="0" step="any" inputmode="decimal"
              placeholder="${item.defaultQty > 0 ? item.defaultQty : (remembered || qtyHint(item.unit))}" />
          </label>
          <span class="unit-tag">${escapeHtml(item.unit)}</span>
          ${item.hasYear ? `<label>Year<input type="number" data-action="year" data-scope="${scopeKey}" data-id="${itemId}" value="${sel.year || ''}" min="1970" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="2015" /></label>` : ''}
          <button type="button" class="small-btn outline" data-action="photo-item" data-scope="${scopeKey}" data-id="${itemId}">\uD83D\uDCF7 Photo</button>
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
      <button type="button" class="photo-rm" data-action="rm-photo" data-id="${p.id}">\u00d7</button>
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
      ${photos.length
        ? `<div class="photo-grid">${photos.map(p => `
            <div class="photo-card">
              <img src="${p.dataUrl}" alt="" />
              <p class="photo-cap">${escapeHtml(p.caption || 'Project photo')}</p>
              <button type="button" class="photo-rm" data-action="rm-photo" data-id="${p.id}">\u00d7</button>
            </div>`).join('')}</div>`
        : `<div class="empty-state">
            <div class="empty-icon">${iconCamera}</div>
            <p class="empty-title">No photos yet</p>
            <p class="empty">Capture serial numbers, damage, or site conditions.</p>
          </div>`}
    </div>`;
}

function renderBottomBar(views) {
  const last  = state.navIndex >= views.length - 1;
  const first = state.navIndex <= 0;
  return `
    <footer class="bottom-bar">
      <button type="button" class="btn outline" data-action="prev" ${first ? 'disabled' : ''}>\u2190 Previous</button>
      ${last
        ? '<button type="button" class="btn primary" data-action="summary">View Summary</button>'
        : '<button type="button" class="btn primary" data-action="next">Next \u2192</button>'}
    </footer>`;
}


// ── Summary view ─────────────────────────────────────────────
function renderSummaryView() {
  const project  = getCurrentProject();
  const total    = calcGrandTotal(project);
  const sections = getExportSections(project);
  return `
    <div class="summary-view">
      <header class="app-header compact">
        <div class="header-top">
          <button type="button" class="text-btn light" data-action="back">\u2190 Back</button>
          <span class="header-brand">Summary</span>
          <button type="button" class="icon-btn" data-action="export">${iconDownload}</button>
        </div>
        <div class="header-body">
          <p class="header-label">Total Estimate</p>
          <p class="header-total">${fmtMoney(total)}</p>
          <p class="header-meta plain">${escapeHtml(project.name)}</p>
        </div>
      </header>
      <div class="summary-body">
        ${sections.length
          ? sections.map(s => `
            <section class="summary-section">
              <div class="summary-sec-head"><strong>${escapeHtml(s.label)}</strong><span>${fmtMoney(s.total)}</span></div>
              ${s.rows.map(r => `
                <div class="summary-row">
                  <div><p>${escapeHtml(r.item.name)}</p><small>${r.sel.qty} ${escapeHtml(r.item.unit)} \u00d7 ${fmtMoneyDec(r.cost)}</small></div>
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
        <button type="button" class="btn primary full" data-action="back">\u2190 Edit Estimate</button>
        <button type="button" class="btn danger outline full" data-action="reset">Start New Estimate</button>
      </div>
    </div>
    ${renderOverlays(project)}`;
}

// ── Overlays (always in DOM, toggled via .open class) ────────
function renderOverlays(project) {
  const projects    = getProjects();
  const globalCount = Object.keys(getGlobalPriceOverrides()).length;
  return `
    <div class="overlay${state.drawerOpen ? ' open' : ''}" id="ov-drawer" data-action="close-drawer"></div>
    <aside class="drawer${state.drawerOpen ? ' open' : ''}">
      <div class="drawer-head">
        <img src="./assets/logo.png" alt="Spark Group" />
        <button type="button" class="icon-btn" data-action="close-drawer">\u00d7</button>
      </div>
      <div class="drawer-list">
        ${projects.length
          ? projects.map(p => `
            <div class="drawer-item${p.id === getCurrentId() ? ' active' : ''}">
              <button type="button" class="drawer-proj" data-action="switch" data-id="${p.id}">
                <span class="proj-name">${escapeHtml(p.name)}</span>
                <small>${formatDate(p.savedAt)}</small>
              </button>
              <button type="button" class="icon-btn sm" data-action="rename-proj" data-id="${p.id}" data-name="${escapeAttr(p.name)}">${iconPencil}</button>
              ${p.id !== getCurrentId() ? `<button type="button" class="icon-btn sm danger" data-action="delete-proj" data-id="${p.id}" data-name="${escapeAttr(p.name)}">${iconTrash}</button>` : ''}
            </div>`).join('')
          : '<p class="empty" style="padding:1rem">No projects</p>'}
      </div>
      <div class="drawer-foot">
        <button type="button" class="btn primary full" data-action="new-project">+ New Project</button>
        <div class="add-room-row">
          ${ROOM_TYPES.map(rt => `<button type="button" class="small-btn" data-action="add-room" data-type="${rt.type}">+ ${rt.label}</button>`).join('')}
        </div>
      </div>
    </aside>

    <div class="overlay${state.dealOpen ? ' open' : ''}" data-action="close-deal"></div>
    <div class="sheet${state.dealOpen ? ' open' : ''}">
      <div class="sheet-head"><strong>Deal Profit Analyzer</strong><button type="button" class="icon-btn" data-action="close-deal">\u00d7</button></div>
      <div class="sheet-body" id="deal-body">${renderDealPanel()}</div>
    </div>

    <div class="overlay${state.settingsOpen ? ' open' : ''}" data-action="close-settings"></div>
    <div class="sheet${state.settingsOpen ? ' open' : ''}">
      <div class="sheet-head"><strong>Settings</strong><button type="button" class="icon-btn" data-action="close-settings">\u00d7</button></div>
      <div class="sheet-body">
        <h3>Global Price Schedule</h3>
        <p class="hint">Upload a CSV with <code>id</code> and <code>cost</code> columns to update prices across all projects.</p>
        <div class="status-box${globalCount ? ' active' : ''}">${globalCount ? `${globalCount} custom price(s) active` : 'Using default prices'}</div>
        <label class="btn primary full file-label" style="margin-top:.8rem">Upload Prices (CSV)<input type="file" accept=".csv" id="price-csv" hidden /></label>
        ${globalCount ? '<button type="button" class="btn danger outline full" data-action="reset-prices" style="margin-top:.6rem">Reset to Defaults</button>' : ''}
      </div>
    </div>

    <div class="modal${state.modal ? ' open' : ''}" id="app-modal">
      <div class="modal-bg" data-action="modal-cancel"></div>
      <div class="modal-box">
        <h3>${state.modal?.title || ''}</h3>
        ${state.modal?.fields
          ? state.modal.fields.map(f => `
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

// ─────────────────────────────────────────────────────────────
//  TARGETED DOM SURGERY — no re-render for these hot paths
// ─────────────────────────────────────────────────────────────

/** Toggle a single line item in-place */
function patchLineItem(scopeKey, itemId) {
  const card = document.querySelector(`.line-item[data-scope="${scopeKey}"][data-id="${itemId}"]`);
  if (!card) return;
  const project = getCurrentProject();
  const item    = resolveItem(scopeKey, itemId);
  if (!item || !project) return;

  const sel   = getSelection(scopeKey, itemId);
  const total = calcLineTotal(item, scopeKey, itemId);

  // checked state classes
  card.classList.toggle('checked', sel.checked);

  // check button
  const btn = card.querySelector('.check-btn');
  if (btn) {
    btn.classList.toggle('on', sel.checked);
    btn.innerHTML = sel.checked ? iconCheck : '';
  }

  // line total text
  const ltEl = card.querySelector('.line-total');
  if (ltEl) ltEl.textContent = total > 0 ? fmtMoney(total) : '\u2014';

  // show / hide fields
  const existingFields = card.querySelector('.line-fields');
  if (sel.checked && !existingFields) {
    // build and inject
    const tmp = document.createElement('div');
    const remembered = recallQty(itemId);
    tmp.innerHTML = `
      <div class="line-fields">
        <label>Qty
          <input type="number" data-action="qty" data-scope="${scopeKey}" data-id="${itemId}"
            value="${sel.qty}" min="0" step="any" inputmode="decimal"
            placeholder="${item.defaultQty > 0 ? item.defaultQty : (remembered || qtyHint(item.unit))}" />
        </label>
        <span class="unit-tag">${escapeHtml(item.unit)}</span>
        ${item.hasYear ? `<label>Year<input type="number" data-action="year" data-scope="${scopeKey}" data-id="${itemId}" value="${sel.year || ''}" min="1970" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="2015" /></label>` : ''}
        <button type="button" class="small-btn outline" data-action="photo-item" data-scope="${scopeKey}" data-id="${itemId}">\uD83D\uDCF7 Photo</button>
      </div>`;
    card.appendChild(tmp.firstElementChild);
    const qtyInput = card.querySelector('input[data-action="qty"]');
    setTimeout(() => { try { qtyInput?.focus(); qtyInput?.select(); } catch {} }, 30);
  } else if (!sel.checked && existingFields) {
    existingFields.remove();
    card.querySelector('.photo-strip')?.remove();
  }

  patchGroupCard(scopeKey, card.closest('.group-card'));
}

/** Refresh a group card's totals/chip without collapsing it */
function patchGroupCard(scopeKey, groupEl) {
  if (!groupEl) return;
  const project = getCurrentProject();
  const gid = groupEl.dataset.group?.split(':')[1];
  if (!gid || !project) return;

  const views  = buildNavViews(project);
  const view   = views[state.navIndex];
  if (!view?.scopeKey) return;

  const { groups } = getScopeItems(view.scopeKey, null, project);
  const group = groups.find(g => g.groupId === gid);
  if (!group) return;

  let total = 0, checked = 0;
  for (const e of group.entries) {
    total   += calcLineTotal(e.item, view.scopeKey, e.itemId);
    if (getSelection(view.scopeKey, e.itemId).checked) checked++;
  }

  groupEl.classList.toggle('has-checked', checked > 0);
  const gtEl = groupEl.querySelector('.group-total');
  if (gtEl) gtEl.textContent = total > 0 ? fmtMoney(total) : '\u2014';

  const chip = groupEl.querySelector('.chip');
  const head = groupEl.querySelector('.group-head');
  if (checked > 0) {
    if (chip) chip.textContent = `${checked}\u2713`;
    else if (head) {
      const t = document.createElement('span');
      t.className = 'chip';
      t.textContent = `${checked}\u2713`;
      const lbl = head.querySelector('.group-label');
      if (lbl) lbl.after(t);
    }
  } else {
    chip?.remove();
  }
}

/** Toggle group expand/collapse — only inserts/removes the body */
function toggleGroupInPlace(scopeKey, gid) {
  const key     = `${scopeKey}:${gid}`;
  const groupEl = document.querySelector(`.group-card[data-group="${key}"]`);
  if (!groupEl) return;

  const wasOpen = state.expandedGroups.has(key);
  if (wasOpen) {
    state.expandedGroups.delete(key);
    groupEl.querySelector('.group-body')?.remove();
  } else {
    state.expandedGroups.add(key);
    const project = getCurrentProject();
    const views   = buildNavViews(project);
    const view    = views[state.navIndex];
    const { groups } = getScopeItems(view.scopeKey, null, project);
    const group   = groups.find(g => g.groupId === gid);
    if (group) {
      const tmp = document.createElement('div');
      tmp.innerHTML = `<div class="group-body">
        <div class="group-actions">
          <button type="button" class="small-btn" data-action="add-item" data-scope="${scopeKey}" data-gid="${gid}">+ Add Item</button>
        </div>
        ${group.entries.map(e => renderLineItem(scopeKey, e.itemId, e.item, project, true, e.custom)).join('')}
      </div>`;
      groupEl.appendChild(tmp.firstElementChild);
    }
  }
  // flip chevron
  const chev = groupEl.querySelector('.chevron');
  if (chev) chev.classList.toggle('open', !wasOpen);
}

/** Toggle overlay sheets open/closed without re-render */
function setOverlay(which, open) {
  const map = { drawer: 'close-drawer', deal: 'close-deal', settings: 'close-settings' };
  const sheetEls   = document.querySelectorAll('.sheet');
  const overlayEls = document.querySelectorAll('.overlay');
  const drawerEl   = document.querySelector('aside.drawer');
  const drawerOv   = document.getElementById('ov-drawer');

  if (which === 'drawer') {
    state.drawerOpen = open;
    drawerEl?.classList.toggle('open', open);
    drawerOv?.classList.toggle('open', open);
    return;
  }

  // deal / settings sheets — find by close action
  const closeAction = map[which];
  document.querySelectorAll('.sheet').forEach(el => {
    const head = el.querySelector(`[data-action="${closeAction}"]`);
    if (head) {
      state[`${which}Open`] = open;
      el.classList.toggle('open', open);
      // sibling overlay (the one immediately before the sheet)
      const ov = el.previousElementSibling;
      if (ov?.classList.contains('overlay')) ov.classList.toggle('open', open);
    }
  });
}


// ═══════════════════════════════════════════════════════════
//  EVENT BINDING
// ═══════════════════════════════════════════════════════════
function bindGlobalEvents() {
  document.body.addEventListener('click',  onClick);
  document.body.addEventListener('input',  onInput);
  document.body.addEventListener('change', e => { if (e.target.id === 'price-csv') onPriceCsv(e); });
  document.body.addEventListener('touchstart', onTouchStart, { passive: true });
  document.body.addEventListener('touchend',   onTouchEnd,   { passive: true });
  document.addEventListener('keydown', onKey);
  window.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);
}

// ── swipe ─────────────────────────────────────────────────
function onTouchStart(e) {
  state.touchStartX = e.changedTouches[0].clientX;
  state.touchStartY = e.changedTouches[0].clientY;
}
function onTouchEnd(e) {
  if (state.drawerOpen || state.dealOpen || state.settingsOpen || state.modal) return;
  const dx = e.changedTouches[0].clientX - state.touchStartX;
  const dy = e.changedTouches[0].clientY - state.touchStartY;
  if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
  const project = getCurrentProject(); if (!project) return;
  const views = buildNavViews(project);
  if (dx < -40 && state.navIndex < views.length - 1) { state.navIndex++; switchTab(); }
  else if (dx > 40 && state.navIndex > 0)            { state.navIndex--; switchTab(); }
}

// ── keyboard ───────────────────────────────────────────────
function onKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (state.modal) { if (e.key === 'Escape') closeModal(); return; }
  const project = getCurrentProject(); if (!project) return;
  const views = buildNavViews(project);
  if (e.key === 'ArrowRight' && state.navIndex < views.length - 1) { state.navIndex++; switchTab(); }
  if (e.key === 'ArrowLeft'  && state.navIndex > 0)               { state.navIndex--; switchTab(); }
  if (e.key === 's' || e.key === 'S') { state.showSummary = !state.showSummary; fullRender(); }
}

// ── toast + haptic ─────────────────────────────────────────
function showToast(msg) {
  const old = document.getElementById('spark-toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'spark-toast'; el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch {} }

// ── click handler ──────────────────────────────────────────
function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    // ── overlays — no re-render ──────────────────────────
    case 'open-drawer':   setOverlay('drawer',   true);  break;
    case 'close-drawer':  setOverlay('drawer',   false); break;
    case 'open-deal':     setOverlay('deal',     true);  break;
    case 'close-deal':    setOverlay('deal',     false); break;
    case 'open-settings': setOverlay('settings', true);  break;
    case 'close-settings':setOverlay('settings', false); break;

    // ── dark mode — update icon only ─────────────────────
    case 'toggle-dark': {
      toggleDarkMode();
      document.querySelectorAll('[data-action="toggle-dark"]').forEach(b => {
        b.innerHTML = isDarkMode() ? iconSun : iconMoon;
      });
      break;
    }

    case 'export': exportProject(); break;

    // ── tab navigation — swap main only ──────────────────
    case 'nav': {
      const idx = parseInt(btn.dataset.index);
      if (idx === state.navIndex) break;
      state.navIndex = idx;
      switchTab();
      break;
    }
    case 'prev': {
      if (state.navIndex <= 0) break;
      state.navIndex--;
      switchTab();
      break;
    }
    case 'next': {
      const views = buildNavViews(getCurrentProject());
      if (state.navIndex >= views.length - 1) break;
      state.navIndex++;
      switchTab();
      break;
    }

    case 'summary': state.showSummary = true;  fullRender(); break;
    case 'back':    state.showSummary = false; fullRender(); break;

    case 'reset':
      if (confirm('Start a new estimate? All entries will be cleared.')) {
        resetCurrentEstimate();
        state.navIndex = 0; state.showSummary = false; state.expandedGroups.clear();
      }
      break;

    // ── group expand — in-place ───────────────────────────
    case 'toggle-group':
      toggleGroupInPlace(btn.dataset.scope, btn.dataset.gid);
      break;

    // ── check item — surgical DOM update ─────────────────
    case 'toggle': {
      const { scope, id } = btn.dataset;
      const sel  = getSelection(scope, id);
      const item = resolveItem(scope, id);
      const nowChecked = !sel.checked;
      haptic();
      // Only auto-fill qty when checking on; defaultQty of 0 is treated as "needs input"
      const autoQty = nowChecked
        ? (item?.defaultQty > 0 ? String(item.defaultQty) : (recallQty(id) || sel.qty || ''))
        : sel.qty;
      setSelection(scope, id, { checked: nowChecked, qty: autoQty });
      if (nowChecked) {
        const lineTotal = calcLineTotal(item, scope, id);
        if (lineTotal > 0) showToast(`+${fmtMoney(lineTotal)}`);
      }
      patchLineItem(scope, id);
      patchHeader();
      patchNavBadges();
      break;
    }

    case 'edit-cost': {
      const { scope, id } = btn.dataset;
      const item = resolveItem(scope, id);
      const sel  = getSelection(scope, id);
      openModal({
        title: 'Edit Unit Cost',
        fields: [{ id: 'cost', label: `${item?.name || id} ($/${item?.unit})`, type: 'number', value: sel.unitCostOverride ?? effectiveCost(item, scope, id) }],
        onConfirm: (vals) => { setSelection(scope, id, { unitCostOverride: parseFloat(vals.cost) }); },
      }); break;
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
          { id: 'name', label: 'Item name',  placeholder: 'Closet shelving' },
          { id: 'cost', label: 'Unit cost',  type: 'number', placeholder: '0' },
          { id: 'unit', label: 'Unit',       placeholder: 'ea.', value: 'ea.' },
        ],
        onConfirm: (vals) => {
          if (vals.name) { addCustomItem(scope, gid, vals); state.expandedGroups.add(`${scope}:${gid}`); }
        },
      }); break;
    }

    case 'photo-item':    capturePhoto(btn.dataset.scope || null, btn.dataset.id || null); break;
    case 'photo-project': capturePhoto(null, null); break;
    case 'rm-photo': removePhoto(btn.dataset.id); break;

    case 'rename-project':
      openModal({ title: 'Rename Project', placeholder: '123 Main St', value: getCurrentProject()?.name,
        onConfirm: v => renameProject(getCurrentId(), v) }); break;
    case 'rename-room':
      openModal({ title: 'Rename Room', value: getCurrentProject()?.rooms.find(r => r.id === btn.dataset.roomId)?.name,
        onConfirm: v => renameRoom(btn.dataset.roomId, v) }); break;
    case 'remove-room':
      if (confirm('Remove this room and all its entries?')) removeRoom(btn.dataset.roomId); break;

    case 'new-project':
      state.drawerOpen = false;
      openModal({ title: 'New Project', placeholder: '123 Main St',
        onConfirm: name => { flushSave(); createProject(name); state.navIndex = 0; state.expandedGroups.clear(); } });
      break;
    case 'switch':
      flushSave(); switchProject(btn.dataset.id); state.navIndex = 0; state.drawerOpen = false; break;
    case 'rename-proj':
      openModal({ title: 'Rename Project', value: btn.dataset.name,
        onConfirm: v => renameProject(btn.dataset.id, v) }); break;
    case 'delete-proj':
      if (confirm(`Delete "${btn.dataset.name}"?`)) deleteProject(btn.dataset.id); break;

    case 'add-room': {
      const newId = addRoom(btn.dataset.type);
      const views = buildNavViews(getCurrentProject());
      const idx   = views.findIndex(v => v.id === newId);
      state.navIndex = idx >= 0 ? idx : 0; state.drawerOpen = false; break;
    }

    case 'reset-prices':
      if (confirm('Reset all global prices to defaults?')) resetGlobalPrices(); break;

    case 'modal-cancel':  closeModal(); break;
    case 'modal-confirm': confirmModal(); break;
  }
}

// ── input ────────────────────────────────────────────────────
function onInput(e) {
  const el = e.target;
  if (el.dataset.action === 'qty') {
    const qty = el.value;
    setSelection(el.dataset.scope, el.dataset.id, { qty });
    rememberQty(el.dataset.id, qty);
    // live-update totals in DOM — no re-render
    const item = resolveItem(el.dataset.scope, el.dataset.id);
    if (item) {
      const total = calcLineTotal(item, el.dataset.scope, el.dataset.id);
      el.closest('.line-item')?.querySelector('.line-total')
        ?.replaceChildren(document.createTextNode(total > 0 ? fmtMoney(total) : '\u2014'));
      patchGroupCard(el.dataset.scope, el.closest('.group-card'));
      patchHeader();
      patchNavBadges();
    }
  }
  if (el.dataset.action === 'year') setSelection(el.dataset.scope, el.dataset.id, { year: el.value });
}

// ── photo capture ─────────────────────────────────────────────
function capturePhoto(scopeKey, itemId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.style.cssText = 'position:fixed;top:-999px;opacity:0';
  document.body.appendChild(input);
  input.onchange = async () => {
    document.body.removeChild(input);
    if (!input.files?.length) return;
    for (const file of input.files) {
      const dataUrl = await compressImage(file);
      addPhoto({ dataUrl, scopeKey: scopeKey || null, itemId: itemId || null,
        caption: itemId ? (getItem(itemId)?.name || 'Item photo') : 'Project photo' });
    }
  };
  input.click();
}

// ── CSV price upload ──────────────────────────────────────────
function onPriceCsv(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const rows = parseCsv(ev.target.result);
    const overrides = { ...getGlobalPriceOverrides() };
    let n = 0;
    for (const row of rows) {
      const id = row.id?.trim(); const cost = parseFloat(row.cost);
      if (id && !isNaN(cost) && cost >= 0) { overrides[id] = cost; n++; }
    }
    setGlobalPriceOverrides(overrides); alert(`${n} price(s) updated.`);
  };
  reader.readAsText(file); e.target.value = '';
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const hdrs  = parseCsvLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(hdrs.map((h, i) => [h.trim(), vals[i] ?? '']));
  });
}
function parseCsvLine(line) {
  const r = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { r.push(cur.trim()); cur = ''; } else cur += c;
  }
  r.push(cur.trim()); return r;
}

// ── modal ─────────────────────────────────────────────────────
function openModal(opts) {
  state.modal = opts;
  const modal = document.getElementById('app-modal');
  if (!modal) { fullRender(); return; }
  // update modal content in-place
  const box = modal.querySelector('.modal-box');
  if (box) {
    box.querySelector('h3').textContent = opts.title || '';
    const fieldsHtml = opts.fields
      ? opts.fields.map(f => `<label class="field"><span>${f.label}</span><input type="${f.type || 'text'}" id="modal-${f.id}" placeholder="${f.placeholder || ''}" value="${f.value || ''}" step="any" /></label>`).join('')
      : `<input type="text" id="modal-input" placeholder="${opts.placeholder || ''}" value="${opts.value || ''}" />`;
    const actionsHtml = box.querySelector('.modal-actions')?.outerHTML || '<div class="modal-actions"><button type="button" class="btn outline" data-action="modal-cancel">Cancel</button><button type="button" class="btn primary" data-action="modal-confirm">Save</button></div>';
    box.innerHTML = `<h3>${opts.title || ''}</h3>${fieldsHtml}${actionsHtml}`;
  }
  modal.classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('modal-input') || document.querySelector('#app-modal input');
    try { inp?.focus(); inp?.select(); } catch {}
    inp?.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmModal();
      if (e.key === 'Escape') closeModal();
    });
  }, 50);
}
function closeModal() {
  state.modal = null;
  document.getElementById('app-modal')?.classList.remove('open');
}
function confirmModal() {
  const m = state.modal; if (!m) return;
  if (m.fields) {
    const vals = {};
    for (const f of m.fields) vals[f.id] = document.getElementById(`modal-${f.id}`)?.value?.trim();
    m.onConfirm?.(vals);
  } else {
    const v = document.getElementById('modal-input')?.value?.trim();
    if (v) m.onConfirm?.(v);
  }
  closeModal();
}

// ── helpers ───────────────────────────────────────────────────
/** Sensible qty placeholder by unit so the field never shows a useless "0" */
function qtyHint(unit) {
  if (!unit) return '1';
  const u = unit.toLowerCase();
  if (u.includes('sqft') || u.includes('sq ft')) return '100';
  if (u.includes('lf') || u.includes('lin'))     return '20';
  if (u.includes('hr') || u.includes('hour'))    return '4';
  if (u.includes('day'))                          return '1';
  return '1';
}
function resolveItem(scopeKey, itemId) {
  const item = getItem(itemId);
  if (item) return item;
  const c = getCurrentProject()?.customItems?.find(x => x.id === itemId);
  if (c) return { id: c.id, name: c.name, cost: c.cost, unit: c.unit, custom: true };
  return null;
}
function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; }
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

// ── icons ──────────────────────────────────────────────────────
const iconCheck      = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
const iconCheckSmall = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>';
const iconChevron    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
const iconPencil     = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const iconTrash      = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
const iconGear       = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const iconDownload   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
const iconCamera     = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const iconClipboard  = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
const iconMenu       = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
const iconDollar     = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
const iconHome       = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
const iconMoon       = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const iconSun        = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
