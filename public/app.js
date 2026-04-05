// ─── MealFlow SPA ───
import { api, setApiErrorHandler } from './js/api.js';
import { esc, fmtTime, fmtDate, fmtNutrition, today, dateOffset, debounce, capitalize, mealIcon, categoryIcon } from './js/utils.js';

// ─── State ───
let currentView = 'today';
let recipes = [];
let ingredients = [];
let tags = [];
let currentUser = null;

// ─── Init ───
async function init() {
  try {
    currentUser = await api.get('/api/auth/session');
    if (!currentUser || !currentUser.id) { window.location.href = '/login'; return; }
  } catch { window.location.href = '/login'; return; }

  setApiErrorHandler(showToast);
  setupNav();
  await render();
}

// ─── Navigation ───
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const view = el.dataset.view;
      if (view) { currentView = view; render(); }
    });
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login';
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ─── Render ───
async function render() {
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === currentView);
  });

  const content = document.getElementById('content');
  switch (currentView) {
    case 'today': await renderToday(content); break;
    case 'planner': await renderPlanner(content); break;
    case 'recipes': await renderRecipes(content); break;
    case 'ingredients': await renderIngredients(content); break;
    case 'shopping': await renderShopping(content); break;
    case 'nutrition': await renderNutrition(content); break;
    case 'dashboard': await renderDashboard(content); break;
    case 'settings': await renderSettings(content); break;
    default: content.innerHTML = '<p>View not found</p>';
  }
}

// ─── Today View ───
async function renderToday(el) {
  const todayStr = today();
  const [mealData, summary, goals] = await Promise.all([
    api.get(`/api/meals/${todayStr}`),
    api.get(`/api/nutrition/summary/${todayStr}`),
    api.get('/api/nutrition/goals'),
  ]);

  el.innerHTML = `
    <div class="view-header">
      <h2>Today — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    </div>

    <div class="nutrition-summary">
      <div class="macro-bar">
        <div class="macro-item">
          <span class="macro-label">Calories</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(summary.progress?.calories || 0, 100)}%"></div></div>
          <span class="macro-value">${fmtNutrition(summary.totals?.calories)} / ${goals.calories_target}</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Protein</span>
          <div class="progress-bar"><div class="progress-fill protein" style="width:${Math.min(summary.progress?.protein || 0, 100)}%"></div></div>
          <span class="macro-value">${fmtNutrition(summary.totals?.protein)}g / ${goals.protein_target}g</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Carbs</span>
          <div class="progress-bar"><div class="progress-fill carbs" style="width:${Math.min(summary.progress?.carbs || 0, 100)}%"></div></div>
          <span class="macro-value">${fmtNutrition(summary.totals?.carbs)}g / ${goals.carbs_target}g</span>
        </div>
        <div class="macro-item">
          <span class="macro-label">Fat</span>
          <div class="progress-bar"><div class="progress-fill fat" style="width:${Math.min(summary.progress?.fat || 0, 100)}%"></div></div>
          <span class="macro-value">${fmtNutrition(summary.totals?.fat)}g / ${goals.fat_target}g</span>
        </div>
      </div>
    </div>

    <div class="meals-today">
      ${['breakfast', 'lunch', 'dinner', 'snack'].map(type => {
        const meal = (mealData.meals || []).find(m => m.meal_type === type);
        const items = meal ? meal.items : [];
        return `
          <div class="meal-card">
            <div class="meal-header">
              <span>${mealIcon(type)} ${capitalize(type)}</span>
              <button class="btn btn-sm btn-outline" onclick="window._addMealItem('${todayStr}', '${type}')">+ Add</button>
            </div>
            <div class="meal-items">
              ${items.length ? items.map(i => `
                <div class="meal-item">
                  <span>${esc(i.recipe_name || i.custom_name || 'Custom')}</span>
                  <span class="meal-servings">${i.servings}x</span>
                </div>
              `).join('') : '<p class="empty-state">No items planned</p>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ─── Recipes View ───
async function renderRecipes(el) {
  recipes = await api.get('/api/recipes');
  if (!Array.isArray(recipes)) recipes = [];

  el.innerHTML = `
    <div class="view-header">
      <h2>Recipes</h2>
      <button class="btn btn-primary" id="add-recipe-btn">+ New Recipe</button>
    </div>
    <div class="search-bar">
      <input type="text" id="recipe-search" placeholder="Search recipes..." class="input">
    </div>
    <div class="recipe-grid" id="recipe-grid">
      ${recipes.length ? recipes.map(r => `
        <div class="recipe-card" data-id="${r.id}">
          <div class="recipe-card-header">
            <h3>${esc(r.name)}</h3>
            ${r.is_favorite ? '<span class="star">⭐</span>' : ''}
          </div>
          <p class="recipe-meta">
            ${r.cuisine ? `<span class="tag">${esc(r.cuisine)}</span>` : ''}
            <span>${fmtTime(r.prep_time + r.cook_time)}</span>
            <span>${r.servings} servings</span>
          </p>
          ${r.description ? `<p class="recipe-desc">${esc(r.description).substring(0, 100)}</p>` : ''}
          ${r.nutrition ? `<p class="recipe-nutrition">${r.nutrition.calories} cal · ${r.nutrition.protein}g P · ${r.nutrition.carbs}g C · ${r.nutrition.fat}g F</p>` : ''}
          <div class="recipe-tags">${(r.tags || []).map(t => `<span class="tag-pill" style="background:${esc(t.color)}">${esc(t.name)}</span>`).join('')}</div>
        </div>
      `).join('') : '<p class="empty-state">No recipes yet. Create your first recipe!</p>'}
    </div>
  `;

  document.getElementById('add-recipe-btn')?.addEventListener('click', () => showRecipeModal());
  document.getElementById('recipe-search')?.addEventListener('input', debounce(async (e) => {
    recipes = await api.get(`/api/recipes?q=${encodeURIComponent(e.target.value)}`);
    if (!Array.isArray(recipes)) recipes = [];
    renderRecipeGrid();
  }));

  // Click on recipe card
  el.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', () => showRecipeDetail(card.dataset.id));
  });
}

