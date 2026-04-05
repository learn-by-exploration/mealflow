const { Router } = require('express');

module.exports = function importRoutes({ db }) {
  const router = Router();

  /**
   * Parse ISO 8601 duration (e.g. PT10M, PT1H30M) to minutes.
   */
  function parseDuration(iso) {
    if (!iso) return 0;
    const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    return hours * 60 + minutes;
  }

  /**
   * Parse an ingredient string like "200g toor dal" into { quantity, unit, name }.
   */
  function parseIngredientString(str) {
    const s = str.trim();
    const match = s.match(/^([\d.\/]+)\s*(g|kg|ml|l|cup|cups|tbsp|tsp|oz|lb|lbs|piece|pieces|nos|bunch|pinch)?\s+(.+)$/i);
    if (match) {
      return { quantity: match[1], unit: (match[2] || '').toLowerCase(), name: match[3].toLowerCase().trim() };
    }
    // Try pattern: "1 tsp turmeric"
    const match2 = s.match(/^([\d.\/]+)\s+(g|kg|ml|l|cup|cups|tbsp|tsp|oz|lb|lbs|piece|pieces|nos|bunch|pinch)\s+(.+)$/i);
    if (match2) {
      return { quantity: match2[1], unit: match2[2].toLowerCase(), name: match2[3].toLowerCase().trim() };
    }
    return { quantity: '', unit: '', name: s.toLowerCase() };
  }

  /**
   * Extract recipe data from JSON-LD in HTML.
   */
  function extractFromJsonLd(html) {
    const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const recipe = Array.isArray(data)
          ? data.find(d => d['@type'] === 'Recipe')
          : (data['@type'] === 'Recipe' ? data : null);
        if (recipe) return recipe;
      } catch {}
    }
    return null;
  }

  /**
   * Fallback: extract name from <h1>.
   */
  function extractNameFromH1(html) {
    const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    return match ? match[1].replace(/<[^>]*>/g, '').trim() : '';
  }

  router.post('/api/recipes/import', (req, res) => {
    const { url, html } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const content = html || '';

    // Try JSON-LD first
    const jsonLd = extractFromJsonLd(content);
    if (jsonLd) {
      const ingredients = (jsonLd.recipeIngredient || []).map(parseIngredientString);
      return res.json({
        name: jsonLd.name || '',
        description: jsonLd.description || '',
        servings: parseInt(jsonLd.recipeYield, 10) || 0,
        prep_time: parseDuration(jsonLd.prepTime),
        cook_time: parseDuration(jsonLd.cookTime),
        ingredients,
      });
    }

    // Fallback: parse H1
    const name = extractNameFromH1(content);
    return res.json({
      name,
      description: '',
      servings: 0,
      prep_time: 0,
      cook_time: 0,
      ingredients: [],
    });
  });

  return router;
};
