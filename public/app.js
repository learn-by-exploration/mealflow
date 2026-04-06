// ─── MealFlow SPA ───
import { api, setApiErrorHandler } from './js/api.js';
import { esc, fmtTime, fmtDate, fmtNutrition, today, dateOffset, debounce, capitalize, mealIcon, categoryIcon } from './js/utils.js';

// ─── State ───
let currentView = 'today';
let recipes = [];
let ingredients = [];
let tags = [];
let currentUser = null;
let settingsTab = 'profile';
let plannerWeekStart = null; // Monday of the currently-viewed planner week
let activeTimers = [];   // { id, label, remaining, interval }

const MEAL_SLOTS = ['breakfast','morning_snack','lunch','evening_snack','dinner','snack'];
const SLOT_LABELS = { breakfast:'Breakfast', morning_snack:'Morning Snack', lunch:'Lunch', evening_snack:'Evening Snack', dinner:'Dinner', snack:'Late-night Snack' };
const SLOT_ICONS  = { breakfast:'🌅', morning_snack:'🫖', lunch:'☀️', evening_snack:'🍵', dinner:'🌙', snack:'🌜' };

// ─── Init ───
async function init() {
  try {
    currentUser = await api.get('/api/auth/session');
    if (!currentUser || !currentUser.id) { window.location.href = '/login'; return; }
  } catch { window.location.href = '/login'; return; }

  setApiErrorHandler(showToast);
  setupNav();

  // PO-01: Check first-login (no household)
  try {
    await api.get('/api/households/current');
  } catch {
    // No household — show wizard
    currentView = 'wizard';
  }

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

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ─── Render ───
async function render() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === currentView);
  });

  const content = document.getElementById('content');
  switch (currentView) {
    case 'wizard':   await renderWizard(content); break;
    case 'today':    await renderToday(content); break;
    case 'planner':  await renderPlanner(content); break;
    case 'recipes':  await renderRecipes(content); break;
    case 'ingredients': await renderIngredients(content); break;
    case 'shopping': await renderShopping(content); break;
    case 'nutrition': await renderNutrition(content); break;
    case 'dashboard': await renderDashboard(content); break;
    case 'settings': await renderSettings(content); break;
    case 'pantry':   await renderPantry(content); break;
    case 'polls':    await renderPolls(content); break;
    case 'templates': await renderTemplates(content); break;
    default: content.innerHTML = '<p>View not found</p>';
  }
}

// ════════════════════════════════════════════════════
// PO-01: Household Wizard
// ════════════════════════════════════════════════════
let wizardStep = 1;
let wizardData = { householdName: '', members: [], dietary: { spice_level: 3, sugar_preference: 3 }, festivals: [] };

async function renderWizard(el) {
  el.innerHTML = `
    <div class="wizard">
      <div class="wizard-progress" role="progressbar" aria-valuenow="${wizardStep}" aria-valuemin="1" aria-valuemax="4">
        <div class="wizard-bar" style="width:${wizardStep * 25}%"></div>
        <div class="wizard-steps">
          ${[1,2,3,4].map(s => `<span class="wizard-dot ${s <= wizardStep ? 'active' : ''}">${s}</span>`).join('')}
        </div>
      </div>
      <div class="wizard-body" id="wizard-body"></div>
      <div class="wizard-footer">
        ${wizardStep > 1 ? '<button class="btn btn-outline" id="wiz-back">Back</button>' : '<span></span>'}
        <div>
          <button class="btn btn-text" id="wiz-skip">Skip</button>
          <button class="btn btn-primary" id="wiz-next">${wizardStep === 4 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>
  `;

  renderWizardStep();

  document.getElementById('wiz-back')?.addEventListener('click', () => { wizardStep--; renderWizard(el); });
  document.getElementById('wiz-skip')?.addEventListener('click', () => { wizardStep = 5; finishWizard(el); });
  document.getElementById('wiz-next')?.addEventListener('click', () => { saveWizardStep(); wizardStep++; if (wizardStep > 4) finishWizard(el); else renderWizard(el); });
}

function renderWizardStep() {
  const body = document.getElementById('wizard-body');
  if (!body) return;
  switch (wizardStep) {
    case 1:
      body.innerHTML = `
        <div class="wizard-step">
          <span class="material-icons-round wizard-icon">home</span>
          <h3>Name your household</h3>
          <p class="text-muted">Give your family group a name</p>
          <input type="text" id="wiz-household-name" class="input" placeholder="The Sharma Family" value="${esc(wizardData.householdName)}" aria-label="Household name">
        </div>`;
      break;
    case 2:
      body.innerHTML = `
        <div class="wizard-step">
          <span class="material-icons-round wizard-icon">group</span>
          <h3>Add family members</h3>
          <p class="text-muted">Who'll be eating together?</p>
          <div id="wiz-members-list">
            ${wizardData.members.map((m, i) => `
              <div class="wiz-member-row">
                <span>${esc(m.name)} — ${m.age}y, ${m.dietary_type}</span>
                <button class="btn btn-text btn-sm" data-remove="${i}">✕</button>
              </div>
            `).join('')}
          </div>
          <div class="form-row" style="margin-top:0.75rem">
            <div class="form-group"><label>Name</label><input type="text" id="wiz-m-name" class="input" placeholder="Name" aria-label="Member name"></div>
            <div class="form-group"><label>Age</label><input type="number" id="wiz-m-age" class="input" placeholder="Age" min="1" max="120" aria-label="Member age"></div>
            <div class="form-group"><label>Diet</label>
              <select id="wiz-m-diet" class="input" aria-label="Dietary type">
                <option value="veg">Veg</option><option value="non-veg">Non-veg</option><option value="vegan">Vegan</option><option value="jain">Jain</option>
              </select>
            </div>
            <div class="form-group" style="align-self:end"><button class="btn btn-outline btn-sm" id="wiz-add-member" type="button">+ Add</button></div>
          </div>
        </div>`;
      document.getElementById('wiz-add-member')?.addEventListener('click', () => {
        const name = document.getElementById('wiz-m-name').value.trim();
        const age = parseInt(document.getElementById('wiz-m-age').value) || 0;
        const dietary_type = document.getElementById('wiz-m-diet').value;
        if (name && age > 0) { wizardData.members.push({ name, age, dietary_type }); renderWizardStep(); }
      });
      body.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => { wizardData.members.splice(parseInt(btn.dataset.remove), 1); renderWizardStep(); });
      });
      break;
    case 3:
      body.innerHTML = `
        <div class="wizard-step">
          <span class="material-icons-round wizard-icon">tune</span>
          <h3>Dietary preferences</h3>
          <p class="text-muted">Set household-wide defaults</p>
          <div class="form-group">
            <label>Spice level (1-5): <strong id="spice-val">${wizardData.dietary.spice_level}</strong></label>
            <input type="range" id="wiz-spice" min="1" max="5" value="${wizardData.dietary.spice_level}" class="input-range" aria-label="Spice level">
          </div>
          <div class="form-group">
            <label>Sugar preference (1-5): <strong id="sugar-val">${wizardData.dietary.sugar_preference}</strong></label>
            <input type="range" id="wiz-sugar" min="1" max="5" value="${wizardData.dietary.sugar_preference}" class="input-range" aria-label="Sugar preference">
          </div>
        </div>`;
      document.getElementById('wiz-spice')?.addEventListener('input', e => { wizardData.dietary.spice_level = parseInt(e.target.value); document.getElementById('spice-val').textContent = e.target.value; });
      document.getElementById('wiz-sugar')?.addEventListener('input', e => { wizardData.dietary.sugar_preference = parseInt(e.target.value); document.getElementById('sugar-val').textContent = e.target.value; });
      break;
    case 4:
      (async () => {
        let festivals = [];
        try { festivals = await api.get('/api/festivals'); } catch {}
        if (!Array.isArray(festivals)) festivals = [];
        body.innerHTML = `
          <div class="wizard-step">
            <span class="material-icons-round wizard-icon">celebration</span>
            <h3>Festivals to observe</h3>
            <p class="text-muted">Select festivals for fasting-aware meal planning</p>
            <div class="festival-checkboxes">
              ${festivals.length ? festivals.map(f => `
                <label class="checkbox-label">
                  <input type="checkbox" value="${f.id}" ${wizardData.festivals.includes(f.id) ? 'checked' : ''} class="wiz-fest-cb">
                  ${esc(f.name)}${f.name_hindi ? ` (${esc(f.name_hindi)})` : ''}
                </label>
              `).join('') : '<p class="text-muted">No festivals configured. You can add them later in Settings.</p>'}
            </div>
          </div>`;
        body.querySelectorAll('.wiz-fest-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            const id = parseInt(cb.value);
            if (cb.checked && !wizardData.festivals.includes(id)) wizardData.festivals.push(id);
            if (!cb.checked) wizardData.festivals = wizardData.festivals.filter(x => x !== id);
          });
        });
      })();
      break;
  }
}

