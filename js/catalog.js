/** Spark Homes repair catalog — prices from Pricing List.csv + group/room mappings */

const NAN = (prefix, n) => ({
  id: `${prefix}-nan-${n}`,
  name: 'No Action Needed',
  cost: 0,
  unit: 'flat',
  noAction: true,
});

/** Extra metadata not in CSV */
const META = {
  'ig-05': { notes: '$1.60–1.80/SF material' },
  'ig-14': { min: 500 },
  'ig-15': { min: 75, defaultQty: 1 },
  'ig-16': { defaultQty: 1 },
  'ig-19': { min: 500, defaultQty: 143 },
  'ig-20': { defaultQty: 1 },
  'ig-21': { defaultQty: 1 },
  'ig-23': { min: 100 },
  'ig-25': { defaultQty: 1 },
  'ig-26': { defaultQty: 1, notes: '1–40yd dumpster per load' },
  'ig-27': { min: 250, defaultQty: 1 },
  'ig-28': { notes: '45 days; +$500 if > 45 days' },
  'kt-06': { min: 1050 },
  'as-01': { hasYear: true, notes: 'Photo of serial required' },
  'as-02': { hasYear: true, notes: 'Photo of serial required' },
  'as-08': { hasYear: true, notes: 'Photo of serial required' },
  'as-11': { defaultQty: 1 },
  'as-16': { min: 1000, notes: 'Photo each side required' },
  'as-17': { defaultQty: 1 },
  'ex-04': { min: 500, defaultQty: 1 },
  'ex-08': { min: 500 },
  'ex-20': { defaultQty: 12 },
};

export const GROUP_DEFS = {
  'ig:flooring': { label: 'Flooring', ids: ['ig-nan-1', 'ig-01', 'ig-02', 'ig-03', 'ig-04', 'ig-05', 'ig-06'] },
  'ig:paint': { label: 'Paint & Wall Repair', ids: ['ig-nan-2', 'ig-07', 'ig-08', 'ig-09'] },
  'ig:doors': { label: 'Doors', ids: ['ig-nan-3', 'ig-10', 'ig-11', 'ig-12', 'ig-13', 'ig-14', 'ig-15', 'ig-16', 'ig-17', 'ig-18'] },
  'ig:pest': { label: 'Pest Control', ids: ['ig-nan-4', 'ig-23', 'ig-24'] },
  'kt:cabinets': { label: 'Cabinets', ids: ['kt-nan-1', 'kt-01', 'kt-02', 'kt-03', 'kt-04', 'kt-05'] },
  'kt:counters': { label: 'Countertops & Tile', ids: ['kt-nan-2', 'kt-06', 'kt-07', 'kt-08', 'kt-09', 'kt-10'] },
  'kt:appliances': { label: 'Appliances', ids: ['kt-nan-3', 'kt-11', 'kt-12', 'kt-13', 'kt-14', 'kt-15', 'kt-16', 'kt-17'] },
  'ba:vanity': { label: 'Vanity & Countertop', ids: ['ba-nan-1', 'ba-01', 'ba-02', 'ba-03', 'ba-14'] },
  'ba:tub': { label: 'Tub & Shower', ids: ['ba-nan-2', 'ba-07', 'ba-08', 'ba-09', 'ba-10', 'ba-11', 'ba-12', 'ba-13'] },
  'ba:tile': { label: 'Tile', ids: ['ba-nan-3', 'ba-05', 'ba-06'] },
  'as:hvac': { label: 'HVAC', ids: ['as-nan-1', 'as-01', 'as-02', 'as-03', 'as-04', 'as-05', 'as-06', 'as-07'] },
  'as:electrical': { label: 'Electrical', ids: ['as-nan-2', 'as-10', 'as-11', 'as-18', 'as-19', 'as-20', 'as-24'] },
  'as:structural': { label: 'Structural', ids: ['as-nan-3', 'as-12', 'as-13', 'as-14', 'as-15'] },
  'as:insulation': { label: 'Insulation & Drywall', ids: ['as-nan-4', 'as-21', 'as-22', 'as-23'] },
  'ex:fence': { label: 'Fence', ids: ['ex-nan-1', 'ex-01', 'ex-02', 'ex-03'] },
  'ex:siding': { label: 'Siding', ids: ['ex-nan-2', 'ex-05', 'ex-09'] },
  'ex:windows': { label: 'Windows', ids: ['ex-nan-3', 'ex-13', 'ex-14', 'ex-15', 'ex-16', 'ex-17'] },
  'ex:garage': { label: 'Garage', ids: ['ex-nan-4', 'ex-21', 'ex-22', 'ex-23'] },
  'ex:trees': { label: 'Trees', ids: ['ex-nan-5', 'ex-10', 'ex-11', 'ex-12'] },
  'br:flooring': { label: 'Flooring', ids: ['br-nan-1', 'ig-01', 'ig-02', 'ig-03', 'ig-04', 'ig-05', 'ig-06'] },
  'br:paint': { label: 'Paint', ids: ['br-nan-2', 'ig-07', 'ig-08', 'ig-09'] },
  'br:doors': { label: 'Doors', ids: ['br-nan-3', 'ig-10', 'ig-11', 'ig-12', 'ig-13'] },
  'br:closet': { label: 'Closet', ids: ['br-nan-4', 'ig-19'] },
  'lv:flooring': { label: 'Flooring', ids: ['lv-nan-1', 'ig-01', 'ig-02', 'ig-03', 'ig-04', 'ig-05', 'ig-06'] },
  'lv:paint': { label: 'Paint', ids: ['lv-nan-2', 'ig-07', 'ig-08', 'ig-09'] },
  'lv:doors': { label: 'Doors', ids: ['lv-nan-3', 'ig-10', 'ig-11', 'ig-12', 'ig-13'] },
  'lv:lighting': { label: 'Lighting', ids: ['lv-nan-4', 'ig-22'] },
};

