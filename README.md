# my Recipes

A personal recipe site for favorites and recipes to try. It is plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages.

Live site (after setup): https://emmaricci.github.io/my-favorite-recipes/

## Files

| File | What it is |
|---|---|
| `index.html` | The single page that loads everything |
| `styles.css` | All styling (colors are defined at the top) |
| `app.js` | Home list, filters, search, recipe pages, ingredient checkboxes |
| `data/recipes.json` | Every recipe |
| `images/` | One photo per recipe, named after the recipe id |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |

## Recipe format

```json
{
  "id": "oatmeal-cups",
  "title": "Oatmeal Cups",
  "status": "favorite",
  "categories": ["breakfast"],
  "vegetarian": true,
  "servings": "9 little cups",
  "time": "40 mins",
  "source": { "label": "IG Choosing Balance", "links": [{ "text": "IG Choosing Balance", "url": "https://..." }] },
  "image": "images/oatmeal-cups.jpg",
  "ingredients": [{ "group": "", "items": ["2 ripe bananas"] }, { "group": "Toppings", "items": ["Jam"] }],
  "directions": [{ "group": "", "steps": ["Preheat oven to 350F."] }],
  "notes": ""
}
```

- `status`: `favorite` or `to-try`
- `categories`: any of `breakfast`, `snack`, `appsides`, `entrees`, `dessert`, `drinks`
- `servings`, `time`, `image` and `notes` are optional; `source.links` can be empty