function saveWizardStep() {
  if (wizardStep === 1) {
    wizardData.householdName = document.getElementById('wiz-household-name')?.value.trim() || 'My Family';
  }
}

async function finishWizard(el) {
  try {
    // 1. Create household
    if (wizardData.householdName) {
      await api.post('/api/households', { name: wizardData.householdName });
    }
    // 2. Add members as persons
    for (const m of wizardData.members) {
      await api.post('/api/persons', { name: m.name, age: m.age, dietary_type: m.dietary_type });
    }
    // 3. Set dietary preferences (per person if any)
    // Stored via settings
    if (wizardData.dietary.spice_level !== 3 || wizardData.dietary.sugar_preference !== 3) {
      try {
        const persons = await api.get('/api/persons');
        for (const p of (Array.isArray(persons) ? persons : [])) {
          await api.put(`/api/persons/${p.id}`, { spice_level: wizardData.dietary.spice_level, sugar_preference: wizardData.dietary.sugar_preference });
        }
      } catch {}
    }
  } catch (e) { /* ignore partial errors */ }

  currentView = 'today';
  wizardStep = 1;
  await render();
  showToast('Welcome to MealFlow! 🎉', 'success');
}

// ════════════════════════════════════════════════════
// PO-03: Empty-state helper
// ════════════════════════════════════════════════════
function emptyState(icon, message, btnLabel, btnAction) {
  const btnId = 'es-btn-' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    document.getElementById(btnId)?.addEventListener('click', btnAction);
  }, 0);
  return `
    <div class="empty-state-box">
      <span class="material-icons-round empty-state-icon">${esc(icon)}</span>
      <p class="empty-state-msg">${esc(message)}</p>
      ${btnLabel ? `<button class="btn btn-primary" id="${btnId}">${esc(btnLabel)}</button>` : ''}
    </div>
  `;
}

// ════════════════════════════════════════════════════
// Today View (updated with PO-02, PO-03, PO-07, PO-14)
// ════════════════════════════════════════════════════
async function renderToday(el) {
  const todayStr = today();
  const [mealData, summary, goals] = await Promise.all([
    api.get(`/api/meals/${todayStr}`),
    api.get(`/api/nutrition/summary/${todayStr}`),
    api.get('/api/nutrition/goals'),
  ]);

  const meals = mealData.meals || [];
  const hasAnyMeal = meals.some(m => m.items && m.items.length > 0);

  // Fetch active polls for today
  let activePolls = [];
  try { const allPolls = await api.get('/api/polls?status=open'); activePolls = Array.isArray(allPolls) ? allPolls : []; } catch {}

  el.innerHTML = `
    <div class="view-header">
      <h2>Today — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    </div>

    <div class="nutrition-summary">
      <div class="macro-bar">
        ${['calories','protein','carbs','fat'].map(k => {
          const val = summary.totals?.[k] || 0;
          const target = goals[`${k}_target`] || 0;
          const pct = target ? Math.min(Math.round(val / target * 100), 100) : 0;
          const unit = k === 'calories' ? '' : 'g';
          return `
            <div class="macro-item">
              <span class="macro-label">${capitalize(k)}</span>
              <div class="progress-bar"><div class="progress-fill ${k !== 'calories' ? k : ''}" style="width:${pct}%"></div></div>
              <span class="macro-value">${fmtNutrition(val)}${unit} / ${target}${unit}</span>
            </div>`;
        }).join('')}
      </div>
    </div>

    ${activePolls.length ? `
      <div class="polls-banner">
        <h3><span class="material-icons-round" style="vertical-align:middle">how_to_vote</span> Active Polls</h3>
        ${activePolls.map(p => `
          <div class="poll-card-mini" data-poll-id="${p.id}">
            <span>${esc(p.question)}</span>
            <button class="btn btn-sm btn-outline poll-vote-btn" data-poll="${p.id}">Vote</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${!hasAnyMeal ? `
      <div class="empty-state-box">
        <span class="material-icons-round empty-state-icon">restaurant</span>
        <p class="empty-state-msg">No meals planned for today</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" id="plan-first-meal">Plan your first meal</button>
          <button class="btn btn-outline" id="seed-sample-plan">Start with a sample week</button>
        </div>
      </div>
    ` : `
      <div class="meals-today">
        ${MEAL_SLOTS.map(type => {
          const meal = meals.find(m => m.meal_type === type);
          const items = meal ? meal.items : [];
          return `
            <div class="meal-card">
              <div class="meal-header">
                <span>${SLOT_ICONS[type] || '🍽️'} ${SLOT_LABELS[type] || capitalize(type)}</span>
                <div class="meal-actions">
                  <button class="btn btn-sm btn-text meal-history-btn" data-slot="${type}" title="Repeat recent">
                    <span class="material-icons-round" style="font-size:1rem">history</span>
                  </button>
                  <button class="btn btn-sm btn-outline" onclick="window._addMealItem('${todayStr}', '${type}')">+ Add</button>
                </div>
              </div>
              <div class="meal-items">
                ${items.length ? items.map(i => `
                  <div class="meal-item">
                    <span>${esc(i.recipe_name || i.custom_name || 'Custom')}</span>
                    <span class="meal-servings">${i.servings}x</span>
                  </div>
                `).join('') : '<p class="empty-hint">No items</p>'}
              </div>
            </div>`;
        }).join('')}
      </div>
    `}
  `;

  // PO-02: Sample plan seeding
  document.getElementById('seed-sample-plan')?.addEventListener('click', async () => {
    const btn = document.getElementById('seed-sample-plan');
    btn.disabled = true; btn.textContent = 'Seeding…';
    try {
      await api.post('/api/seed/sample-plan');
      showToast('Sample week created!', 'success');
      await render();
    } catch { showToast('Failed to seed sample plan', 'error'); btn.disabled = false; btn.textContent = 'Start with a sample week'; }
  });

  document.getElementById('plan-first-meal')?.addEventListener('click', () => {
    currentView = 'planner'; render();
  });

  // PO-14: Quick-add from history
  el.querySelectorAll('.meal-history-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slot = btn.dataset.slot;
      await showRecentMealsDropdown(btn, todayStr, slot);
    });
  });

  // PO-07: Poll vote buttons
  el.querySelectorAll('.poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentView = 'polls'; render(); });
  });
}

