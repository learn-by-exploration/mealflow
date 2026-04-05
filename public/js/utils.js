// ─── MealFlow Utilities ───

/** Escape HTML entities to prevent XSS */
export function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Escape for HTML attributes */
export function escA(s) {
  return esc(s);
}

/** Format minutes to readable time */
export function fmtTime(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Format date as relative */
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff <= 7) return `in ${diff} days`;
  if (diff < 0 && diff >= -7) return `${Math.abs(diff)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format nutrition value */
export function fmtNutrition(val, unit = '') {
  if (val === null || val === undefined) return '—';
  const rounded = Math.round(val * 10) / 10;
  return unit ? `${rounded}${unit}` : String(rounded);
}

/** Get today's date as YYYY-MM-DD */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/** Get date offset from today */
export function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Debounce function */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Capitalize first letter */
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Meal type icon */
export function mealIcon(type) {
  const icons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' };
  return icons[type] || '🍽️';
}

/** Ingredient category icon */
export function categoryIcon(cat) {
  const icons = {
    vegetable: '🥬', fruit: '🍎', grain: '🌾', protein: '🥩',
    dairy: '🧀', fat: '🫒', spice: '🧂', condiment: '🍯',
    beverage: '🥤', other: '📦'
  };
  return icons[cat] || '📦';
}
