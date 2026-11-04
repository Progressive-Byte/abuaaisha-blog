// Static paths for paginated post listings, newest-first and oldest-first:
//   base/            base/page/2/          (newest)
//   base/oldest/     base/oldest/page/2/   (oldest)
import type { Post } from "./posts";
import { pageCount } from "./posts";
import { SITE } from "./site";

export type Sort = "new" | "old";

export interface ListingProps {
  posts: Post[];
  current: number;
  total: number;
  sort: Sort;
}

export function listingPaths<P extends Record<string, string>>(all: Post[], params: P = {} as P) {
  const perPage = SITE.postsPerPage;
  const total = pageCount(all.length, perPage);
  const paths = [];
  for (const sort of ["new", "old"] as const) {
    const ordered = sort === "new" ? all : [...all].reverse();
    for (let n = 1; n <= total; n++) {
      const parts = [sort === "old" ? "oldest" : "", n > 1 ? `page/${n}` : ""].filter(Boolean);
      paths.push({
        params: { ...params, page: parts.length ? parts.join("/") : undefined },
        props: {
          posts: ordered.slice((n - 1) * perPage, n * perPage),
          current: n,
          total,
          sort,
        } satisfies ListingProps,
      });
    }
  }
  return paths;
}