// PO-14 helper: show recent meals for a slot
async function showRecentMealsDropdown(anchor, date, slotType) {
  // Fetch recent meals for this slot across last 30 days
  const from = dateOffset(-30);
  let mealsData = [];
  try { mealsData = await api.get(`/api/meals?from=${from}&to=${date}`); } catch {}
  if (!Array.isArray(mealsData)) mealsData = [];

  // Collect unique recipe items from this slot type
  const seen = new Set();
  const recentItems = [];
  for (const m of mealsData) {
    if (m.meal_type !== slotType) continue;
    for (const item of (m.items || [])) {
      const key = item.recipe_id || item.custom_name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      recentItems.push(item);
      if (recentItems.length >= 10) break;
    }
    if (recentItems.length >= 10) break;
  }

  if (!recentItems.length) { showToast('No recent meals for this slot', 'info'); return; }

  showModal(`
    <h2>Repeat recent — ${SLOT_LABELS[slotType] || capitalize(slotType)}</h2>
    <div class="recent-meals-list">
      ${recentItems.map(i => `
        <button class="recent-meal-btn" data-recipe-id="${i.recipe_id || ''}" data-custom-name="${esc(i.custom_name || '')}" data-servings="${i.servings || 1}">
          <span>${esc(i.recipe_name || i.custom_name || 'Custom')}</span>
          <span class="text-muted">${i.servings}x</span>
        </button>
      `).join('')}
    </div>
  `);

  document.querySelectorAll('.recent-meal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Create meal plan for today if needed, then add item
      try {
        let plan = await api.post('/api/meals', { date, meal_type: slotType });
        if (plan && plan.id) {
          await api.post(`/api/meals/${plan.id}/items`, {
            recipe_id: parseInt(btn.dataset.recipeId) || undefined,
            custom_name: btn.dataset.customName || undefined,
            servings: parseInt(btn.dataset.servings) || 1,
          });
        }
        closeModal();
        showToast('Meal added!', 'success');
        await render();
      } catch { showToast('Failed to add meal', 'error'); }
    });
  });
}

// ════════════════════════════════════════════════════
// PO-04: Weekly Planner View
// ════════════════════════════════════════════════════
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
  dt.setHours(0,0,0,0);
  return dt;
}

function fmtDateISO(d) { return d.toISOString().split('T')[0]; }

async function renderPlanner(el) {
  if (!plannerWeekStart) plannerWeekStart = getMonday(new Date());

  const from = fmtDateISO(plannerWeekStart);
  const toDate = new Date(plannerWeekStart);
  toDate.setDate(toDate.getDate() + 6);
  const to = fmtDateISO(toDate);

  let mealsRaw = [];
  try { mealsRaw = await api.get(`/api/meals?from=${from}&to=${to}`); } catch {}
  if (!Array.isArray(mealsRaw)) mealsRaw = [];

  // Build lookup: date → mealType → items[]
  const lookup = {};
  for (const m of mealsRaw) {
    if (!lookup[m.date]) lookup[m.date] = {};
    lookup[m.date][m.meal_type] = { id: m.id, items: m.items || [] };
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(plannerWeekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const todayStr = today();

  el.innerHTML = `
    <div class="view-header">
      <h2>Meal Planner</h2>
      <div class="planner-nav">
        <button class="btn btn-outline btn-sm" id="planner-prev" aria-label="Previous week"><span class="material-icons-round">chevron_left</span></button>
        <span class="planner-week-label">${plannerWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <button class="btn btn-outline btn-sm" id="planner-next" aria-label="Next week"><span class="material-icons-round">chevron_right</span></button>
        <button class="btn btn-text btn-sm" id="planner-today">Today</button>
      </div>
    </div>

    <div class="planner-grid-wrapper">
      <table class="planner-grid" role="grid" aria-label="Weekly meal planner">
        <thead>
          <tr>
            <th class="planner-slot-header"></th>
            ${days.map(d => {
              const ds = fmtDateISO(d);
              const isToday = ds === todayStr;
              return `<th class="planner-day-header ${isToday ? 'is-today' : ''}">
                <span class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span class="day-num">${d.getDate()}</span>
              </th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${MEAL_SLOTS.map(slot => `
            <tr>
              <td class="planner-slot-label">${SLOT_ICONS[slot] || ''} ${SLOT_LABELS[slot] || capitalize(slot)}</td>
              ${days.map(d => {
                const ds = fmtDateISO(d);
                const cellData = lookup[ds]?.[slot];
                const items = cellData?.items || [];
                const isToday = ds === todayStr;
                return `
                  <td class="planner-cell ${isToday ? 'is-today' : ''}" data-date="${ds}" data-slot="${slot}" role="gridcell" tabindex="0" aria-label="${SLOT_LABELS[slot]} on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}">
                    ${items.length ? items.map(i => `<div class="planner-item">${esc(i.recipe_name || i.custom_name || '?')}</div>`).join('') : '<div class="planner-empty">+</div>'}
                  </td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Nav buttons
  document.getElementById('planner-prev')?.addEventListener('click', () => {
    plannerWeekStart.setDate(plannerWeekStart.getDate() - 7);
    renderPlanner(el);
  });
  document.getElementById('planner-next')?.addEventListener('click', () => {
    plannerWeekStart.setDate(plannerWeekStart.getDate() + 7);
    renderPlanner(el);
  });
  document.getElementById('planner-today')?.addEventListener('click', () => {
    plannerWeekStart = getMonday(new Date());
    renderPlanner(el);
  });

  // Click cells to add meal
  el.querySelectorAll('.planner-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      showAddMealModal(cell.dataset.date, cell.dataset.slot);
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAddMealModal(cell.dataset.date, cell.dataset.slot); }
    });
  });
}