function renderRecipeGrid() {
  const grid = document.getElementById('recipe-grid');
  if (!grid) return;
  grid.innerHTML = recipes.length ? recipes.map(r => `
    <div class="recipe-card" data-id="${r.id}">
      <div class="recipe-card-header">
        <h3>${esc(r.name)}</h3>
        ${r.is_favorite ? '<span class="star">⭐</span>' : ''}
      </div>
      <p class="recipe-meta">
        ${r.cuisine ? `<span class="tag">${esc(r.cuisine)}</span>` : ''}
        <span>${fmtTime(r.prep_time + r.cook_time)}</span>
      </p>
    </div>
  `).join('') : '<p class="empty-state">No recipes found</p>';
}

async function showRecipeDetail(id) {
  const recipe = await api.get(`/api/recipes/${id}`);
  showModal(`
    <h2>${esc(recipe.name)} ${recipe.is_favorite ? '⭐' : ''}</h2>
    ${recipe.description ? `<p>${esc(recipe.description)}</p>` : ''}
    <div class="detail-meta">
      <span>🕐 Prep: ${fmtTime(recipe.prep_time)}</span>
      <span>🔥 Cook: ${fmtTime(recipe.cook_time)}</span>
      <span>🍽️ ${recipe.servings} servings</span>
      <span>📊 ${recipe.difficulty}</span>
    </div>
    ${recipe.ingredients?.length ? `
      <h3>Ingredients</h3>
      <ul class="ingredient-list">
        ${recipe.ingredients.map(i => `<li>${i.quantity}${i.unit} ${esc(i.ingredient_name)}${i.notes ? ` (${esc(i.notes)})` : ''}</li>`).join('')}
      </ul>
    ` : ''}
    ${recipe.notes ? `<h3>Notes</h3><p>${esc(recipe.notes)}</p>` : ''}
    ${recipe.nutrition ? `
      <h3>Nutrition (per serving)</h3>
      <p>${recipe.nutrition.calories} cal · ${recipe.nutrition.protein}g protein · ${recipe.nutrition.carbs}g carbs · ${recipe.nutrition.fat}g fat</p>
    ` : ''}
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="window._editRecipe(${recipe.id})">Edit</button>
      <button class="btn btn-danger" onclick="window._deleteRecipe(${recipe.id})">Delete</button>
    </div>
  `);
}

function showRecipeModal(recipe = null) {
  showModal(`
    <h2>${recipe ? 'Edit Recipe' : 'New Recipe'}</h2>
    <form id="recipe-form">
      <div class="form-group"><label>Name *</label><input type="text" name="name" value="${recipe ? esc(recipe.name) : ''}" required class="input"></div>
      <div class="form-group"><label>Description</label><textarea name="description" class="input" rows="3">${recipe ? esc(recipe.description) : ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Servings</label><input type="number" name="servings" value="${recipe ? recipe.servings : 1}" min="1" class="input"></div>
        <div class="form-group"><label>Prep (min)</label><input type="number" name="prep_time" value="${recipe ? recipe.prep_time : 0}" min="0" class="input"></div>
        <div class="form-group"><label>Cook (min)</label><input type="number" name="cook_time" value="${recipe ? recipe.cook_time : 0}" min="0" class="input"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Cuisine</label><input type="text" name="cuisine" value="${recipe ? esc(recipe.cuisine) : ''}" class="input"></div>
        <div class="form-group"><label>Difficulty</label>
          <select name="difficulty" class="input">
            <option value="easy" ${recipe?.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
            <option value="medium" ${recipe?.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="hard" ${recipe?.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Notes</label><textarea name="notes" class="input" rows="2">${recipe ? esc(recipe.notes) : ''}</textarea></div>
      <button type="submit" class="btn btn-primary">${recipe ? 'Save' : 'Create'}</button>
    </form>
  `);

  document.getElementById('recipe-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      description: fd.get('description') || '',
      servings: parseInt(fd.get('servings')) || 1,
      prep_time: parseInt(fd.get('prep_time')) || 0,
      cook_time: parseInt(fd.get('cook_time')) || 0,
      cuisine: fd.get('cuisine') || '',
      difficulty: fd.get('difficulty') || 'easy',
      notes: fd.get('notes') || '',
    };

    if (recipe) {
      await api.put(`/api/recipes/${recipe.id}`, data);
    } else {
      await api.post('/api/recipes', data);
    }
    closeModal();
    await render();
  });
}

