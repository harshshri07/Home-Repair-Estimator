import {
  getItem,
  getGroupDef,
  getHouseSection,
  getGroupsForRoomType,
  selectionKey,
  GROUP_DEFS,
  HOUSE_SECTIONS,
  ROOM_TYPE_GROUPS,
} from './catalog.js';
import { getCurrentProject, getGlobalPriceOverrides, getSelection, isItemHidden, enumerateGroups } from './store.js';

export function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtMoneyDec(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function effectiveCost(item, scopeKey, itemId) {
  const project = getCurrentProject();
  const sel = getSelection(scopeKey, itemId);
  if (sel.unitCostOverride != null && sel.unitCostOverride !== '') {
    return parseFloat(sel.unitCostOverride);
  }
  const global = getGlobalPriceOverrides();
  if (global[itemId] != null) return global[itemId];
  return item?.cost ?? 0;
}

export function calcLineTotal(item, scopeKey, itemId) {
  const sel = getSelection(scopeKey, itemId);
  if (!sel.checked) return 0;
  const qty = parseFloat(sel.qty);
  if (!qty || qty <= 0) return 0;
  if (item?.noAction) return 0;
  const raw = qty * effectiveCost(item, scopeKey, itemId);
  return item?.min ? Math.max(raw, item.min) : raw;
}

export function getScopeItems(scopeKey, sectionOrRoomType, project) {
  const items = [];
  let groups = [];
  let standalone = [];

  if (scopeKey.startsWith('house:')) {
    const sectionId = scopeKey.replace('house:', '');
    const sec = getHouseSection(sectionId);
    if (!sec) return { groups: [], standalone: [] };
    groups = sec.groups.map(gid => ({ gid, def: getGroupDef(gid) }));
    standalone = sec.standalone || [];
  } else if (scopeKey.startsWith('room:')) {
    const roomId = scopeKey.slice(5);
    const room = project.rooms.find(r => r.id === roomId);
    if (!room) return { groups: [], standalone: [] };
    groups = getGroupsForRoomType(room.type).map(g => ({ gid: g.id, def: g }));
  }

  const customByGroup = {};
  for (const c of project.customItems || []) {
    if (c.scopeKey !== scopeKey) continue;
    if (!customByGroup[c.groupId]) customByGroup[c.groupId] = [];
    customByGroup[c.groupId].push(c);
  }

  const groupSlots = groups.map(({ gid, def }) => {
    const catalogIds = (def?.ids || []).filter(id => !isItemHidden(scopeKey, id));
    const entries = catalogIds.map(id => ({ itemId: id, item: getItem(id), custom: false }));
    for (const c of customByGroup[gid] || []) {
      entries.push({
        itemId: c.id,
        item: { id: c.id, name: c.name, cost: c.cost, unit: c.unit, custom: true },
        custom: true,
      });
    }
    return { groupId: gid, label: def?.label, entries };
  });

  const standaloneEntries = standalone
    .filter(id => !isItemHidden(scopeKey, id))
    .map(id => ({ itemId: id, item: getItem(id), custom: false }));

  return { groups: groupSlots, standalone: standaloneEntries };
}

export function calcScopeTotal(scopeKey, project) {
  let total = 0;
  const { groups, standalone } = getScopeItems(scopeKey, null, project);
  for (const g of groups) {
    for (const e of g.entries) {
      total += calcLineTotal(e.item, scopeKey, e.itemId);
    }
  }
  for (const e of standalone) {
    total += calcLineTotal(e.item, scopeKey, e.itemId);
  }
  return total;
}

export function calcGrandTotal(project) {
  let total = 0;
  for (const sec of Object.values(HOUSE_SECTIONS)) {
    total += calcScopeTotal(sec.scopeKey, project);
  }
  for (const room of project.rooms || []) {
    total += calcScopeTotal(`room:${room.id}`, project);
  }
  return total;
}

export function isGroupComplete(scopeKey, groupId, project) {
  const def = getGroupDef(groupId);
  if (!def) return false;
  for (const id of def.ids) {
    if (isItemHidden(scopeKey, id)) continue;
    const sel = getSelection(scopeKey, id);
    if (sel.checked) return true;
  }
  const customs = (project.customItems || []).filter(c => c.scopeKey === scopeKey && c.groupId === groupId);
  for (const c of customs) {
    if (getSelection(scopeKey, c.id).checked) return true;
  }
  return false;
}

export function calcProgress(project) {
  const all = enumerateGroups(project);
  let checked = 0;
  for (const g of all) {
    if (isGroupComplete(g.scopeKey, g.groupId, project)) checked++;
  }
  return { checked, total: all.length, pct: all.length ? Math.round(checked / all.length * 100) : 0 };
}

export function getExportSections(project) {
  const sections = [];
  for (const [secId, sec] of Object.entries(HOUSE_SECTIONS)) {
    const rows = collectRows(sec.scopeKey, project);
    if (rows.length) sections.push({ label: sec.label, rows, total: rows.reduce((s, r) => s + r.total, 0) });
  }
  for (const room of project.rooms || []) {
    const scopeKey = `room:${room.id}`;
    const rows = collectRows(scopeKey, project);
    if (rows.length) sections.push({ label: room.name, rows, total: rows.reduce((s, r) => s + r.total, 0) });
  }
  return sections;
}

function collectRows(scopeKey, project) {
  const rows = [];
  const { groups, standalone } = getScopeItems(scopeKey, null, project);
  for (const g of groups) {
    for (const e of g.entries) {
      const sel = getSelection(scopeKey, e.itemId);
      const total = calcLineTotal(e.item, scopeKey, e.itemId);
      if (sel.checked && (e.item?.noAction || (parseFloat(sel.qty) > 0 && total >= 0))) {
        if (!e.item?.noAction && total > 0) {
          rows.push({
            item: e.item,
            sel,
            total,
            scopeKey,
            itemId: e.itemId,
            groupLabel: g.label,
            cost: effectiveCost(e.item, scopeKey, e.itemId),
          });
        }
      }
    }
  }
  for (const e of standalone) {
    const sel = getSelection(scopeKey, e.itemId);
    const total = calcLineTotal(e.item, scopeKey, e.itemId);
    if (sel.checked && parseFloat(sel.qty) > 0 && total > 0) {
      rows.push({
        item: e.item,
        sel,
        total,
        scopeKey,
        itemId: e.itemId,
        groupLabel: '',
        cost: effectiveCost(e.item, scopeKey, e.itemId),
      });
    }
  }
  return rows;
}

export function countCheckedInScope(scopeKey, project) {
  let n = 0;
  const { groups, standalone } = getScopeItems(scopeKey, null, project);
  for (const g of groups) {
    for (const e of g.entries) {
      if (getSelection(scopeKey, e.itemId).checked) n++;
    }
  }
  for (const e of standalone) {
    if (getSelection(scopeKey, e.itemId).checked) n++;
  }
  return n;
}