async function showAddMealModal(date, slot) {
  // Load recipes for selection
  let recipeList = [];
  try { recipeList = await api.get('/api/recipes'); } catch {}
  if (!Array.isArray(recipeList)) recipeList = [];

  showModal(`
    <h2>Add to ${SLOT_LABELS[slot] || capitalize(slot)} — ${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h2>
    <div class="form-group">
      <label>Search recipes</label>
      <input type="text" id="meal-recipe-search" class="input" placeholder="Type to filter..." aria-label="Search recipes">
    </div>
    <div id="meal-recipe-list" class="recipe-select-list">
      ${recipeList.slice(0, 20).map(r => `
        <button class="recipe-select-btn" data-recipe-id="${r.id}">
          <span>${esc(r.name)}</span>
          <span class="text-muted">${r.cuisine ? esc(r.cuisine) : ''}</span>
        </button>
      `).join('')}
    </div>
    <hr style="border-color:var(--border);margin:1rem 0">
    <div class="form-group">
      <label>Or add custom item</label>
      <div class="form-row">
        <input type="text" id="meal-custom-name" class="input" placeholder="Custom dish name" aria-label="Custom dish name">
        <button class="btn btn-outline" id="meal-add-custom">Add</button>
      </div>
    </div>
  `);

  const bindRecipeBtns = () => {
    document.querySelectorAll('.recipe-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const plan = await api.post('/api/meals', { date, meal_type: slot });
          if (plan && plan.id) {
            await api.post(`/api/meals/${plan.id}/items`, { recipe_id: parseInt(btn.dataset.recipeId), servings: 1 });
          }
          closeModal(); showToast('Meal added!', 'success'); await render();
        } catch { showToast('Failed to add meal', 'error'); }
      });
    });
  };
  bindRecipeBtns();

  document.getElementById('meal-recipe-search')?.addEventListener('input', debounce(async (e) => {
    const q = e.target.value;
    let filtered = [];
    try { filtered = await api.get(`/api/recipes?q=${encodeURIComponent(q)}`); } catch {}
    if (!Array.isArray(filtered)) filtered = [];
    const list = document.getElementById('meal-recipe-list');
    if (list) {
      list.innerHTML = filtered.slice(0, 20).map(r => `
        <button class="recipe-select-btn" data-recipe-id="${r.id}">
          <span>${esc(r.name)}</span>
          <span class="text-muted">${r.cuisine ? esc(r.cuisine) : ''}</span>
        </button>
      `).join('') || '<p class="text-muted">No recipes found</p>';
      bindRecipeBtns();
    }
  }));

  document.getElementById('meal-add-custom')?.addEventListener('click', async () => {
    const name = document.getElementById('meal-custom-name')?.value.trim();
    if (!name) return;
    try {
      const plan = await api.post('/api/meals', { date, meal_type: slot });
      if (plan && plan.id) {
        await api.post(`/api/meals/${plan.id}/items`, { custom_name: name, servings: 1 });
      }
      closeModal(); showToast('Meal added!', 'success'); await render();
    } catch { showToast('Failed to add meal', 'error'); }
  });
}

// ════════════════════════════════════════════════════
// Recipes View
// ════════════════════════════════════════════════════
async function renderRecipes(el) {
  recipes = await api.get('/api/recipes');
  if (!Array.isArray(recipes)) recipes = [];

  el.innerHTML = `
    <div class="view-header">
      <h2>Recipes</h2>
      <button class="btn btn-primary" id="add-recipe-btn">+ New Recipe</button>
    </div>
    <div class="search-bar">
      <input type="text" id="recipe-search" placeholder="Search recipes..." class="input" aria-label="Search recipes">
    </div>
    <div class="recipe-grid" id="recipe-grid">
      ${recipes.length ? recipes.map(r => recipeCardHTML(r)).join('') : emptyState('restaurant_menu', 'No recipes yet. Create your first recipe!', '+ New Recipe', () => showRecipeModal())}
    </div>
  `;

  document.getElementById('add-recipe-btn')?.addEventListener('click', () => showRecipeModal());
  document.getElementById('recipe-search')?.addEventListener('input', debounce(async (e) => {
    recipes = await api.get(`/api/recipes?q=${encodeURIComponent(e.target.value)}`);
    if (!Array.isArray(recipes)) recipes = [];
    renderRecipeGrid();
  }));

  el.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', () => showRecipeDetail(card.dataset.id));
  });
}

function recipeCardHTML(r) {
  return `
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
    </div>`;
}

function renderRecipeGrid() {
  const grid = document.getElementById('recipe-grid');
  if (!grid) return;
  grid.innerHTML = recipes.length ? recipes.map(r => recipeCardHTML(r)).join('') : '<p class="empty-state">No recipes found</p>';
  grid.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', () => showRecipeDetail(card.dataset.id));
  });
}

// PO-15: Recipe detail with cooking timers
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
    ${(recipe.prep_time || recipe.cook_time) ? `
      <div class="timer-section">
        ${recipe.prep_time ? `<button class="btn btn-outline btn-sm timer-start-btn" data-minutes="${recipe.prep_time}" data-label="Prep: ${esc(recipe.name)}"><span class="material-icons-round" style="font-size:1rem">timer</span> Start prep timer (${fmtTime(recipe.prep_time)})</button>` : ''}
        ${recipe.cook_time ? `<button class="btn btn-outline btn-sm timer-start-btn" data-minutes="${recipe.cook_time}" data-label="Cook: ${esc(recipe.name)}"><span class="material-icons-round" style="font-size:1rem">timer</span> Start cook timer (${fmtTime(recipe.cook_time)})</button>` : ''}
      </div>
    ` : ''}
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

  // PO-15: Timer buttons
  document.querySelectorAll('.timer-start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      startTimer(parseInt(btn.dataset.minutes), btn.dataset.label);
      btn.disabled = true;
      btn.textContent = 'Timer started!';
    });
  });
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

// ════════════════════════════════════════════════════
// Ingredients View (with PO-03)
// ════════════════════════════════════════════════════
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
      `).join('') : emptyState('egg', 'No ingredients yet. Add your pantry staples!', '+ Add Ingredient', () => showToast('Ingredient form coming soon', 'info'))}
    </div>
  `;
}

// ════════════════════════════════════════════════════
// Shopping View (with PO-03)
// ════════════════════════════════════════════════════
async function renderShopping(el) {
  const lists = await api.get('/api/shopping');
  const arr = Array.isArray(lists) ? lists : [];
  el.innerHTML = `
    <div class="view-header">
      <h2>Shopping Lists</h2>
      <button class="btn btn-primary" id="add-shopping-btn">+ New List</button>
    </div>
    ${arr.length ? arr.map(l => `
      <div class="shopping-list-card">
        <h3>${esc(l.name)}</h3>
        <span>${l.checked_items}/${l.total_items} checked</span>
      </div>
    `).join('') : emptyState('shopping_cart', 'No shopping lists yet', '+ Create List', () => showToast('Shopping list creation coming soon', 'info'))}
  `;
}

