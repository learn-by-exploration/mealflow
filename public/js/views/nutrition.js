// ─── MealFlow: Nutrition Dashboard View ───
import { esc, today, dateOffset, fmtNutrition } from '../utils.js';
import { api } from '../api.js';

// ─── Module state ───
let _c = null;
let selectedDate = today();
let summary = null;
let persons = [];
let personNutrition = {}; // personId → { totals, targets }
let loadingDate = false;
let loadingPersons = false;

// ─── Helpers ───
function progressBar(value, target, color = 'var(--accent)') {
  const pct = target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;
  const over = target > 0 && value > target;
  return `
    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${over ? 'var(--err,#ef4444)' : color};transition:width 0.4s;border-radius:4px"></div>
    </div>`;
}

function macroCard(label, value, target, unit, color) {
  const pct = target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;
  return `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius,6px);padding:0.875rem;flex:1;min-width:120px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:4px">${esc(label)}</div>
      <div style="font-size:1.5rem;font-weight:700;color:${color};line-height:1.2">${fmtNutrition(value)}${esc(unit)}</div>
      ${target > 0 ? `
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0"> / ${target}${esc(unit)} · ${pct}%</div>
        ${progressBar(value, target, color)}` : ''}
    </div>`;
}

function dateNav() {
  const d = new Date(selectedDate + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `
    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" id="nutrition-prev" aria-label="Previous day">
        <span class="material-icons-round">chevron_left</span>
      </button>
      <input type="date" id="nutrition-date" class="input" value="${esc(selectedDate)}"
        style="flex:1;min-width:140px;max-width:180px" aria-label="Select date">
      <span style="font-size:13px;color:var(--text-muted);flex:1">${esc(label)}</span>
      <button class="btn btn-outline btn-sm" id="nutrition-next" aria-label="Next day" ${selectedDate >= today() ? 'disabled' : ''}>
        <span class="material-icons-round">chevron_right</span>
      </button>
      <button class="btn btn-text btn-sm" id="nutrition-today">Today</button>
    </div>`;
}

// ─── Full render ───
function render() {
  if (!_c) return;
  const totals = summary?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = summary?.goals || { calories_target: 2000, protein_target: 50, carbs_target: 250, fat_target: 65 };
  const hasData = summary && (totals.calories > 0 || totals.protein > 0 || totals.carbs > 0 || totals.fat > 0);
  const byMeal = summary?.by_meal || {};

  _c.innerHTML = `
    <div class="view-header">
      <h2>Nutrition Tracker</h2>
    </div>

    <div style="margin-bottom:1.25rem">${dateNav()}</div>

    ${loadingDate
      ? '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading…</div>'
      : `
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.25rem">
      ${macroCard('Calories', Math.round(totals.calories || 0), goals.calories_target || 0, '', '#6366f1')}
      ${macroCard('Protein', Math.round(totals.protein || 0), goals.protein_target || 0, 'g', '#22c55e')}
      ${macroCard('Carbs', Math.round(totals.carbs || 0), goals.carbs_target || 0, 'g', '#f59e0b')}
      ${macroCard('Fat', Math.round(totals.fat || 0), goals.fat_target || 0, 'g', '#f97316')}
    </div>

    ${!hasData
      ? `<div style="padding:2rem;text-align:center;background:var(--bg-2);border-radius:var(--radius,6px)">
           <span class="material-icons-round" style="font-size:3rem;color:var(--text-muted)">monitoring</span>
           <p>No nutrition data logged for this day.</p>
           <p style="font-size:12px;color:var(--text-muted)">Add meals with nutritional info to see your daily breakdown.</p>
         </div>`
      : `<div>
           <h3 style="font-size:0.9rem;font-weight:600;margin:0 0 0.75rem">By Meal</h3>
           <div style="display:flex;flex-direction:column;gap:0.5rem">
             ${Object.entries(byMeal).map(([mealType, data]) => `
               <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius,6px);padding:0.75rem">
                 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
                   <span style="font-weight:600;font-size:14px;text-transform:capitalize">${esc(mealType.replace('_', ' '))}</span>
                   <span style="font-size:13px;color:var(--text-muted)">${Math.round(data.calories || 0)} cal</span>
                 </div>
                 <div style="font-size:12px;color:var(--text-muted)">
                   ${Math.round(data.protein || 0)}g P · ${Math.round(data.carbs || 0)}g C · ${Math.round(data.fat || 0)}g F
                 </div>
               </div>
             `).join('')}
           </div>
         </div>`}

    ${persons.length > 0 ? `
      <div style="margin-top:1.5rem">
        <h3 style="font-size:0.9rem;font-weight:600;margin:0 0 0.75rem">Per Household Member</h3>
        ${loadingPersons
          ? '<p style="color:var(--text-muted)">Loading…</p>'
          : `<div style="display:flex;flex-direction:column;gap:0.5rem">
               ${persons.map(p => {
                 const pn = personNutrition[p.id];
                 if (!pn) return '';
                 const pt = pn.totals || {};
                 const ptargets = pn.targets || {};
                 return `
                   <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius,6px);padding:0.75rem">
                     <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
                       <span style="font-size:20px">${esc(p.avatar_emoji || '👤')}</span>
                       <span style="font-weight:600">${esc(p.name)}</span>
                       <span style="font-size:12px;color:var(--text-muted)">${esc(p.dietary_type || '')}</span>
                     </div>
                     <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.5rem">
                       <div>
                         <div style="font-size:11px;color:var(--text-muted)">Calories</div>
                         <div style="font-weight:600">${Math.round(pt.calories || 0)}</div>
                         ${ptargets.calories ? progressBar(pt.calories || 0, ptargets.calories, '#6366f1') : ''}
                       </div>
                       <div>
                         <div style="font-size:11px;color:var(--text-muted)">Protein</div>
                         <div style="font-weight:600">${Math.round(pt.protein || 0)}g</div>
                         ${ptargets.protein ? progressBar(pt.protein || 0, ptargets.protein, '#22c55e') : ''}
                       </div>
                       <div>
                         <div style="font-size:11px;color:var(--text-muted)">Carbs</div>
                         <div style="font-weight:600">${Math.round(pt.carbs || 0)}g</div>
                         ${ptargets.carbs ? progressBar(pt.carbs || 0, ptargets.carbs, '#f59e0b') : ''}
                       </div>
                       <div>
                         <div style="font-size:11px;color:var(--text-muted)">Fat</div>
                         <div style="font-weight:600">${Math.round(pt.fat || 0)}g</div>
                         ${ptargets.fat ? progressBar(pt.fat || 0, ptargets.fat, '#f97316') : ''}
                       </div>
                     </div>
                   </div>`;
               }).join('')}
             </div>`}
      </div>` : ''}
    `}`;

  wireEvents();
}

