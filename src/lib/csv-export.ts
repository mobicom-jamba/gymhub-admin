export type CsvColumn = { key: string; label: string };

/**
 * Build an Excel-friendly CSV string (UTF-8 BOM included). Pure — safe to use
 * on the server for download endpoints as well as in the browser.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: CsvColumn[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((row) =>
      cols
        .map((c) => {
          const val = row[c.key];
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",")
    )
    .join("\n");

  return "\uFEFF" + header + "\n" + body; // BOM for Excel UTF-8
}

/**
 * Convert an array of objects to CSV and trigger a download.
 */
export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: CsvColumn[]
) {
  if (rows.length === 0) return;

  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