// ════════════════════════════════════════════════════
// Nutrition View (with PO-03)
// ════════════════════════════════════════════════════
async function renderNutrition(el) {
  const summary = await api.get(`/api/nutrition/summary/${today()}`);
  const hasData = summary.totals && (summary.totals.calories > 0);
  el.innerHTML = `
    <div class="view-header"><h2>Nutrition Tracker</h2></div>
    ${hasData ? `
      <div class="nutrition-detail">
        <div class="macro-bar">
          ${['calories','protein','carbs','fat'].map(k => `
            <div class="macro-item">
              <span class="macro-label">${capitalize(k)}</span>
              <span class="macro-value">${fmtNutrition(summary.totals?.[k])}${k === 'calories' ? '' : 'g'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : emptyState('monitoring', 'No nutrition data logged today', 'Log a meal first', () => { currentView = 'today'; render(); })}
  `;
}

// ════════════════════════════════════════════════════
// Dashboard View
// ════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════
// PO-09: Settings Page (multi-tab)
// ════════════════════════════════════════════════════
async function renderSettings(el) {
  const tabs = [
    { id: 'profile', icon: 'person', label: 'Profile' },
    { id: 'family', icon: 'group', label: 'Family' },
    { id: 'festivals', icon: 'celebration', label: 'Festivals' },
    { id: 'notifications', icon: 'notifications', label: 'Notifications' },
    { id: 'ai', icon: 'smart_toy', label: 'AI' },
    { id: 'data', icon: 'cloud_download', label: 'Data' },
    { id: 'theme', icon: 'palette', label: 'Theme' },
  ];

  el.innerHTML = `
    <div class="view-header"><h2>Settings</h2></div>
    <div class="settings-layout">
      <div class="settings-tabs" role="tablist">
        ${tabs.map(t => `
          <button class="settings-tab ${settingsTab === t.id ? 'active' : ''}" data-tab="${t.id}" role="tab" aria-selected="${settingsTab === t.id}">
            <span class="material-icons-round">${t.icon}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="settings-content" id="settings-content" role="tabpanel"></div>
    </div>
  `;

  el.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      settingsTab = tab.dataset.tab;
      renderSettings(el);
    });
  });

  const content = document.getElementById('settings-content');
  switch (settingsTab) {
    case 'profile':  await renderSettingsProfile(content); break;
    case 'family':   await renderSettingsFamily(content); break;
    case 'festivals': await renderSettingsFestivals(content); break;
    case 'notifications': await renderSettingsNotifications(content); break;
    case 'ai':       await renderSettingsAI(content); break;
    case 'data':     await renderSettingsData(content); break;
    case 'theme':    renderSettingsTheme(content); break;
  }
}

// Profile tab
async function renderSettingsProfile(el) {
  el.innerHTML = `
    <h3>Profile</h3>
    <div class="form-group">
      <label>Display Name</label>
      <input type="text" id="s-display-name" class="input" value="${esc(currentUser?.display_name || '')}" aria-label="Display name">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" class="input" value="${esc(currentUser?.email || '')}" disabled>
    </div>
    <hr style="border-color:var(--border);margin:1.5rem 0">
    <h3>Change Password</h3>
    <form id="change-pw-form">
      <div class="form-group"><label>Current Password</label><input type="password" name="current_password" class="input" required autocomplete="current-password"></div>
      <div class="form-group"><label>New Password</label><input type="password" name="new_password" class="input" required minlength="8" autocomplete="new-password"></div>
      <button type="submit" class="btn btn-outline">Change Password</button>
    </form>
  `;

  document.getElementById('change-pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post('/api/auth/change-password', { current_password: fd.get('current_password'), new_password: fd.get('new_password') });
      showToast('Password changed', 'success');
      e.target.reset();
    } catch { showToast('Failed to change password', 'error'); }
  });
}

// PO-05: Family / Household management
async function renderSettingsFamily(el) {
  let household = null;
  let persons = [];
  try { household = await api.get('/api/households/current'); } catch {}
  try { persons = await api.get('/api/persons'); if (!Array.isArray(persons)) persons = []; } catch {}

  if (!household) {
    el.innerHTML = `
      <h3>Household</h3>
      <p class="text-muted">No household set up yet.</p>
      <form id="create-hh-form" class="form-row" style="max-width:400px">
        <div class="form-group"><label>Household Name</label><input type="text" name="name" class="input" placeholder="The Sharma Family" required></div>
        <div class="form-group" style="align-self:end"><button type="submit" class="btn btn-primary">Create</button></div>
      </form>
    `;
    document.getElementById('create-hh-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api.post('/api/households', { name: new FormData(e.target).get('name') });
      showToast('Household created!', 'success');
      renderSettings(document.getElementById('content'));
    });
    return;
  }

  let inviteCode = '';
  el.innerHTML = `
    <h3>${esc(household.name)}</h3>
    <p class="text-muted">${(household.members || []).length} account(s) linked</p>

    <div class="invite-section">
      <button class="btn btn-outline btn-sm" id="gen-invite">Generate Invite Link</button>
      <code id="invite-code" class="invite-code" style="display:none"></code>
    </div>

    <h4 style="margin-top:1.5rem">Family Members</h4>
    <div id="persons-list">
      ${persons.map(p => `
        <div class="person-row" data-id="${p.id}">
          <div class="person-info">
            <strong>${esc(p.name)}</strong>
            <span class="text-muted">${p.age ? p.age + 'y' : ''} · ${esc(p.dietary_type || 'veg')} · Spice ${p.spice_level || 3}/5</span>
          </div>
          <div class="person-actions">
            <button class="btn btn-text btn-sm person-edit" data-id="${p.id}" aria-label="Edit ${esc(p.name)}"><span class="material-icons-round">edit</span></button>
            <button class="btn btn-text btn-sm person-delete" data-id="${p.id}" aria-label="Delete ${esc(p.name)}"><span class="material-icons-round">delete</span></button>
          </div>
        </div>
      `).join('')}
    </div>

    <h4 style="margin-top:1.5rem">Add Member</h4>
    <form id="add-person-form">
      <div class="form-row">
        <div class="form-group"><label>Name</label><input type="text" name="name" class="input" required></div>
        <div class="form-group"><label>Age</label><input type="number" name="age" class="input" min="1" max="120"></div>
        <div class="form-group"><label>Diet</label>
          <select name="dietary_type" class="input">
            <option value="veg">Veg</option><option value="non-veg">Non-veg</option><option value="vegan">Vegan</option><option value="jain">Jain</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Spice (1-5)</label><input type="number" name="spice_level" class="input" min="1" max="5" value="3"></div>
        <div class="form-group"><label>Sugar (1-5)</label><input type="number" name="sugar_preference" class="input" min="1" max="5" value="3"></div>
        <div class="form-group" style="align-self:end"><button type="submit" class="btn btn-primary">Add</button></div>
      </div>
    </form>
  `;

  document.getElementById('gen-invite')?.addEventListener('click', async () => {
    try {
      const res = await api.post('/api/households/invite');
      const codeEl = document.getElementById('invite-code');
      codeEl.textContent = res.code || 'Error';
      codeEl.style.display = 'block';
    } catch { showToast('Failed to generate invite', 'error'); }
  });

  document.getElementById('add-person-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api.post('/api/persons', { name: fd.get('name'), age: parseInt(fd.get('age')) || null, dietary_type: fd.get('dietary_type'), spice_level: parseInt(fd.get('spice_level')) || 3, sugar_preference: parseInt(fd.get('sugar_preference')) || 3 });
    showToast('Member added!', 'success');
    renderSettings(document.getElementById('content'));
  });

  el.querySelectorAll('.person-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = persons.find(x => x.id === parseInt(btn.dataset.id));
      if (!p) return;
      showModal(`
        <h2>Edit ${esc(p.name)}</h2>
        <form id="edit-person-form">
          <div class="form-group"><label>Name</label><input type="text" name="name" class="input" value="${esc(p.name)}" required></div>
          <div class="form-row">
            <div class="form-group"><label>Age</label><input type="number" name="age" class="input" value="${p.age || ''}" min="1" max="120"></div>
            <div class="form-group"><label>Diet</label>
              <select name="dietary_type" class="input">
                ${['veg','non-veg','vegan','jain'].map(d => `<option value="${d}" ${p.dietary_type === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Spice (1-5)</label><input type="number" name="spice_level" class="input" value="${p.spice_level || 3}" min="1" max="5"></div>
            <div class="form-group"><label>Sugar (1-5)</label><input type="number" name="sugar_preference" class="input" value="${p.sugar_preference || 3}" min="1" max="5"></div>
          </div>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
      `);
      document.getElementById('edit-person-form')?.addEventListener('submit', async (e2) => {
        e2.preventDefault();
        const fd2 = new FormData(e2.target);
        await api.put(`/api/persons/${p.id}`, { name: fd2.get('name'), age: parseInt(fd2.get('age')) || null, dietary_type: fd2.get('dietary_type'), spice_level: parseInt(fd2.get('spice_level')) || 3, sugar_preference: parseInt(fd2.get('sugar_preference')) || 3 });
        closeModal(); showToast('Updated', 'success'); renderSettings(document.getElementById('content'));
      });
    });
  });

  el.querySelectorAll('.person-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this family member?')) return;
      await api.del(`/api/persons/${btn.dataset.id}`);
      showToast('Removed', 'success');
      renderSettings(document.getElementById('content'));
    });
  });
}

