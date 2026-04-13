// ─── MealFlow: Shopping View ───
import { esc, today } from '../utils.js';
import { api } from '../api.js';

// ─── Module state ───
let _c = null;
let lists = [];
let activeList = null;  // currently expanded shopping list
let generating = false;
let creating = false;
let newListName = '';

// ─── Helpers ───
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtISO(d) { return d.toISOString().split('T')[0]; }

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

// ─── Active list detail HTML ───
function listDetailHTML() {
  if (!activeList) return '';
  const items = activeList.items || [];
  const groups = groupByCategory(items);
  const categories = Object.keys(groups).sort();
  const checked = items.filter(i => i.checked).length;
  const allDone = items.length > 0 && checked === items.length;

  return `
    <div class="modal-overlay active" id="shopping-detail-modal" role="dialog" aria-modal="true" aria-label="${esc(activeList.name)}">
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <h2 class="modal-title">🛒 ${esc(activeList.name)}</h2>
          <button class="modal-close" id="detail-close" aria-label="Close">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        ${items.length === 0
          ? '<p style="color:var(--text-muted);padding:1rem 0">This list has no items.</p>'
          : `
          <div style="margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;color:var(--text-muted)">${checked}/${items.length} checked</span>
            ${allDone ? '<span style="color:var(--success);font-size:13px">✓ All done!</span>' : ''}
          </div>
          ${categories.map(cat => `
            <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin:0.75rem 0 0.4rem">${esc(cat)}</h4>
            <div>
              ${groups[cat].map(item => `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--border)">
                  <input type="checkbox" class="shopping-item-check" data-item-id="${item.id}"
                    ${item.checked ? 'checked' : ''} aria-label="${esc(item.name)}">
                  <span style="${item.checked ? 'text-decoration:line-through;opacity:0.5' : ''};flex:1;font-size:14px">${esc(item.name)}</span>
                  <span style="font-size:12px;color:var(--text-muted)">${item.quantity ? item.quantity + ' ' + esc(item.unit || '') : ''}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}`}
        <div class="modal-actions" style="margin-top:1rem">
          <button class="btn btn-secondary" id="detail-delete-list">🗑 Delete list</button>
          <button class="btn btn-primary" id="detail-close-btn">Close</button>
        </div>
      </div>
    </div>`;
}

// ─── Full render ───
function render() {
  if (!_c) return;

  _c.innerHTML = `
    <div class="view-header">
      <h2>Shopping Lists</h2>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-outline" id="generate-btn" ${generating ? 'disabled' : ''}>
          ${generating ? '⏳ Generating…' : '🗓 From this week'}
        </button>
        <button class="btn btn-primary" id="create-list-btn">+ New List</button>
      </div>
    </div>

    ${creating ? `
      <div style="background:var(--bg-2);border-radius:var(--radius,6px);padding:1rem;margin-bottom:1rem">
        <div style="display:flex;gap:0.5rem;align-items:center">
          <input type="text" id="new-list-name" class="input" placeholder="Shopping list name…"
            value="${esc(newListName)}" style="flex:1" autocomplete="off" aria-label="New list name">
          <button class="btn btn-primary" id="create-list-confirm">Create</button>
          <button class="btn btn-secondary" id="create-list-cancel">Cancel</button>
        </div>
      </div>` : ''}

    ${lists.length === 0
      ? `<div class="empty-state" style="padding:3rem;text-align:center">
           <span class="material-icons-round" style="font-size:3rem;color:var(--text-muted)">shopping_cart</span>
           <p>No shopping lists yet.</p>
           <p style="font-size:13px;color:var(--text-muted)">Click <strong>From this week</strong> to auto-generate from your meal plan, or <strong>+ New List</strong> to create one manually.</p>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:0.75rem">
           ${lists.map(l => {
             const pct = l.total_items > 0 ? Math.round((l.checked_items / l.total_items) * 100) : 0;
             const allDone = l.total_items > 0 && l.checked_items === l.total_items;
             return `
               <div class="shopping-list-card" data-list-id="${l.id}"
                 style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius,6px);padding:0.875rem;cursor:pointer;display:flex;align-items:center;gap:1rem">
                 <div style="flex:1;min-width:0">
                   <div style="font-weight:600;font-size:1rem${allDone ? ';color:var(--success,#22c55e)' : ''}">${esc(l.name)}</div>
                   <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
                     ${l.total_items} items · ${l.checked_items} checked
                     ${l.date_from ? ` · ${esc(l.date_from)}` : ''}
                   </div>
                   ${l.total_items > 0 ? `
                     <div style="height:4px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden">
                       <div style="height:100%;width:${pct}%;background:${allDone ? 'var(--success,#22c55e)' : 'var(--accent)'};transition:width 0.3s"></div>
                     </div>` : ''}
                 </div>
                 <span class="material-icons-round" style="color:var(--text-muted);flex-shrink:0">chevron_right</span>
               </div>`;
           }).join('')}
         </div>`}

    ${activeList ? listDetailHTML() : ''}`;

  wireEvents();
}