// ─── Planner View (stub) ───
async function renderPlanner(el) {
  el.innerHTML = `
    <div class="view-header"><h2>Meal Planner</h2></div>
    <p class="empty-state">Weekly meal planner — coming soon</p>
  `;
}

// ─── Ingredients View (stub) ───
async function renderIngredients(el) {
  const data = await api.get('/api/ingredients');
  const ings = Array.isArray(data) ? data : [];

  el.innerHTML = `
    <div class="view-header">
      <h2>Ingredients</h2>
      <button class="btn btn-primary" id="add-ingredient-btn">+ Add</button>
    </div>
    <div class="ingredient-grid">
      ${ings.length ? ings.map(i => `
        <div class="ingredient-card">
          <span class="cat-icon">${categoryIcon(i.category)}</span>
          <div>
            <strong>${esc(i.name)}</strong>
            <span class="ingredient-macros">${i.calories} cal · ${i.protein}g P · ${i.carbs}g C · ${i.fat}g F <small>per 100${i.unit}</small></span>
          </div>
        </div>
      `).join('') : '<p class="empty-state">No ingredients yet</p>'}
    </div>
  `;
}

// ─── Shopping View (stub) ───
async function renderShopping(el) {
  const lists = await api.get('/api/shopping');
  el.innerHTML = `
    <div class="view-header">
      <h2>Shopping Lists</h2>
      <button class="btn btn-primary" id="add-shopping-btn">+ New List</button>
    </div>
    ${Array.isArray(lists) && lists.length ? lists.map(l => `
      <div class="shopping-list-card">
        <h3>${esc(l.name)}</h3>
        <span>${l.checked_items}/${l.total_items} checked</span>
      </div>
    `).join('') : '<p class="empty-state">No shopping lists</p>'}
  `;
}

// ─── Nutrition View (stub) ───
async function renderNutrition(el) {
  const summary = await api.get(`/api/nutrition/summary/${today()}`);
  el.innerHTML = `
    <div class="view-header"><h2>Nutrition Tracker</h2></div>
    <p>Today: ${fmtNutrition(summary.totals?.calories)} calories</p>
  `;
}

// ─── Dashboard View ───
async function renderDashboard(el) {
  const stats = await api.get('/api/stats/dashboard');
  el.innerHTML = `
    <div class="view-header"><h2>Dashboard</h2></div>
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-value">${stats.recipes || 0}</span><span class="stat-label">Recipes</span></div>
      <div class="stat-card"><span class="stat-value">${stats.ingredients || 0}</span><span class="stat-label">Ingredients</span></div>
      <div class="stat-card"><span class="stat-value">${stats.favorites || 0}</span><span class="stat-label">Favorites</span></div>
      <div class="stat-card"><span class="stat-value">${stats.this_week_plans || 0}</span><span class="stat-label">This Week</span></div>
    </div>
    ${stats.top_cuisines?.length ? `
      <h3>Top Cuisines</h3>
      <div class="cuisine-list">${stats.top_cuisines.map(c => `<span class="tag">${esc(c.cuisine)} (${c.c})</span>`).join('')}</div>
    ` : ''}
  `;
}

// ─── Settings View (stub) ───
async function renderSettings(el) {
  el.innerHTML = `
    <div class="view-header"><h2>Settings</h2></div>
    <p class="empty-state">Settings — coming soon</p>
  `;
}

// ─── Modal helpers ───
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

// ─── Toast ───
function showToast(msg, type = 'error') {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── Global helpers (used by onclick in HTML) ───
window._editRecipe = async (id) => {
  const recipe = await api.get(`/api/recipes/${id}`);
  closeModal();
  showRecipeModal(recipe);
};

window._deleteRecipe = async (id) => {
  if (!confirm('Delete this recipe?')) return;
  await api.del(`/api/recipes/${id}`);
  closeModal();
  await render();
};

window._addMealItem = async (date, mealType) => {
  showToast('Meal item quick-add coming soon', 'info');
};

// ─── Boot ───
document.addEventListener('DOMContentLoaded', init);