// PO-06: Festival configuration
async function renderSettingsFestivals(el) {
  let festivals = [];
  let persons = [];
  let upcoming = [];
  try { festivals = await api.get('/api/festivals'); if (!Array.isArray(festivals)) festivals = []; } catch {}
  try { persons = await api.get('/api/persons'); if (!Array.isArray(persons)) persons = []; } catch {}
  try { upcoming = await api.get('/api/festivals/upcoming'); if (!Array.isArray(upcoming)) upcoming = []; } catch {}

  el.innerHTML = `
    <h3>Festival Configuration</h3>
    ${upcoming.length ? `
      <div class="upcoming-festivals">
        <h4>Upcoming Festivals</h4>
        ${upcoming.slice(0, 5).map(f => `
          <div class="festival-upcoming-row">
            <span>${esc(f.name)}${f.name_hindi ? ` (${esc(f.name_hindi)})` : ''}</span>
            <span class="text-muted">${f.next_date || ''}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${persons.length ? `
      <h4 style="margin-top:1.5rem">Toggle festivals per member</h4>
      ${persons.map(p => `
        <details class="festival-person-block">
          <summary>${esc(p.name)} <span class="text-muted">(${p.dietary_type || 'veg'})</span></summary>
          <div class="festival-checkboxes" data-person-id="${p.id}">
            ${festivals.map(f => `
              <label class="checkbox-label">
                <input type="checkbox" class="fest-toggle" data-person="${p.id}" data-festival="${f.id}" ${(p.festivals || []).some(pf => pf.id === f.id) ? 'checked' : ''}>
                ${esc(f.name)}
              </label>
            `).join('')}
            <button class="btn btn-sm btn-outline save-festivals-btn" data-person="${p.id}" style="margin-top:0.5rem">Save</button>
          </div>
        </details>
      `).join('')}
    ` : '<p class="text-muted">Add family members first to configure festivals.</p>'}
  `;

  el.querySelectorAll('.save-festivals-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const personId = btn.dataset.person;
      const checkboxes = el.querySelectorAll(`.fest-toggle[data-person="${personId}"]`);
      const festivalIds = [];
      checkboxes.forEach(cb => { if (cb.checked) festivalIds.push(parseInt(cb.dataset.festival)); });
      try {
        await api.put(`/api/persons/${personId}/festivals`, { festival_ids: festivalIds });
        showToast('Festivals updated', 'success');
      } catch { showToast('Failed to save', 'error'); }
    });
  });
}

// Notifications tab
async function renderSettingsNotifications(el) {
  let prefs = {};
  try { prefs = await api.get('/api/notifications/preferences'); } catch {}

  el.innerHTML = `
    <h3>Notification Preferences</h3>
    <form id="notif-form">
      ${['meal_reminder','expiry_alert','poll_created','shopping_reminder'].map(key => `
        <label class="checkbox-label">
          <input type="checkbox" name="${key}" ${prefs[key] ? 'checked' : ''}>
          ${capitalize(key.replace(/_/g, ' '))}
        </label>
      `).join('')}
      <button type="submit" class="btn btn-primary" style="margin-top:1rem">Save</button>
    </form>
  `;

  document.getElementById('notif-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    ['meal_reminder','expiry_alert','poll_created','shopping_reminder'].forEach(k => { body[k] = fd.has(k); });
    try { await api.put('/api/notifications/preferences', body); showToast('Saved', 'success'); } catch { showToast('Failed', 'error'); }
  });
}

// AI tab
async function renderSettingsAI(el) {
  let config = {};
  try { config = await api.get('/api/ai/config'); } catch {}

  el.innerHTML = `
    <h3>AI Configuration</h3>
    <form id="ai-form">
      <div class="form-group"><label>Provider</label>
        <select name="provider" class="input">
          <option value="openai" ${config.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="anthropic" ${config.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          <option value="ollama" ${config.provider === 'ollama' ? 'selected' : ''}>Ollama (local)</option>
        </select>
      </div>
      <div class="form-group"><label>API Key</label><input type="password" name="api_key" class="input" value="${config.api_key ? '••••••••' : ''}" placeholder="Enter API key" autocomplete="off"></div>
      <div class="form-group"><label>Model</label><input type="text" name="model" class="input" value="${esc(config.model || '')}" placeholder="e.g. gpt-4o-mini"></div>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
  `;

  document.getElementById('ai-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { provider: fd.get('provider'), model: fd.get('model') || '' };
    const key = fd.get('api_key');
    if (key && !key.startsWith('••')) body.api_key = key;
    try { await api.put('/api/ai/config', body); showToast('AI config saved', 'success'); } catch { showToast('Failed', 'error'); }
  });
}

