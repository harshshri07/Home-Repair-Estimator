import {
  defaultRooms,
  selectionKey,
  getHouseSection,
  getGroupsForRoomType,
  ROOM_TYPE_GROUPS,
  HOUSE_SECTIONS,
} from './catalog.js';

const PROJECTS_KEY = 'spark_projects_v2';
const GLOBAL_PRICES_KEY = 'spark_global_prices_v2';

let _projects = [];
let _currentId = null;
let _globalPriceOverrides = {};
let _saveTimer = null;
let _listeners = [];

export function subscribe(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function notify() {
  _listeners.forEach(fn => fn());
}

export function loadStore() {
  try {
    _projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  } catch {
    _projects = [];
  }
  try {
    _globalPriceOverrides = JSON.parse(localStorage.getItem(GLOBAL_PRICES_KEY) || '{}');
  } catch {
    _globalPriceOverrides = {};
  }
  if (_projects.length && !_currentId) _currentId = _projects[0].id;
}

export function getGlobalPriceOverrides() {
  return { ..._globalPriceOverrides };
}

export function setGlobalPriceOverrides(overrides) {
  _globalPriceOverrides = { ...overrides };
  localStorage.setItem(GLOBAL_PRICES_KEY, JSON.stringify(_globalPriceOverrides));
  notify();
}

export function resetGlobalPrices() {
  _globalPriceOverrides = {};
  localStorage.setItem(GLOBAL_PRICES_KEY, '{}');
  notify();
}

export function getProjects() {
  return [..._projects];
}

export function getCurrentProject() {
  return _projects.find(p => p.id === _currentId) || null;
}

export function getCurrentId() {
  return _currentId;
}

function blankSelection() {
  return { checked: false, qty: '', year: '', unitCostOverride: null, note: '' };
}

export function createProject(name) {
  const project = {
    id: `proj_${Date.now()}`,
    name: name || 'New Estimate',
    savedAt: new Date().toISOString(),
    arv: '',
    offerPrice: '',
    holdingCostPerMonth: '',
    holdMonths: '3',
    rooms: defaultRooms(),
    selections: {},
    customItems: [],
    hiddenItems: [],
    photos: [],
  };
  _projects.unshift(project);
  _currentId = project.id;
  persistProjects();
  notify();
  return project;
}

export function switchProject(id) {
  if (_projects.some(p => p.id === id)) {
    _currentId = id;
    notify();
  }
}

export function renameProject(id, name) {
  const p = _projects.find(x => x.id === id);
  if (p && name) {
    p.name = name;
    p.savedAt = new Date().toISOString();
    persistProjects();
    notify();
  }
}

export function deleteProject(id) {
  _projects = _projects.filter(p => p.id !== id);
  if (_currentId === id) _currentId = _projects[0]?.id || null;
  if (!_projects.length) createProject('New Estimate');
  persistProjects();
  notify();
}

export function updateProject(patch) {
  const p = getCurrentProject();
  if (!p) return;
  Object.assign(p, patch);
  p.savedAt = new Date().toISOString();
  scheduleSave();
}

export function getSelection(scopeKey, itemId) {
  const p = getCurrentProject();
  if (!p) return blankSelection();
  const k = selectionKey(scopeKey, itemId);
  if (!p.selections[k]) p.selections[k] = blankSelection();
  return p.selections[k];
}

export function setSelection(scopeKey, itemId, patch) {
  const p = getCurrentProject();
  if (!p) return;
  const k = selectionKey(scopeKey, itemId);
  if (!p.selections[k]) p.selections[k] = blankSelection();
  Object.assign(p.selections[k], patch);
  scheduleSave();
}

export function addRoom(type) {
  const p = getCurrentProject();
  if (!p) return;
  const count = p.rooms.filter(r => r.type === type).length + 1;
  const labels = { kitchen: 'Kitchen', bathroom: 'Bathroom', bedroom: 'Bedroom', living: 'Living Room' };
  const id = `${type[0]}${Date.now()}`;
  p.rooms.push({ id, type, name: `${labels[type] || type} ${count}` });
  scheduleSave();
  notify();
  return id;
}

export function removeRoom(roomId) {
  const p = getCurrentProject();
  if (!p) return;
  const room = p.rooms.find(r => r.id === roomId);
  if (!room) return;
  const scope = `room:${roomId}`;
  p.selections = Object.fromEntries(
    Object.entries(p.selections).filter(([k]) => !k.startsWith(`${scope}:`))
  );
  p.customItems = p.customItems.filter(c => c.scopeKey !== scope);
  p.photos = p.photos.filter(ph => ph.scopeKey !== scope);
  p.rooms = p.rooms.filter(r => r.id !== roomId);
  scheduleSave();
  notify();
}

export function renameRoom(roomId, name) {
  const p = getCurrentProject();
  const room = p.rooms?.find(r => r.id === roomId);
  if (room && name) {
    room.name = name;
    scheduleSave();
    notify();
  }
}

export function hideItem(scopeKey, itemId) {
  const p = getCurrentProject();
  if (!p) return;
  const token = `${scopeKey}:${itemId}`;
  if (!p.hiddenItems.includes(token)) p.hiddenItems.push(token);
  const k = selectionKey(scopeKey, itemId);
  delete p.selections[k];
  scheduleSave();
  notify();
}

export function isItemHidden(scopeKey, itemId) {
  const p = getCurrentProject();
  return p?.hiddenItems?.includes(`${scopeKey}:${itemId}`) ?? false;
}

export function addCustomItem(scopeKey, groupId, { name, cost, unit }) {
  const p = getCurrentProject();
  if (!p) return null;
  const id = `custom_${Date.now()}`;
  p.customItems.push({ id, scopeKey, groupId, name, cost: parseFloat(cost) || 0, unit: unit || 'ea.' });
  scheduleSave();
  notify();
  return id;
}

export function removeCustomItem(customId) {
  const p = getCurrentProject();
  if (!p) return;
  const item = p.customItems.find(c => c.id === customId);
  if (item) {
    delete p.selections[selectionKey(item.scopeKey, customId)];
    p.customItems = p.customItems.filter(c => c.id !== customId);
    p.photos = p.photos.filter(ph => ph.itemId !== customId);
    scheduleSave();
    notify();
  }
}

export function addPhoto(photo) {
  const p = getCurrentProject();
  if (!p) return;
  p.photos.push({
    id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...photo,
  });
  scheduleSave();
  notify();
}

export function removePhoto(photoId) {
  const p = getCurrentProject();
  if (!p) return;
  p.photos = p.photos.filter(ph => ph.id !== photoId);
  scheduleSave();
  notify();
}

export function resetCurrentEstimate() {
  const p = getCurrentProject();
  if (!p) return;
  p.selections = {};
  p.customItems = [];
  p.hiddenItems = [];
  p.photos = [];
  p.rooms = defaultRooms();
  p.arv = '';
  p.offerPrice = '';
  p.holdingCostPerMonth = '';
  p.holdMonths = '3';
  scheduleSave();
  notify();
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const p = getCurrentProject();
    if (p) p.savedAt = new Date().toISOString();
    persistProjects();
  }, 800);
}

function persistProjects() {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(_projects));
  } catch {
    try {
      const stripped = _projects.map(p => ({ ...p, photos: [] }));
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(stripped));
    } catch { /* quota exceeded */ }
  }
}

export function flushSave() {
  clearTimeout(_saveTimer);
  persistProjects();
}

/** All group instances for progress counting */
export function enumerateGroups(project) {
  const groups = [];
  for (const sec of Object.values(HOUSE_SECTIONS)) {
    for (const gid of sec.groups) {
      groups.push({ scopeKey: sec.scopeKey, groupId: gid, label: gid });
    }
  }
  for (const room of project.rooms || []) {
    const scopeKey = `room:${room.id}`;
    for (const gid of ROOM_TYPE_GROUPS[room.type] || []) {
      groups.push({ scopeKey, groupId: gid, roomName: room.name });
    }
  }
  return groups;
}

export function initStore() {
  loadStore();
  if (!_projects.length) createProject('New Estimate');
  else if (!_currentId) _currentId = _projects[0].id;
}
