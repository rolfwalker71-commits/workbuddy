/**
 * Graph OData query builder.
 *
 * Several Teams list APIs reject `$top` (and sometimes all OData options)
 * with 400: "Query option 'Top' is not allowed".
 * Only set `allowTop` when the Graph docs list `$top` for that operation.
 */
export type GraphODataQuery = {
  select?: string;
  expand?: string;
  top?: number;
  allowTop?: boolean;
};

export function graphODataQuery(input: GraphODataQuery): string {
  const qs = new URLSearchParams();
  const select = input.select?.trim();
  const expand = input.expand?.trim();
  if (select) qs.set("$select", select);
  if (expand) qs.set("$expand", expand);
  if (input.allowTop && input.top != null && Number.isFinite(input.top)) {
    qs.set("$top", String(Math.trunc(input.top)));
  }
  return qs.toString();
}

export function graphPath(path: string, query = ""): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  return query ? `${base}?${query}` : base;
}
