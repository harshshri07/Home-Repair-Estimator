import { calcGrandTotal, fmtMoney } from './calc.js';
import { getCurrentProject, updateProject } from './store.js';

export function calcDealMetrics(project) {
  const repairs = calcGrandTotal(project);
  const arv = parseFloat(project.arv) || 0;
  const offer = parseFloat(project.offerPrice) || 0;
  const holdingPerMonth = parseFloat(project.holdingCostPerMonth) || 0;
  const holdMonths = parseFloat(project.holdMonths) || 0;
  const holding = holdingPerMonth * holdMonths;
  const allIn = offer + repairs + holding;
  const profit = arv - allIn;
  const margin = arv > 0 ? (profit / arv) * 100 : 0;

  let status = 'neutral';
  if (arv > 0 && offer > 0) {
    if (margin >= 15) status = 'good';
    else if (margin >= 8) status = 'warn';
    else status = 'bad';
  }

  return { repairs, arv, offer, holding, allIn, profit, margin, status };
}

export function renderDealPanel() {
  const p = getCurrentProject();
  if (!p) return '';
  const m = calcDealMetrics(p);

  const statusLabel = { good: 'Strong deal', warn: 'Marginal', bad: 'Below target', neutral: 'Enter ARV & offer' };
  const statusClass = { good: 'deal-good', warn: 'deal-warn', bad: 'deal-bad', neutral: 'deal-neutral' };

  return `
    <div class="deal-metrics ${statusClass[m.status]}">
      <span class="deal-status-pill">${statusLabel[m.status]}</span>
      <div class="deal-row"><span>Repair estimate</span><strong>${fmtMoney(m.repairs)}</strong></div>
      <div class="deal-row"><span>All-in cost</span><strong>${fmtMoney(m.allIn)}</strong></div>
      <div class="deal-row deal-highlight"><span>Gross profit</span><strong>${fmtMoney(m.profit)}</strong></div>
      <div class="deal-row"><span>Margin</span><strong>${m.arv > 0 ? m.margin.toFixed(1) + '%' : '—'}</strong></div>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>ARV (After Repair Value)</span>
        <input type="number" data-deal-field="arv" inputmode="decimal" placeholder="250000" value="${p.arv || ''}" />
      </label>
      <label class="field">
        <span>Offer / Purchase Price</span>
        <input type="number" data-deal-field="offerPrice" inputmode="decimal" placeholder="180000" value="${p.offerPrice || ''}" />
      </label>
      <label class="field">
        <span>Holding Cost / Month</span>
        <input type="number" data-deal-field="holdingCostPerMonth" inputmode="decimal" placeholder="1500" value="${p.holdingCostPerMonth || ''}" />
      </label>
      <label class="field">
        <span>Est. Hold (months)</span>
        <input type="number" data-deal-field="holdMonths" inputmode="numeric" placeholder="3" value="${p.holdMonths || '3'}" />
      </label>
    </div>
    <p class="deal-hint">Margin targets: green ≥15%, yellow 8–15%, red &lt;8%. Holding includes financing, taxes, utilities.</p>
  `;
}

export function bindDealInputs(container, onUpdate) {
  container.querySelectorAll('[data-deal-field]').forEach(el => {
    el.addEventListener('input', () => {
      const field = el.dataset.dealField;
      updateProject({ [field]: el.value });
      const metrics = container.querySelector('.deal-metrics');
      if (metrics) {
        const html = renderDealPanel();
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        metrics.replaceWith(tmp.querySelector('.deal-metrics'));
      }
      onUpdate?.();
    });
  });
}
