// ─── MealFlow: Recipes View ───
import { esc, fmtTime, capitalize } from '../utils.js';
import { api } from '../api.js';

// ─── Module state ───
let _c = null;
let recipes = [];
let search = '';
let filters = { cuisine: '', difficulty: '', dietary: '' };
let modal = false;
let editing = null; // recipe being edited
let saving = false;
let detailRecipe = null; // recipe detail view

// ─── Helpers ───
function recipeCardHTML(r) {
  return `
    <div class="recipe-card" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(r.name)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
        <h3 style="margin:0;font-size:1rem;font-weight:600">${esc(r.name)}</h3>
        ${r.is_favorite ? '<span title="Favourite">⭐</span>' : ''}
      </div>
      <p style="margin:0.3rem 0 0;font-size:12px;color:var(--text-muted)">
        ${r.cuisine ? `<span class="tag">${esc(r.cuisine)}</span> · ` : ''}
        ${r.prep_time || r.cook_time ? fmtTime((r.prep_time || 0) + (r.cook_time || 0)) + ' · ' : ''}
        ${r.servings || 1} servings
        ${r.difficulty ? ' · ' + esc(capitalize(r.difficulty)) : ''}
      </p>
      ${r.description ? `<p style="margin:0.4rem 0 0;font-size:12px;color:var(--text-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(r.description)}</p>` : ''}
      ${r.nutrition ? `<p style="margin:0.4rem 0 0;font-size:11px;color:var(--text-muted)">${Math.round(r.nutrition.calories || 0)} cal · ${Math.round(r.nutrition.protein || 0)}g P · ${Math.round(r.nutrition.carbs || 0)}g C · ${Math.round(r.nutrition.fat || 0)}g F</p>` : ''}
    </div>`;
}

// ─── Modal: add/edit recipe ───
function modalHTML() {
  if (!modal) return '';
  const r = editing;
  return `
    <div class="modal-overlay active" id="recipe-modal" role="dialog" aria-modal="true" aria-label="${esc(r ? 'Edit Recipe' : 'New Recipe')}">
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <h2 class="modal-title">${r ? 'Edit Recipe' : 'New Recipe'}</h2>
          <button class="modal-close" id="recipe-modal-close" aria-label="Close modal">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        <form id="recipe-form" novalidate>
          <div class="form-group">
            <label for="rf-name">Name <span style="color:var(--err,#ef4444)">*</span></label>
            <input type="text" id="rf-name" class="input" value="${esc(r?.name || '')}" required placeholder="Recipe name" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="rf-desc">Description</label>
            <textarea id="rf-desc" class="input" rows="2" placeholder="Brief description">${esc(r?.description || '')}</textarea>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem">
            <div class="form-group">
              <label for="rf-servings">Servings</label>
              <input type="number" id="rf-servings" class="input" value="${r?.servings ?? 1}" min="1">
            </div>
            <div class="form-group">
              <label for="rf-prep">Prep (min)</label>
              <input type="number" id="rf-prep" class="input" value="${r?.prep_time ?? 0}" min="0">
            </div>
            <div class="form-group">
              <label for="rf-cook">Cook (min)</label>
              <input type="number" id="rf-cook" class="input" value="${r?.cook_time ?? 0}" min="0">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <div class="form-group">
              <label for="rf-cuisine">Cuisine</label>
              <input type="text" id="rf-cuisine" class="input" value="${esc(r?.cuisine || '')}" placeholder="e.g. Indian">
            </div>
            <div class="form-group">
              <label for="rf-difficulty">Difficulty</label>
              <select id="rf-difficulty" class="input">
                <option value="easy" ${(r?.difficulty || 'easy') === 'easy' ? 'selected' : ''}>Easy</option>
                <option value="medium" ${r?.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="hard" ${r?.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="rf-notes">Notes</label>
            <textarea id="rf-notes" class="input" rows="2" placeholder="Cooking tips, variations…">${esc(r?.notes || '')}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="recipe-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" ${saving ? 'disabled' : ''}>
              ${saving ? 'Saving…' : (r ? 'Save Changes' : 'Create Recipe')}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

// ─── Detail modal ───
function detailHTML() {
  if (!detailRecipe) return '';
  const r = detailRecipe;
  return `
    <div class="modal-overlay active" id="recipe-detail-modal" role="dialog" aria-modal="true" aria-label="${esc(r.name)}">
      <div class="modal" style="max-width:540px">
        <div class="modal-header">
          <h2 class="modal-title">${esc(r.name)} ${r.is_favorite ? '⭐' : ''}</h2>
          <button class="modal-close" id="detail-modal-close" aria-label="Close modal">
            <span class="material-icons-round">close</span>
          </button>
        </div>
        ${r.description ? `<p style="margin:0 0 0.75rem;color:var(--text-muted)">${esc(r.description)}</p>` : ''}
        <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:13px;color:var(--text-muted);margin-bottom:0.75rem">
          ${r.prep_time ? `<span>🕐 Prep: ${fmtTime(r.prep_time)}</span>` : ''}
          ${r.cook_time ? `<span>🔥 Cook: ${fmtTime(r.cook_time)}</span>` : ''}
          <span>🍽️ ${r.servings || 1} servings</span>
          ${r.difficulty ? `<span>📊 ${esc(capitalize(r.difficulty))}</span>` : ''}
          ${r.cuisine ? `<span>🌍 ${esc(r.cuisine)}</span>` : ''}
        </div>
        ${r.ingredients?.length ? `
          <h3 style="font-size:0.9rem;margin:0.75rem 0 0.5rem">Ingredients</h3>
          <ul style="margin:0;padding-left:1.25rem">
            ${r.ingredients.map(i => `<li style="font-size:13px;margin-bottom:3px">${i.quantity || ''}${i.unit ? ' ' + esc(i.unit) : ''} ${esc(i.ingredient_name || '')}${i.notes ? ` <em>(${esc(i.notes)})</em>` : ''}</li>`).join('')}
          </ul>` : ''}
        ${r.nutrition ? `
          <h3 style="font-size:0.9rem;margin:0.75rem 0 0.5rem">Nutrition (per serving)</h3>
          <p style="font-size:13px;color:var(--text-muted)">${Math.round(r.nutrition.calories || 0)} cal · ${Math.round(r.nutrition.protein || 0)}g protein · ${Math.round(r.nutrition.carbs || 0)}g carbs · ${Math.round(r.nutrition.fat || 0)}g fat</p>` : ''}
        ${r.notes ? `<p style="margin-top:0.75rem;font-size:13px">${esc(r.notes)}</p>` : ''}
        <div class="modal-actions" style="margin-top:1rem">
          <button class="btn btn-outline" id="detail-edit-btn">Edit</button>
          <button class="btn btn-danger" id="detail-delete-btn">Delete</button>
        </div>
      </div>
    </div>`;
}

// ─── Full render ───
function render() {
  if (!_c) return;
  const filtered = recipes.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q) || (r.cuisine || '').toLowerCase().includes(q);
    const matchCuisine = !filters.cuisine || r.cuisine === filters.cuisine;
    const matchDiff = !filters.difficulty || r.difficulty === filters.difficulty;
    return matchQ && matchCuisine && matchDiff;
  });

  _c.innerHTML = `
    <div class="view-header">
      <h2>Recipes</h2>
      <button class="btn btn-primary" id="add-recipe-btn">+ New Recipe</button>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">
      <input type="text" id="recipe-search" class="input" placeholder="Search recipes…"
        value="${esc(search)}" style="flex:1;min-width:160px" aria-label="Search recipes">
      <select id="filter-cuisine" class="input" style="min-width:110px" aria-label="Filter by cuisine">
        <option value="">All cuisines</option>
        <option value="Indian" ${filters.cuisine === 'Indian' ? 'selected' : ''}>Indian</option>
        <option value="Italian" ${filters.cuisine === 'Italian' ? 'selected' : ''}>Italian</option>
        <option value="Chinese" ${filters.cuisine === 'Chinese' ? 'selected' : ''}>Chinese</option>
        <option value="Mexican" ${filters.cuisine === 'Mexican' ? 'selected' : ''}>Mexican</option>
        <option value="Thai" ${filters.cuisine === 'Thai' ? 'selected' : ''}>Thai</option>
        <option value="Japanese" ${filters.cuisine === 'Japanese' ? 'selected' : ''}>Japanese</option>
      </select>
      <select id="filter-difficulty" class="input" style="min-width:100px" aria-label="Filter by difficulty">
        <option value="">All levels</option>
        <option value="easy" ${filters.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
        <option value="medium" ${filters.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="hard" ${filters.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
      </select>
    </div>
    <div class="recipe-grid" id="recipe-grid">
      ${filtered.length
        ? filtered.map(r => recipeCardHTML(r)).join('')
        : `<div class="empty-state" style="padding:3rem;text-align:center">
             <span class="material-icons-round" style="font-size:3rem;color:var(--text-muted)">restaurant_menu</span>
             <p>${search || filters.cuisine || filters.difficulty ? 'No recipes match your filters.' : 'No recipes yet. Create your first recipe!'}</p>
           </div>`}
    </div>
    ${modal ? modalHTML() : ''}
    ${detailRecipe ? detailHTML() : ''}`;

  wireEvents();
}

