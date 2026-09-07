type PageError = { message: string } | null;

type PageResult<T> = {
  data: T[] | null;
  error: PageError;
};

/**
 * Supabase/PostgREST 1000 мөрийн хязгаарыг давж, хуудсуудыг цөөн зэрэг татна.
 * Unlimited parallel pages saturates Data API; default concurrency is 2.
 */
export async function fetchAllPagesParallel<T>(options: {
  pageSize?: number;
  maxPages?: number;
  concurrency?: number;
  getCount?: () => Promise<{ count: number | null; error: PageError }>;
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>;
}): Promise<{ data: T[]; error: string | null }> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 20;
  const concurrency = Math.max(1, options.concurrency ?? 2);

  const countPromise = options.getCount
    ? options.getCount()
    : Promise.resolve({ count: null as number | null, error: null as PageError });

  const [countRes, first] = await Promise.all([
    countPromise,
    options.fetchPage(0, pageSize - 1),
  ]);

  if (first.error) return { data: [], error: first.error.message };
  const firstRows = first.data ?? [];

  let totalPages = 1;
  if (countRes.count != null && countRes.count >= 0) {
    totalPages = Math.max(1, Math.ceil(countRes.count / pageSize));
  } else if (firstRows.length >= pageSize) {
    // Count байхгүй үед эхний хуудас дүүрэн бол үлдсэнийг долгионоор татна.
    totalPages = maxPages;
  }

  totalPages = Math.min(totalPages, maxPages);

  if (totalPages <= 1 || firstRows.length < pageSize) {
    return { data: firstRows, error: null };
  }

  const all = [...firstRows];
  for (let page = 1; page < totalPages; page += concurrency) {
    const batch = Array.from(
      { length: Math.min(concurrency, totalPages - page) },
      (_, i) => {
        const p = page + i;
        return options.fetchPage(p * pageSize, p * pageSize + pageSize - 1);
      },
    );
    const rest = await Promise.all(batch);
    for (const r of rest) {
      if (r.error) return { data: all, error: r.error.message };
      const rows = r.data ?? [];
      all.push(...rows);
      if (rows.length < pageSize) {
        return { data: all, error: null };
      }
    }
  }
  return { data: all, error: null };
}
