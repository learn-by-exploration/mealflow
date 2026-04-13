// ─── MealFlow: Household Members (People) View ───
import { esc } from '../utils.js';
import { api } from '../api.js';

// ─── Module state ───
let _c = null;
let persons = [];
let modal = false;
let editing = null;
let saving = false;

// ─── Modal HTML ───
function modalHTML() {
  if (!modal) return '';
  const p = editing;
  return `
    <div class="modal-overlay active" id="person-modal" role="dialog" aria-modal="true" aria-label="${esc(p ? 'Edit Member' : 'Add Member')}">
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h2 class="modal-title">${p ? 'Edit Member' : 'Add Member'}</h2>
          <button class="modal-close" id="person-modal-close" aria-label="Close modal">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <form id="person-form" novalidate>
          <div style="display:grid;grid-template-columns:1fr 80px;gap:0.5rem;margin-bottom:0.25rem">
            <div class="form-group">
              <label for="pf-name">Name <span style="color:var(--err,#ef4444)">*</span></label>
              <input type="text" id="pf-name" class="input" value="${esc(p?.name || '')}" placeholder="e.g. Priya" required autocomplete="off">
            </div>
            <div class="form-group">
              <label for="pf-emoji">Emoji</label>
              <input type="text" id="pf-emoji" class="input" value="${esc(p?.avatar_emoji || '')}" placeholder="👤" style="text-align:center;font-size:1.5rem" maxlength="4">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <div class="form-group">
              <label for="pf-dietary">Dietary type</label>
              <select id="pf-dietary" class="input">
                <option value="veg" ${(p?.dietary_type || 'veg') === 'veg' ? 'selected' : ''}>Vegetarian</option>
                <option value="non-veg" ${p?.dietary_type === 'non-veg' ? 'selected' : ''}>Non-vegetarian</option>
                <option value="vegan" ${p?.dietary_type === 'vegan' ? 'selected' : ''}>Vegan</option>
                <option value="jain" ${p?.dietary_type === 'jain' ? 'selected' : ''}>Jain</option>
              </select>
            </div>
            <div class="form-group">
              <label for="pf-age-group">Age group</label>
              <select id="pf-age-group" class="input">
                <option value="adult" ${(p?.age_group || 'adult') === 'adult' ? 'selected' : ''}>Adult</option>
                <option value="child" ${p?.age_group === 'child' ? 'selected' : ''}>Child</option>
                <option value="teen" ${p?.age_group === 'teen' ? 'selected' : ''}>Teen</option>
                <option value="senior" ${p?.age_group === 'senior' ? 'selected' : ''}>Senior</option>
              </select>
            </div>
          </div>

          <h3 style="font-size:0.85rem;font-weight:600;margin:0.75rem 0 0.5rem;color:var(--text-muted)">NUTRITION TARGETS (optional)</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <div class="form-group">
              <label for="pf-cal">Calories / day</label>
              <input type="number" id="pf-cal" class="input" value="${p?.calorie_target || ''}" placeholder="e.g. 2000" min="0" max="10000">
            </div>
            <div class="form-group">
              <label for="pf-protein">Protein (g/day)</label>
              <input type="number" id="pf-protein" class="input" value="${p?.protein_target || ''}" placeholder="e.g. 50" min="0" max="500">
            </div>
            <div class="form-group">
              <label for="pf-carbs">Carbs (g/day)</label>
              <input type="number" id="pf-carbs" class="input" value="${p?.carbs_target || ''}" placeholder="e.g. 250" min="0" max="1000">
            </div>
            <div class="form-group">
              <label for="pf-fat">Fat (g/day)</label>
              <input type="number" id="pf-fat" class="input" value="${p?.fat_target || ''}" placeholder="e.g. 65" min="0" max="500">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.25rem">
            <div class="form-group">
              <label for="pf-spice">Spice level (1–5): <strong id="spice-display">${p?.spice_level ?? 3}</strong></label>
              <input type="range" id="pf-spice" min="1" max="5" value="${p?.spice_level ?? 3}" class="input-range">
            </div>
            <div class="form-group">
              <label for="pf-sugar">Sugar preference (1–5): <strong id="sugar-display">${p?.sugar_level ?? 3}</strong></label>
              <input type="range" id="pf-sugar" min="1" max="5" value="${p?.sugar_level ?? 3}" class="input-range">
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="person-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
              ${saving ? 'Saving…' : (p ? 'Save Changes' : 'Add Member')}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

// ─── Full render ───
function render() {
  if (!_c) return;
  _c.innerHTML = `
    <div class="view-header">
      <h2>Household Members</h2>
      <button class="btn btn-primary" id="add-person-btn">+ Add Member</button>
    </div>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 1rem">
      Manage who eats together and set per-person nutrition targets for personalised tracking.
    </p>

    ${persons.length === 0
      ? `<div style="padding:3rem;text-align:center;background:var(--bg-2);border-radius:var(--radius,6px)">
           <span class="material-icons-round" style="font-size:3rem;color:var(--text-muted)">group</span>
           <p>No household members yet.</p>
           <button class="btn btn-primary" id="add-person-empty-btn">+ Add your first member</button>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:0.75rem">
           ${persons.map(p => {
             const hasCal = p.calorie_target > 0;
             const hasProtein = p.protein_target > 0;
             return `
               <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius,6px);padding:0.875rem;display:flex;align-items:center;gap:0.875rem">
                 <div style="font-size:2rem;flex-shrink:0">${esc(p.avatar_emoji || '👤')}</div>
                 <div style="flex:1;min-width:0">
                   <div style="font-weight:600;font-size:1rem">${esc(p.name)}</div>
                   <div style="font-size:12px;color:var(--text-muted);margin-top:2px;display:flex;gap:0.75rem;flex-wrap:wrap">
                     ${p.dietary_type ? `<span style="text-transform:capitalize">${esc(p.dietary_type)}</span>` : ''}
                     ${p.age_group ? `<span style="text-transform:capitalize">${esc(p.age_group)}</span>` : ''}
                     ${hasCal ? `<span>🔥 ${p.calorie_target} cal</span>` : ''}
                     ${hasProtein ? `<span>💪 ${p.protein_target}g protein</span>` : ''}
                     ${p.carbs_target > 0 ? `<span>${p.carbs_target}g carbs</span>` : ''}
                     ${p.fat_target > 0 ? `<span>${p.fat_target}g fat</span>` : ''}
                   </div>
                   ${p.spice_level ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Spice: ${'🌶'.repeat(Math.min(p.spice_level, 5))}</div>` : ''}
                 </div>
                 <div style="display:flex;gap:0.5rem;flex-shrink:0">
                   <button class="btn btn-outline btn-sm person-edit-btn" data-person-id="${p.id}" aria-label="Edit ${esc(p.name)}">
                     <span class="material-icons-round" style="font-size:16px">edit</span>
                   </button>
                   <button class="btn btn-outline btn-sm person-delete-btn" data-person-id="${p.id}" data-person-name="${esc(p.name)}" aria-label="Delete ${esc(p.name)}">
                     <span class="material-icons-round" style="font-size:16px">delete_outline</span>
                   </button>
                 </div>
               </div>`;
           }).join('')}
         </div>`}

    ${modal ? modalHTML() : ''}`;

  wireEvents();
}