// Data tab
async function renderSettingsData(el) {
  el.innerHTML = `
    <h3>Data Management</h3>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
      <button class="btn btn-outline" id="data-export"><span class="material-icons-round">download</span> Export Data</button>
      <button class="btn btn-outline" id="data-backup"><span class="material-icons-round">backup</span> Create Backup</button>
    </div>
  `;

  document.getElementById('data-export')?.addEventListener('click', async () => {
    try {
      const data = await api.get('/api/data/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `mealflow-export-${today()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Export failed', 'error'); }
  });

  document.getElementById('data-backup')?.addEventListener('click', async () => {
    try { await api.post('/api/data/backup'); showToast('Backup created', 'success'); } catch { showToast('Backup failed', 'error'); }
  });
}

// Theme tab
function renderSettingsTheme(el) {
  el.innerHTML = `
    <h3>Theme</h3>
    <p class="text-muted">Midnight theme is the default and only available theme.</p>
    <div class="theme-preview">
      <div class="theme-card active">
        <div class="theme-swatch" style="background:var(--bg-primary);border:2px solid var(--accent)"></div>
        <span>Midnight</span>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════
// PO-08: Pantry Management
// ════════════════════════════════════════════════════
async function renderPantry(el) {
  let items = [];
  let expiring = [];
  try { items = await api.get('/api/pantry'); if (!Array.isArray(items)) items = []; } catch {}
  try { expiring = await api.get('/api/pantry/expiring'); if (!Array.isArray(expiring)) expiring = []; } catch {}

  const expiringIds = new Set(expiring.map(e => e.id));

  el.innerHTML = `
    <div class="view-header">
      <h2>Pantry</h2>
      <button class="btn btn-primary" id="pantry-add-btn">+ Add Item</button>
    </div>

    ${items.length ? `
      <div class="pantry-list">
        ${items.map(item => {
          const isExpiring = expiringIds.has(item.id);
          const isLow = item.quantity !== null && item.quantity !== undefined && item.low_threshold && item.quantity <= item.low_threshold;
          return `
            <div class="pantry-item">
              <div class="pantry-item-info">
                <strong>${esc(item.name)}</strong>
                ${isExpiring ? '<span class="badge badge-warning">Expiring soon</span>' : ''}
                ${isLow ? '<span class="badge badge-error">Running low</span>' : ''}
              </div>
              <div class="pantry-item-meta">
                <span>${item.quantity != null ? item.quantity : '—'} ${esc(item.unit || '')}</span>
                ${item.expiry_date ? `<span class="text-muted">Exp: ${fmtDate(item.expiry_date)}</span>` : ''}
              </div>
              <div class="pantry-item-actions">
                <button class="btn btn-text btn-sm pantry-edit" data-id="${item.id}" aria-label="Edit ${esc(item.name)}"><span class="material-icons-round">edit</span></button>
                <button class="btn btn-text btn-sm pantry-use" data-id="${item.id}" aria-label="Mark used ${esc(item.name)}"><span class="material-icons-round">check_circle</span></button>
                <button class="btn btn-text btn-sm pantry-del" data-id="${item.id}" aria-label="Delete ${esc(item.name)}"><span class="material-icons-round">delete</span></button>
              </div>
            </div>`;
        }).join('')}
      </div>
    ` : emptyState('kitchen', 'Your pantry is empty', '+ Add Item', () => document.getElementById('pantry-add-btn')?.click())}
  `;

  document.getElementById('pantry-add-btn')?.addEventListener('click', () => showPantryForm());

  el.querySelectorAll('.pantry-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = items.find(i => i.id === parseInt(btn.dataset.id));
      if (item) showPantryForm(item);
    });
  });

  el.querySelectorAll('.pantry-use').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.put(`/api/pantry/${btn.dataset.id}`, { quantity: 0 });
      showToast('Marked as used up', 'success');
      await render();
    });
  });

  el.querySelectorAll('.pantry-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this pantry item?')) return;
      await api.del(`/api/pantry/${btn.dataset.id}`);
      showToast('Removed', 'success');
      await render();
    });
  });
}

function showPantryForm(item = null) {
  showModal(`
    <h2>${item ? 'Edit Pantry Item' : 'Add Pantry Item'}</h2>
    <form id="pantry-form">
      <div class="form-group"><label>Name</label><input type="text" name="name" class="input" value="${item ? esc(item.name) : ''}" required ${item ? 'disabled' : ''}></div>
      <div class="form-row">
        <div class="form-group"><label>Quantity</label><input type="number" name="quantity" class="input" value="${item?.quantity ?? ''}" min="0" step="any"></div>
        <div class="form-group"><label>Unit</label><input type="text" name="unit" class="input" value="${esc(item?.unit || 'g')}" placeholder="g, ml, pcs"></div>
      </div>
      <div class="form-group"><label>Expiry Date</label><input type="date" name="expiry_date" class="input" value="${item?.expiry_date || ''}"></div>
      <button type="submit" class="btn btn-primary">${item ? 'Save' : 'Add'}</button>
    </form>
  `);

  document.getElementById('pantry-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { quantity: parseFloat(fd.get('quantity')) || 0, unit: fd.get('unit') || 'g', expiry_date: fd.get('expiry_date') || null };
    if (!item) body.name = fd.get('name');
    try {
      if (item) await api.put(`/api/pantry/${item.id}`, body);
      else await api.post('/api/pantry', body);
      closeModal(); showToast(item ? 'Updated' : 'Added', 'success'); await render();
    } catch { showToast('Failed', 'error'); }
  });
}

// ════════════════════════════════════════════════════
// PO-07: Polls / Voting UI
// ════════════════════════════════════════════════════
async function renderPolls(el) {
  let polls = [];
  try { polls = await api.get('/api/polls'); if (!Array.isArray(polls)) polls = []; } catch {}

  el.innerHTML = `
    <div class="view-header">
      <h2>Polls</h2>
      <button class="btn btn-primary" id="create-poll-btn">+ New Poll</button>
    </div>
    ${polls.length ? polls.map(p => `
      <div class="poll-card" data-poll-id="${p.id}">
        <div class="poll-header">
          <h3>${esc(p.question)}</h3>
          <span class="badge ${p.status === 'open' ? 'badge-success' : 'badge-muted'}">${p.status}</span>
        </div>
        ${p.options ? `
          <div class="poll-options">
            ${(Array.isArray(p.options) ? p.options : []).map(o => `
              <div class="poll-option">
                <span>${esc(o.label || o.name || o.recipe_name || '')}</span>
                <div class="poll-vote-bar-wrapper">
                  <div class="poll-vote-bar" style="width:${o.vote_count ? Math.min(o.vote_count * 20, 100) : 0}%"></div>
                  <span class="poll-vote-count">${o.vote_count || 0} votes</span>
                </div>
                ${p.status === 'open' ? `<button class="btn btn-sm btn-outline poll-cast-vote" data-poll="${p.id}" data-option="${o.id}">Vote</button>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="poll-actions">
          ${p.status === 'open' ? `<button class="btn btn-sm btn-outline poll-close-btn" data-poll="${p.id}">Close Poll</button>` : ''}
          ${p.status === 'closed' ? `<button class="btn btn-sm btn-primary poll-apply-btn" data-poll="${p.id}">Apply Winner</button>` : ''}
        </div>
      </div>
    `).join('') : emptyState('how_to_vote', 'No polls yet. Ask your family what to eat!', '+ Create Poll', () => document.getElementById('create-poll-btn')?.click())}
  `;

  document.getElementById('create-poll-btn')?.addEventListener('click', () => showCreatePollModal());

  el.querySelectorAll('.poll-cast-vote').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.post(`/api/polls/${btn.dataset.poll}/vote`, { option_id: parseInt(btn.dataset.option) });
        showToast('Vote cast!', 'success'); await render();
      } catch { showToast('Failed to vote', 'error'); }
    });
  });

  el.querySelectorAll('.poll-close-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.post(`/api/polls/${btn.dataset.poll}/close`);
      showToast('Poll closed', 'success'); await render();
    });
  });

  el.querySelectorAll('.poll-apply-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.post(`/api/polls/${btn.dataset.poll}/apply`);
        showToast('Winner applied to meal plan!', 'success'); await render();
      } catch { showToast('Failed to apply', 'error'); }
    });
  });
}

