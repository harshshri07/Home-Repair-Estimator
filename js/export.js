import { getCurrentProject } from './store.js';
import { getExportSections, calcGrandTotal, effectiveCost, fmtMoney } from './calc.js';
import { getItem } from './catalog.js';

export async function exportProject() {
  if (typeof XLSX === 'undefined') {
    alert('Export library not loaded. Check your connection or try again offline after first load.');
    return;
  }

  const project = getCurrentProject();
  if (!project) return;

  const wb = XLSX.utils.book_new();
  const ws = {};
  let row = 0;
  const merges = [];
  const colWidths = [40, 14, 12, 10, 14];

  const style = (font, fill, align, border) => ({
    font: { name: 'Calibri', ...font },
    fill: fill ? { patternType: 'solid', fgColor: { rgb: fill } } : undefined,
    alignment: { wrapText: false, ...align },
    border: border || undefined,
  });

  const cell = (r, c, v, st, fmt) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = { v, t: typeof v === 'number' ? 'n' : 's', s: st };
    if (fmt) ws[addr].z = fmt;
  };

  const merge = (r, c1, c2) => merges.push({ s: { r, c: c1 }, e: { r, c: c2 } });
  const thin = (col) => ({
    top: { style: 'thin', color: { rgb: col } },
    bottom: { style: 'thin', color: { rgb: col } },
    left: { style: 'thin', color: { rgb: col } },
    right: { style: 'thin', color: { rgb: col } },
  });

  cell(row, 0, 'SPARK GROUP — REPAIR ESTIMATE',
    style({ bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, '111827', { horizontal: 'center', vertical: 'center' }));
  merge(row, 0, 4);
  row++;

  cell(row, 0,
    `Property: ${project.name}     Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    style({ sz: 10, color: { rgb: '6B7280' } }, 'F9FAFB', { horizontal: 'center' }));
  merge(row, 0, 4);
  row++;
  row++;

  const sections = getExportSections(project);

  for (const sec of sections) {
    cell(row, 0, sec.label.toUpperCase(),
      style({ bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, 'D35400', { vertical: 'center' }));
    for (let c = 1; c < 5; c++) cell(row, c, '', style({}, 'D35400'));
    merge(row, 0, 4);
    row++;

    ['Repair Item', 'Unit', 'Unit Cost', 'Qty', 'Estimate'].forEach((h, c) =>
      cell(row, c, h,
        style({ bold: true, sz: 10, color: { rgb: '374151' } }, 'FFF7ED',
          { horizontal: c >= 2 ? 'right' : 'left' }, thin('FDBA74'))));
    row++;

    for (const r of sec.rows) {
      const rs = style({ sz: 10, color: { rgb: '374151' } }, 'FFFFFF', {}, thin('F3F4F6'));
      const yearStr = r.item.hasYear && r.sel.year ? ` (${r.sel.year})` : '';
      cell(row, 0, r.item.name + yearStr, rs);
      cell(row, 1, r.item.unit, rs);
      cell(row, 2, r.cost, style({ sz: 10 }, 'FFFFFF', { horizontal: 'right' }, thin('F3F4F6')), '"$"#,##0.00');
      cell(row, 3, parseFloat(r.sel.qty) || 0, style({ sz: 10 }, 'FFFFFF', { horizontal: 'right' }, thin('F3F4F6')));
      cell(row, 4, r.total, style({ sz: 10 }, 'FFFFFF', { horizontal: 'right' }, thin('F3F4F6')), '"$"#,##0');
      row++;
    }

    const totSt = style({ bold: true, sz: 10, color: { rgb: 'C2410C' } }, 'FFF7ED', {}, thin('FDBA74'));
    cell(row, 0, `${sec.label} Total`, totSt);
    merge(row, 0, 3);
    for (let c = 1; c < 4; c++) cell(row, c, '', totSt);
    cell(row, 4, sec.total, style({ bold: true, sz: 10, color: { rgb: 'C2410C' } }, 'FFF7ED', { horizontal: 'right' }, thin('FDBA74')), '"$"#,##0');
    row += 2;
  }

  const grand = calcGrandTotal(project);
  cell(row, 0, 'TOTAL ESTIMATE',
    style({ bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, '111827', { horizontal: 'center', vertical: 'center' }));
  merge(row, 0, 3);
  for (let c = 1; c < 4; c++) cell(row, c, '', style({}, '111827'));
  cell(row, 4, grand,
    style({ bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, '111827', { horizontal: 'right', vertical: 'center' }), '"$"#,##0');

  if (project.arv || project.offerPrice) {
    row += 2;
    cell(row, 0, 'DEAL SUMMARY', style({ bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, '374151', { vertical: 'center' }));
    merge(row, 0, 4);
    row++;
    const dealRows = [
      ['ARV', parseFloat(project.arv) || 0],
      ['Offer Price', parseFloat(project.offerPrice) || 0],
      ['Repair Total', grand],
      ['Est. Profit', (parseFloat(project.arv) || 0) - (parseFloat(project.offerPrice) || 0) - grand],
    ];
    for (const [label, val] of dealRows) {
      cell(row, 0, label, style({ sz: 10 }, 'FFFFFF', {}, thin('F3F4F6')));
      cell(row, 4, val, style({ sz: 10 }, 'FFFFFF', { horizontal: 'right' }, thin('F3F4F6')), '"$"#,##0');
      row++;
    }
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 4 } });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
  ws['!merges'] = merges;

  XLSX.utils.book_append_sheet(wb, ws, 'Estimate');
  const safeName = project.name.replace(/[^a-z0-9]/gi, '_');
  const date = new Date().toISOString().split('T')[0];
  const baseName = `Repair-Estimate-${safeName}-${date}`;

  const photos = project.photos || [];
  if (!photos.length) {
    XLSX.writeFile(wb, `${baseName}.xlsx`);
    return;
  }

  if (typeof JSZip === 'undefined') {
    XLSX.writeFile(wb, `${baseName}.xlsx`);
    alert('Photos saved in project but ZIP library unavailable — exported Excel only.');
    return;
  }

  const zip = new JSZip();
  zip.file(`${baseName}.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  const folder = zip.folder('photos');
  photos.forEach((ph, i) => {
    const ext = (ph.dataUrl.split(';')[0].split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const label = ph.caption || ph.itemId || 'photo';
    folder.file(`${label.replace(/[^a-z0-9]/gi, '_')}_${i + 1}.${ext}`, ph.dataUrl.split(',')[1], { base64: true });
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${baseName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