// ─── Wire events ───
function wireEvents() {
  // Generate this week's shopping list
  _c.querySelector('#generate-btn')?.addEventListener('click', async () => {
    generating = true;
    render();
    try {
      const monday = getMonday(new Date());
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const from = fmtISO(monday);
      const to = fmtISO(sunday);
      const name = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      const result = await api.post('/api/shopping/generate', { date_from: from, date_to: to, name });
      showToast('Shopping list generated!', 'success');
      await loadLists();
      // Auto-open the generated list
      if (result && result.id) {
        activeList = await api.get(`/api/shopping/${result.id}`);
      }
    } catch (e) {
      showToast('Failed to generate list. Make sure meals are planned for this week.');
    }
    generating = false;
    render();
  });

  // Create new list button
  _c.querySelector('#create-list-btn')?.addEventListener('click', () => {
    creating = true; newListName = ''; render();
    setTimeout(() => _c.querySelector('#new-list-name')?.focus(), 50);
  });

  // Confirm new list
  _c.querySelector('#create-list-confirm')?.addEventListener('click', async () => {
    const name = (_c.querySelector('#new-list-name')?.value || '').trim();
    if (!name) { showToast('Please enter a list name'); return; }
    try {
      await api.post('/api/shopping', { name });
      showToast('List created', 'success');
      creating = false; newListName = '';
      await loadLists();
      render();
    } catch { showToast('Failed to create list'); }
  });

  _c.querySelector('#new-list-name')?.addEventListener('input', e => { newListName = e.target.value; });
  _c.querySelector('#new-list-name')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') _c.querySelector('#create-list-confirm')?.click();
    if (e.key === 'Escape') { creating = false; render(); }
  });
  _c.querySelector('#create-list-cancel')?.addEventListener('click', () => { creating = false; render(); });

  // Open list detail
  _c.querySelectorAll('.shopping-list-card').forEach(card => {
    card.addEventListener('click', async () => {
      try {
        activeList = await api.get(`/api/shopping/${card.dataset.listId}`);
        render();
      } catch { showToast('Failed to load list'); }
    });
  });

  // Detail modal close
  _c.querySelector('#detail-close')?.addEventListener('click', () => { activeList = null; render(); });
  _c.querySelector('#detail-close-btn')?.addEventListener('click', () => { activeList = null; render(); });
  _c.querySelector('#shopping-detail-modal')?.addEventListener('click', e => {
    if (e.target.id === 'shopping-detail-modal') { activeList = null; render(); }
  });

  // Toggle check-off items
  _c.querySelectorAll('.shopping-item-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      try {
        await api.patch(`/api/shopping/${activeList.id}/items/${cb.dataset.itemId}/toggle`, {});
        activeList = await api.get(`/api/shopping/${activeList.id}`);
        render();
      } catch { showToast('Failed to update item'); }
    });
  });

  // Delete list
  _c.querySelector('#detail-delete-list')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${activeList.name}"?`)) return;
    try {
      await api.del(`/api/shopping/${activeList.id}`);
      showToast('List deleted', 'success');
      activeList = null;
      await loadLists();
      render();
    } catch { showToast('Failed to delete list'); }
  });
}

async function loadLists() {
  const res = await api.get('/api/shopping');
  lists = Array.isArray(res) ? res : [];
}

function showToast(msg, type = 'error') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  t.setAttribute('role', 'alert');
  const container = document.getElementById('toasts') || document.body;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── Entry point ───
export async function mount(el) {
  _c = el;
  lists = []; activeList = null; generating = false; creating = false; newListName = '';
  _c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading shopping lists…</div>';
  try { await loadLists(); } catch { showToast('Failed to load shopping lists'); }
  render();
}