// ─── Wire events ───
function wireEvents() {
  _c.querySelector('#add-person-btn')?.addEventListener('click', () => {
    editing = null; modal = true; render();
  });
  _c.querySelector('#add-person-empty-btn')?.addEventListener('click', () => {
    editing = null; modal = true; render();
  });

  // Edit buttons
  _c.querySelectorAll('.person-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = persons.find(x => x.id === parseInt(btn.dataset.personId));
      if (p) { editing = p; modal = true; render(); }
    });
  });

  // Delete buttons
  _c.querySelectorAll('.person-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove "${btn.dataset.personName}" from your household?`)) return;
      try {
        await api.del(`/api/persons/${btn.dataset.personId}`);
        showToast(`${btn.dataset.personName} removed`, 'success');
        await loadPersons();
        render();
      } catch { showToast('Failed to delete member'); }
    });
  });

  // Modal close/cancel
  _c.querySelector('#person-modal-close')?.addEventListener('click', () => { modal = false; editing = null; render(); });
  _c.querySelector('#person-modal-cancel')?.addEventListener('click', () => { modal = false; editing = null; render(); });
  _c.querySelector('#person-modal')?.addEventListener('click', e => {
    if (e.target.id === 'person-modal') { modal = false; editing = null; render(); }
  });
  _c.querySelector('#person-modal')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { modal = false; editing = null; render(); }
  });

  // Live slider labels
  _c.querySelector('#pf-spice')?.addEventListener('input', e => {
    const el = _c.querySelector('#spice-display');
    if (el) el.textContent = e.target.value;
  });
  _c.querySelector('#pf-sugar')?.addEventListener('input', e => {
    const el = _c.querySelector('#sugar-display');
    if (el) el.textContent = e.target.value;
  });

  // Form submit
  _c.querySelector('#person-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (_c.querySelector('#pf-name')?.value || '').trim();
    if (!name) { showToast('Name is required'); _c.querySelector('#pf-name')?.focus(); return; }
    saving = true; render();
    try {
      const data = {
        name,
        avatar_emoji: (_c.querySelector('#pf-emoji')?.value || '').trim() || '👤',
        dietary_type: _c.querySelector('#pf-dietary')?.value || 'veg',
        age_group: _c.querySelector('#pf-age-group')?.value || 'adult',
        calorie_target: parseInt(_c.querySelector('#pf-cal')?.value) || null,
        protein_target: parseInt(_c.querySelector('#pf-protein')?.value) || null,
        carbs_target: parseInt(_c.querySelector('#pf-carbs')?.value) || null,
        fat_target: parseInt(_c.querySelector('#pf-fat')?.value) || null,
        spice_level: parseInt(_c.querySelector('#pf-spice')?.value) || 3,
        sugar_level: parseInt(_c.querySelector('#pf-sugar')?.value) || 3,
      };
      if (editing?.id) {
        await api.put(`/api/persons/${editing.id}`, data);
        showToast('Member updated', 'success');
      } else {
        await api.post('/api/persons', data);
        showToast('Member added', 'success');
      }
      modal = false; editing = null;
      await loadPersons();
    } catch { showToast('Failed to save member'); }
    finally { saving = false; render(); }
  });
}

async function loadPersons() {
  const res = await api.get('/api/persons');
  persons = Array.isArray(res) ? res : [];
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
  persons = []; modal = false; editing = null; saving = false;
  _c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading members…</div>';
  try { await loadPersons(); } catch { showToast('Failed to load household members'); }
  render();
}