async function showCreatePollModal() {
  let recipeList = [];
  try { recipeList = await api.get('/api/recipes'); } catch {}
  if (!Array.isArray(recipeList)) recipeList = [];

  showModal(`
    <h2>Create Poll</h2>
    <form id="poll-form">
      <div class="form-group"><label>Question</label><input type="text" name="question" class="input" placeholder="What should we have for dinner?" required></div>
      <div class="form-group"><label>Date</label><input type="date" name="date" class="input" value="${today()}"></div>
      <div class="form-group"><label>Meal Slot</label>
        <select name="meal_type" class="input">
          ${MEAL_SLOTS.map(s => `<option value="${s}">${SLOT_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Options (select recipes)</label>
        <div class="poll-recipe-options">
          ${recipeList.slice(0, 30).map(r => `
            <label class="checkbox-label"><input type="checkbox" name="recipe_ids" value="${r.id}"> ${esc(r.name)}</label>
          `).join('')}
        </div>
      </div>
      <button type="submit" class="btn btn-primary">Create Poll</button>
    </form>
  `);

  document.getElementById('poll-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const recipe_ids = fd.getAll('recipe_ids').map(Number);
    if (!recipe_ids.length) { showToast('Select at least one recipe', 'error'); return; }
    try {
      await api.post('/api/polls', { question: fd.get('question'), date: fd.get('date'), meal_type: fd.get('meal_type'), recipe_ids });
      closeModal(); showToast('Poll created!', 'success'); currentView = 'polls'; await render();
    } catch { showToast('Failed to create poll', 'error'); }
  });
}

// ════════════════════════════════════════════════════
// PO-10: Meal Template UI
// ════════════════════════════════════════════════════
async function renderTemplates(el) {
  let templates = [];
  try { templates = await api.get('/api/templates'); if (!Array.isArray(templates)) templates = []; } catch {}

  el.innerHTML = `
    <div class="view-header">
      <h2>Meal Templates</h2>
      <button class="btn btn-primary" id="save-template-btn">Save Current Week</button>
    </div>
    ${templates.length ? `
      <div class="template-grid">
        ${templates.map(t => `
          <div class="template-card">
            <h3>${esc(t.name)}</h3>
            <p class="text-muted">${t.meal_count || '?'} meals</p>
            <div class="template-actions">
              <button class="btn btn-sm btn-primary template-apply" data-id="${t.id}">Apply</button>
              <button class="btn btn-sm btn-text template-del" data-id="${t.id}"><span class="material-icons-round">delete</span></button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : emptyState('content_copy', 'No templates saved yet', 'Save Current Week', () => document.getElementById('save-template-btn')?.click())}
  `;

  document.getElementById('save-template-btn')?.addEventListener('click', async () => {
    const name = prompt('Template name:');
    if (!name) return;
    const weekStart = getMonday(new Date());
    const from = fmtDateISO(weekStart);
    const toD = new Date(weekStart); toD.setDate(toD.getDate() + 6);
    try {
      await api.post('/api/templates', { name, date_from: from, date_to: fmtDateISO(toD) });
      showToast('Template saved!', 'success'); await render();
    } catch { showToast('Failed to save template', 'error'); }
  });

  el.querySelectorAll('.template-apply').forEach(btn => {
    btn.addEventListener('click', async () => {
      showModal(`
        <h2>Apply Template</h2>
        <form id="apply-template-form">
          <div class="form-group"><label>Start Date</label><input type="date" name="start_date" class="input" value="${today()}" required></div>
          <button type="submit" class="btn btn-primary">Apply</button>
        </form>
      `);
      document.getElementById('apply-template-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.post(`/api/templates/${btn.dataset.id}/apply`, { start_date: fd.get('start_date') });
          closeModal(); showToast('Template applied!', 'success'); currentView = 'planner'; await render();
        } catch { showToast('Failed to apply', 'error'); }
      });
    });
  });

  el.querySelectorAll('.template-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this template?')) return;
      await api.del(`/api/templates/${btn.dataset.id}`);
      showToast('Deleted', 'success'); await render();
    });
  });
}

// ════════════════════════════════════════════════════
// PO-15: Cooking Timer System
// ════════════════════════════════════════════════════
function startTimer(minutes, label) {
  const id = Date.now();
  let remaining = minutes * 60;
  const timer = { id, label, remaining };

  const interval = setInterval(() => {
    remaining--;
    timer.remaining = remaining;
    updateTimerDisplay();

    if (remaining <= 0) {
      clearInterval(interval);
      activeTimers = activeTimers.filter(t => t.id !== id);
      updateTimerDisplay();
      showToast(`⏰ Timer done: ${label}`, 'success');
      // Try notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('MealFlow Timer', { body: `${label} is done!`, icon: '/manifest.json' });
      }
    }
  }, 1000);

  timer.interval = interval;
  activeTimers.push(timer);
  updateTimerDisplay();

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function updateTimerDisplay() {
  let overlay = document.getElementById('timer-overlay');

  if (!activeTimers.length) {
    if (overlay) overlay.remove();
    return;
  }

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'timer-overlay';
    overlay.className = 'timer-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = activeTimers.map(t => {
    const m = Math.floor(t.remaining / 60);
    const s = t.remaining % 60;
    return `<div class="timer-item"><span class="material-icons-round">timer</span> ${esc(t.label)} <strong>${m}:${String(s).padStart(2, '0')}</strong></div>`;
  }).join('');
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
  showAddMealModal(date, mealType);
};

// ─── Boot ───
document.addEventListener('DOMContentLoaded', init);
