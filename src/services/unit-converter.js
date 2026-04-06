/**
 * Indian unit conversions service.
 * Converts traditional Indian kitchen measurements to metric units.
 */

const UNIT_CONVERSIONS = {
  katori: { to_ml: 150, to_g: 150, description: 'Bowl (~150ml)' },
  chammach: { to_ml: 15, to_g: 15, description: 'Tablespoon (~15ml)' },
  mutthi: { to_ml: null, to_g: 30, description: 'Handful (~30g)' },
  'chai-chammach': { to_ml: 5, to_g: 5, description: 'Teaspoon (~5ml)' },
  glass: { to_ml: 250, to_g: 250, description: 'Glass (~250ml)' },
  plate: { to_ml: null, to_g: 200, description: 'Plate (~200g)' },
  // Standard metric aliases
  tsp: { to_ml: 5, to_g: 5, description: 'Teaspoon (~5ml)' },
  tbsp: { to_ml: 15, to_g: 15, description: 'Tablespoon (~15ml)' },
  cup: { to_ml: 250, to_g: 250, description: 'Cup (~250ml)' },
};

const METRIC_UNITS = ['ml', 'l', 'g', 'kg'];

/**
 * Convert between units.
 * @param {string} from - Source unit
 * @param {string} to - Target unit (ml, g, l, kg, or any Indian unit)
 * @param {number} amount - Amount to convert
 * @returns {{ result: number, from: string, to: string, amount: number } | null}
 */
function convert(from, to, amount) {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  if (amount < 0) return null;

  // Same unit
  if (fromLower === toLower) return { result: amount, from, to, amount };

  // Metric to metric
  if (fromLower === 'ml' && toLower === 'l') return { result: amount / 1000, from, to, amount };
  if (fromLower === 'l' && toLower === 'ml') return { result: amount * 1000, from, to, amount };
  if (fromLower === 'g' && toLower === 'kg') return { result: amount / 1000, from, to, amount };
  if (fromLower === 'kg' && toLower === 'g') return { result: amount * 1000, from, to, amount };

  // Indian unit to metric
  const fromConv = UNIT_CONVERSIONS[fromLower];
  if (fromConv) {
    if (toLower === 'ml' && fromConv.to_ml != null) {
      return { result: amount * fromConv.to_ml, from, to, amount };
    }
    if (toLower === 'g' && fromConv.to_g != null) {
      return { result: amount * fromConv.to_g, from, to, amount };
    }
    if (toLower === 'l' && fromConv.to_ml != null) {
      return { result: (amount * fromConv.to_ml) / 1000, from, to, amount };
    }
    if (toLower === 'kg' && fromConv.to_g != null) {
      return { result: (amount * fromConv.to_g) / 1000, from, to, amount };
    }
  }

  // Metric to Indian unit
  const toConv = UNIT_CONVERSIONS[toLower];
  if (toConv) {
    if (fromLower === 'ml' && toConv.to_ml != null) {
      return { result: amount / toConv.to_ml, from, to, amount };
    }
    if (fromLower === 'g' && toConv.to_g != null) {
      return { result: amount / toConv.to_g, from, to, amount };
    }
    if (fromLower === 'l' && toConv.to_ml != null) {
      return { result: (amount * 1000) / toConv.to_ml, from, to, amount };
    }
    if (fromLower === 'kg' && toConv.to_g != null) {
      return { result: (amount * 1000) / toConv.to_g, from, to, amount };
    }
  }

  // Indian to Indian
  if (fromConv && toConv) {
    // Convert via grams if both have g conversion
    if (fromConv.to_g != null && toConv.to_g != null) {
      const grams = amount * fromConv.to_g;
      return { result: grams / toConv.to_g, from, to, amount };
    }
    // Convert via ml if both have ml conversion
    if (fromConv.to_ml != null && toConv.to_ml != null) {
      const ml = amount * fromConv.to_ml;
      return { result: ml / toConv.to_ml, from, to, amount };
    }
  }

  return null;
}

/**
 * List all supported units with their descriptions.
 * @returns {object[]}
 */
function listUnits() {
  const units = [];
  for (const [name, info] of Object.entries(UNIT_CONVERSIONS)) {
    units.push({ name, ...info });
  }
  // Add metric base units
  units.push({ name: 'ml', description: 'Millilitre' });
  units.push({ name: 'l', description: 'Litre' });
  units.push({ name: 'g', description: 'Gram' });
  units.push({ name: 'kg', description: 'Kilogram' });
  return units;
}

module.exports = { convert, listUnits, UNIT_CONVERSIONS, METRIC_UNITS };