// ─── Wire events ───
function wireEvents() {
  _c.querySelector('#nutrition-prev')?.addEventListener('click', async () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    selectedDate = d.toISOString().split('T')[0];
    await loadDate();
    render();
  });

  _c.querySelector('#nutrition-next')?.addEventListener('click', async () => {
    if (selectedDate >= today()) return;
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    selectedDate = d.toISOString().split('T')[0];
    await loadDate();
    render();
  });

  _c.querySelector('#nutrition-today')?.addEventListener('click', async () => {
    selectedDate = today();
    await loadDate();
    render();
  });

  _c.querySelector('#nutrition-date')?.addEventListener('change', async (e) => {
    selectedDate = e.target.value || today();
    await loadDate();
    render();
  });
}

async function loadDate() {
  loadingDate = true;
  render();
  try {
    summary = await api.get(`/api/nutrition/summary/${selectedDate}`);
    await loadPersonNutrition();
  } catch { summary = null; showToast('Failed to load nutrition data'); }
  loadingDate = false;
}

async function loadPersonNutrition() {
  if (!persons.length) return;
  loadingPersons = true;
  personNutrition = {};
  try {
    const results = await Promise.all(
      persons.map(p =>
        api.get(`/api/nutrition/person/${p.id}/daily/${selectedDate}`).catch(() => null)
      )
    );
    for (let i = 0; i < persons.length; i++) {
      if (results[i]) personNutrition[persons[i].id] = results[i];
    }
  } catch { /* ignore individual errors */ }
  loadingPersons = false;
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
  selectedDate = today();
  summary = null;
  persons = [];
  personNutrition = {};
  loadingDate = false;
  loadingPersons = false;
  _c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading nutrition…</div>';
  try {
    [summary, persons] = await Promise.all([
      api.get(`/api/nutrition/summary/${selectedDate}`),
      api.get('/api/persons').catch(() => []),
    ]);
    if (!Array.isArray(persons)) persons = [];
    await loadPersonNutrition();
  } catch { showToast('Failed to load nutrition data'); }
  render();
}