// ─── Wire events ───
function wireEvents() {
  _c.querySelector('#add-recipe-btn')?.addEventListener('click', () => {
    editing = null; modal = true; render();
  });

  _c.querySelector('#recipe-search')?.addEventListener('input', e => {
    search = e.target.value;
    if (!modal && !detailRecipe) render();
  });

  _c.querySelector('#filter-cuisine')?.addEventListener('change', e => {
    filters.cuisine = e.target.value; render();
  });
  _c.querySelector('#filter-difficulty')?.addEventListener('change', e => {
    filters.difficulty = e.target.value; render();
  });

  // Card clicks → show detail
  _c.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', async () => {
      try {
        detailRecipe = await api.get(`/api/recipes/${card.dataset.id}`);
        render();
      } catch { showToast('Failed to load recipe'); }
    });
    card.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); card.click();
      }
    });
  });

  // Recipe form
  const form = _c.querySelector('#recipe-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (_c.querySelector('#rf-name')?.value || '').trim();
    if (!name) { showToast('Recipe name is required'); return; }
    saving = true; render();
    try {
      const data = {
        name,
        description: _c.querySelector('#rf-desc')?.value || '',
        servings: parseInt(_c.querySelector('#rf-servings')?.value) || 1,
        prep_time: parseInt(_c.querySelector('#rf-prep')?.value) || 0,
        cook_time: parseInt(_c.querySelector('#rf-cook')?.value) || 0,
        cuisine: _c.querySelector('#rf-cuisine')?.value || '',
        difficulty: _c.querySelector('#rf-difficulty')?.value || 'easy',
        notes: _c.querySelector('#rf-notes')?.value || '',
      };
      if (editing?.id) {
        await api.put(`/api/recipes/${editing.id}`, data);
        showToast('Recipe updated', 'success');
      } else {
        await api.post('/api/recipes', data);
        showToast('Recipe created', 'success');
      }
      modal = false; editing = null;
      await loadRecipes();
    } catch { showToast('Failed to save recipe'); }
    finally { saving = false; render(); }
  });

  _c.querySelector('#recipe-modal-close')?.addEventListener('click', () => { modal = false; editing = null; render(); });
  _c.querySelector('#recipe-modal-cancel')?.addEventListener('click', () => { modal = false; editing = null; render(); });
  _c.querySelector('#recipe-modal')?.addEventListener('click', e => {
    if (e.target.id === 'recipe-modal') { modal = false; editing = null; render(); }
  });

  // Detail modal buttons
  _c.querySelector('#detail-modal-close')?.addEventListener('click', () => { detailRecipe = null; render(); });
  _c.querySelector('#recipe-detail-modal')?.addEventListener('click', e => {
    if (e.target.id === 'recipe-detail-modal') { detailRecipe = null; render(); }
  });
  _c.querySelector('#detail-edit-btn')?.addEventListener('click', () => {
    editing = detailRecipe; detailRecipe = null; modal = true; render();
  });
  _c.querySelector('#detail-delete-btn')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${detailRecipe.name}"?`)) return;
    try {
      await api.del(`/api/recipes/${detailRecipe.id}`);
      showToast('Recipe deleted', 'success');
      detailRecipe = null;
      await loadRecipes();
      render();
    } catch { showToast('Failed to delete recipe'); }
  });
}

async function loadRecipes() {
  const res = await api.get('/api/recipes');
  recipes = Array.isArray(res) ? res : [];
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
  recipes = []; search = ''; filters = { cuisine: '', difficulty: '', dietary: '' };
  modal = false; editing = null; saving = false; detailRecipe = null;
  _c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading recipes…</div>';
  try { await loadRecipes(); } catch { showToast('Failed to load recipes'); }
  render();
}