const NAN_ITEMS = [
  NAN('ig', 1), NAN('ig', 2), NAN('ig', 3), NAN('ig', 4),
  NAN('kt', 1), NAN('kt', 2), NAN('kt', 3),
  NAN('ba', 1), NAN('ba', 2), NAN('ba', 3),
  NAN('as', 1), NAN('as', 2), NAN('as', 3), NAN('as', 4),
  NAN('ex', 1), NAN('ex', 2), NAN('ex', 3), NAN('ex', 4), NAN('ex', 5),
  NAN('br', 1), NAN('br', 2), NAN('br', 3), NAN('br', 4),
  NAN('lv', 1), NAN('lv', 2), NAN('lv', 3), NAN('lv', 4),
];

export const HOUSE_SECTIONS = {
  'interior-general': {
    label: 'Interior / General',
    scopeKey: 'house:interior-general',
    groups: ['ig:flooring', 'ig:paint', 'ig:doors', 'ig:pest'],
    standalone: ['ig-19', 'ig-20', 'ig-21', 'ig-25', 'ig-26', 'ig-27', 'ig-28'],
  },
  systems: {
    label: 'Systems & Structure',
    scopeKey: 'house:systems',
    groups: ['as:hvac', 'as:electrical', 'as:structural', 'as:insulation'],
    standalone: ['as-16', 'as-17'],
  },
  exterior: {
    label: 'Exterior',
    scopeKey: 'house:exterior',
    groups: ['ex:fence', 'ex:siding', 'ex:windows', 'ex:garage', 'ex:trees'],
    standalone: ['ex-04', 'ex-06', 'ex-07', 'ex-08', 'ex-18', 'ex-19', 'ex-20'],
  },
};

export const ROOM_TYPE_GROUPS = {
  kitchen: ['kt:cabinets', 'kt:counters', 'kt:appliances'],
  bathroom: ['ba:vanity', 'ba:tub', 'ba:tile'],
  bedroom: ['br:flooring', 'br:paint', 'br:doors', 'br:closet'],
  living: ['lv:flooring', 'lv:paint', 'lv:doors', 'lv:lighting'],
};

export const ROOM_TYPES = [
  { type: 'kitchen', label: 'Kitchen' },
  { type: 'bathroom', label: 'Bathroom' },
  { type: 'bedroom', label: 'Bedroom' },
  { type: 'living', label: 'Living / Common' },
];

let _items = new Map();

export async function loadCatalog() {
  const res = await fetch('./data/prices.json');
  const prices = await res.json();
  _items = new Map();
  for (const row of prices) {
    _items.set(row.id, { ...row, ...(META[row.id] || {}) });
  }
  for (const nan of NAN_ITEMS) _items.set(nan.id, { ...nan });
}

export function getItem(id) {
  return _items.get(id) || null;
}

export function getGroupDef(groupId) {
  return GROUP_DEFS[groupId] || null;
}

export function getGroupsForRoomType(roomType) {
  return (ROOM_TYPE_GROUPS[roomType] || []).map(gid => ({
    id: gid,
    ...GROUP_DEFS[gid],
  }));
}

export function getHouseSection(sectionId) {
  return HOUSE_SECTIONS[sectionId] || null;
}

/** Build ordered navigation views for a project */
export function buildNavViews(project) {
  const views = [];
  for (const [id, sec] of Object.entries(HOUSE_SECTIONS)) {
    views.push({ kind: 'house', id, label: sec.label, scopeKey: sec.scopeKey });
  }
  for (const room of project.rooms || []) {
    views.push({
      kind: 'room',
      id: room.id,
      label: room.name,
      scopeKey: `room:${room.id}`,
      roomType: room.type,
    });
  }
  views.push({ kind: 'photos', id: 'photos', label: 'Photos', scopeKey: null });
  return views;
}

export function selectionKey(scopeKey, itemId) {
  return `${scopeKey}:${itemId}`;
}

export function parseSelectionKey(key) {
  const idx = key.lastIndexOf(':');
  const scopeKey = key.slice(0, idx);
  const itemId = key.slice(idx + 1);
  return { scopeKey, itemId };
}

export function groupLabelForScope(scopeKey, groupId, project) {
  const def = GROUP_DEFS[groupId];
  if (!def) return groupId;
  if (scopeKey.startsWith('room:')) {
    const roomId = scopeKey.slice(5);
    const room = project.rooms?.find(r => r.id === roomId);
    if (room) return `${room.name}: ${def.label}`;
  }
  return def.label;
}

export function defaultRooms() {
  return [
    { id: 'k1', type: 'kitchen', name: 'Kitchen 1' },
    { id: 'b1', type: 'bathroom', name: 'Bathroom 1' },
    { id: 'b2', type: 'bathroom', name: 'Bathroom 2' },
  ];
}
