export interface RecipeTarget {
  id?: string | null;
  name: string;
  quantity?: number;
}

/** Keep identity separate from the display/search label, which may be shared. */
export function recipeItemHref({ id, name, quantity }: RecipeTarget): string {
  const params = new URLSearchParams();
  if (id) params.set("item", id);
  params.set("q", name.replace(/§[0-9a-fk-or]/gi, "").trim());
  if (quantity !== undefined && Number.isFinite(quantity) && quantity > 0) {
    params.set("qty", String(Math.ceil(quantity)));
  }
  return `/recipes?${params}`;
}
