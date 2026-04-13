// ─── MealFlow: Meal Planner View ───
import { esc, today, capitalize } from '../utils.js';
import { api } from '../api.js';

// ─── Module state ───
let _c = null;
let weekStart = null;
let mealsLookup = {}; // date → mealType → { id, items[] }
let modal = false;
let modalDate = '';
let modalSlot = '';
let modalRecipes = [];
let modalLoading = false;
let modalSearch = '';

const SLOTS = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner', 'snack'];
const SLOT_LABELS = {
  breakfast: 'Breakfast', morning_snack: 'Morning Snack',
  lunch: 'Lunch', evening_snack: 'Evening Snack',
  dinner: 'Dinner', snack: 'Late Snack',
};
const SLOT_ICONS = {
  breakfast: '🌅', morning_snack: '🫖', lunch: '☀️',
  evening_snack: '🍵', dinner: '🌙', snack: '🌜',
};

// ─── Helpers ───
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtISO(d) { return d.toISOString().split('T')[0]; }

function getWeekDays() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// ─── Modal HTML ───
function modalHTML() {
  if (!modal) return '';
  const slotLabel = SLOT_LABELS[modalSlot] || capitalize(modalSlot);
  const dateLabel = new Date(modalDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
  return `
    <div class="modal-overlay active" id="planner-modal" role="dialog" aria-modal="true" aria-label="Add meal">
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h2 class="modal-title">Add to ${esc(slotLabel)} — ${esc(dateLabel)}</h2>
          <button class="modal-close" id="planner-modal-close" aria-label="Close modal">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <div class="form-group">
          <label for="planner-recipe-search">Search recipes</label>
          <input type="text" id="planner-recipe-search" class="input" placeholder="Type to filter…"
            value="${esc(modalSearch)}" autocomplete="off" aria-label="Search recipes">
        </div>
        <div id="planner-recipe-list" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius,6px);margin-bottom:0.5rem">
          ${modalLoading
            ? '<p style="padding:0.75rem;color:var(--text-muted)">Loading recipes…</p>'
            : modalRecipes.length
              ? modalRecipes.slice(0, 30).map(r => `
                  <button class="recipe-select-btn" data-recipe-id="${r.id}"
                    style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:0.6rem 0.75rem;background:none;border:none;border-bottom:1px solid var(--border);cursor:pointer;text-align:left">
                    <span>${esc(r.name)}</span>
                    <span style="font-size:11px;color:var(--text-muted)">${r.cuisine ? esc(r.cuisine) + ' · ' : ''}${r.servings || 1} srv</span>
                  </button>`).join('')
              : '<p style="padding:0.75rem;color:var(--text-muted)">No recipes found</p>'}
        </div>
        <div class="form-group">
          <label for="planner-custom-name">Or add custom item</label>
          <div style="display:flex;gap:0.5rem">
            <input type="text" id="planner-custom-name" class="input" placeholder="Custom dish name" style="flex:1">
            <button class="btn btn-outline" id="planner-add-custom">Add</button>
          </div>
        </div>
      </div>
    </div>`;
}

// ─── Main render ───
function render() {
  if (!_c) return;
  const toDate = new Date(weekStart);
  toDate.setDate(toDate.getDate() + 6);
  const days = getWeekDays();
  const todayStr = today();

  _c.innerHTML = `
    <div class="view-header">
      <h2>Meal Planner</h2>
      <div class="planner-nav" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" id="planner-prev" aria-label="Previous week">
          <span class="material-icons-round">chevron_left</span>
        </button>
        <span class="planner-week-label" style="font-size:13px;font-weight:500">
          ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —
          ${toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button class="btn btn-outline btn-sm" id="planner-next" aria-label="Next week">
          <span class="material-icons-round">chevron_right</span>
        </button>
        <button class="btn btn-text btn-sm" id="planner-today-btn">Today</button>
      </div>
    </div>

    <div class="planner-grid-wrapper" style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="planner-grid" role="grid" aria-label="Weekly meal planner"
        style="width:100%;border-collapse:collapse;min-width:640px">
        <thead>
          <tr>
            <th style="min-width:100px;padding:0.4rem 0.5rem;text-align:left;font-size:11px;color:var(--text-muted);border:1px solid var(--border);background:var(--bg-2)"></th>
            ${days.map(d => {
              const ds = fmtISO(d);
              const isToday = ds === todayStr;
              return `<th style="min-width:110px;padding:0.4rem 0.5rem;text-align:center;border:1px solid var(--border);background:var(--bg-2)${isToday ? ';background:rgba(99,102,241,0.08)' : ''}">
                <div style="font-size:11px;font-weight:500;color:var(--text-muted)">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div style="font-size:18px;font-weight:700;${isToday ? 'color:var(--accent)' : ''}">${d.getDate()}</div>
              </th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${SLOTS.map(slot => `
            <tr>
              <td style="padding:0.4rem 0.5rem;font-size:11px;color:var(--text-muted);white-space:nowrap;border:1px solid var(--border);background:var(--bg-2);vertical-align:middle">
                ${SLOT_ICONS[slot] || ''}&nbsp;${SLOT_LABELS[slot] || capitalize(slot)}
              </td>
              ${days.map(d => {
                const ds = fmtISO(d);
                const cellData = mealsLookup[ds]?.[slot];
                const items = cellData ? (cellData.items || []) : [];
                const isToday = ds === todayStr;
                return `<td class="planner-cell"
                  data-date="${ds}" data-slot="${slot}"
                  tabindex="0" role="gridcell"
                  style="padding:0.3rem;border:1px solid var(--border);min-height:48px;vertical-align:top;cursor:pointer;${isToday ? 'background:rgba(99,102,241,0.04)' : 'background:var(--bg)'}">
                  ${items.map(i => `
                    <div style="display:flex;align-items:center;gap:3px;background:var(--bg-2);border-radius:4px;padding:2px 6px;margin-bottom:2px;font-size:11px">
                      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.recipe_name || i.custom_name || '?')}</span>
                      <button class="planner-remove-btn"
                        data-meal-id="${cellData.id}" data-item-id="${i.id}"
                        style="background:none;border:none;cursor:pointer;padding:0;line-height:1;font-size:14px;color:var(--text-muted);flex-shrink:0"
                        aria-label="Remove ${esc(i.recipe_name || i.custom_name || 'item')}">×</button>
                    </div>
                  `).join('')}
                  <div style="text-align:center;color:var(--text-muted);font-size:16px;line-height:2" aria-hidden="true">+</div>
                </td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${modalHTML()}`;

  wireEvents();
}

// ─── Event wiring ───
function wireEvents() {
  _c.querySelector('#planner-prev')?.addEventListener('click', async () => {
    weekStart.setDate(weekStart.getDate() - 7);
    await loadWeek();
    render();
  });

  _c.querySelector('#planner-next')?.addEventListener('click', async () => {
    weekStart.setDate(weekStart.getDate() + 7);
    await loadWeek();
    render();
  });

  _c.querySelector('#planner-today-btn')?.addEventListener('click', async () => {
    weekStart = getMonday(new Date());
    await loadWeek();
    render();
  });

  // Click cell → add meal
  _c.querySelectorAll('.planner-cell').forEach(cell => {
    cell.addEventListener('click', async (e) => {
      if (e.target.closest('.planner-remove-btn')) return;
      await openModal(cell.dataset.date, cell.dataset.slot);
    });
    cell.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await openModal(cell.dataset.date, cell.dataset.slot);
      }
    });
  });

  // Remove item
  _c.querySelectorAll('.planner-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api.del(`/api/meals/${btn.dataset.mealId}/items/${btn.dataset.itemId}`);
        await loadWeek();
        render();
      } catch { showToast('Failed to remove item'); }
    });
  });

  // Modal close
  _c.querySelector('#planner-modal-close')?.addEventListener('click', closeModal);
  _c.querySelector('#planner-modal')?.addEventListener('click', e => {
    if (e.target.id === 'planner-modal') closeModal();
  });
  _c.querySelector('#planner-modal')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Recipe search
  let searchTimer;
  _c.querySelector('#planner-recipe-search')?.addEventListener('input', e => {
    const q = e.target.value.trim();
    modalSearch = q;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshModalRecipes(q), 250);
  });

  // Select recipe
  _c.querySelectorAll('.recipe-select-btn').forEach(btn => {
    btn.addEventListener('click', () => addMealItem({ recipe_id: parseInt(btn.dataset.recipeId) }));
  });

  // Add custom item
  _c.querySelector('#planner-add-custom')?.addEventListener('click', () => {
    const name = (_c.querySelector('#planner-custom-name')?.value || '').trim();
    if (name) addMealItem({ custom_name: name });
  });
  _c.querySelector('#planner-custom-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const name = e.target.value.trim();
      if (name) addMealItem({ custom_name: name });
    }
  });
}

async function openModal(date, slot) {
  modalDate = date;
  modalSlot = slot;
  modal = true;
  modalLoading = true;
  modalSearch = '';
  modalRecipes = [];
  render();
  try {
    const res = await api.get('/api/recipes?limit=50');
    modalRecipes = Array.isArray(res) ? res : [];
  } catch { modalRecipes = []; }
  modalLoading = false;
  render();
}

async function refreshModalRecipes(q) {
  modalLoading = true;
  render();
  try {
    const url = q
      ? `/api/recipes/search?q=${encodeURIComponent(q)}`
      : '/api/recipes?limit=50';
    const res = await api.get(url);
    modalRecipes = Array.isArray(res) ? res : [];
  } catch { modalRecipes = []; }
  modalLoading = false;
  render();
}

async function addMealItem(item) {
  try {
    let plan = mealsLookup[modalDate]?.[modalSlot];
    if (!plan?.id) {
      const created = await api.post('/api/meals', { date: modalDate, meal_type: modalSlot });
      plan = { id: created.id, items: [] };
    }
    await api.post(`/api/meals/${plan.id}/items`, { ...item, servings: 1 });
    closeModal();
    await loadWeek();
    render();
  } catch {
    showToast('Failed to add meal');
    closeModal();
  }
}

function closeModal() {
  modal = false;
  modalDate = '';
  modalSlot = '';
  modalRecipes = [];
  modalSearch = '';
  render();
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

// ─── Load week from API ───
async function loadWeek() {
  const from = fmtISO(weekStart);
  const toDate = new Date(weekStart);
  toDate.setDate(toDate.getDate() + 6);
  const to = fmtISO(toDate);
  const raw = await api.get(`/api/meals?from=${from}&to=${to}`);
  const arr = Array.isArray(raw) ? raw : [];
  mealsLookup = {};
  for (const m of arr) {
    if (!mealsLookup[m.date]) mealsLookup[m.date] = {};
    mealsLookup[m.date][m.meal_type] = { id: m.id, items: m.items || [] };
  }
}

// ─── Entry point ───
export async function mount(el) {
  _c = el;
  weekStart = getMonday(new Date());
  mealsLookup = {};
  modal = false;
  modalRecipes = [];
  modalLoading = false;
  modalSearch = '';
  _c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading planner…</div>';
  try { await loadWeek(); } catch { showToast('Failed to load meal plan'); }
  render();
}
