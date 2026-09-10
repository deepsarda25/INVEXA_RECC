import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

type NewsItem = {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string | null;
  thumbnail: string | null;
};

export function NewsPanel({ ticker }: { ticker: string }) {
  const query = useQuery({
    queryKey: ["news", ticker],
    queryFn: () => apiFetch<{ results: NewsItem[] }>(`/stocks/${ticker}/news`),
    staleTime: 10 * 60 * 1000,
    retry: false
  });

  const items = query.data?.results ?? [];

  return (
    <div className="card" style={{ height: "100%" }}>
      <div className="card-header">
        <h2 className="title-sm">News</h2>
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Latest on {ticker}</span>
      </div>

      {query.isLoading ? (
        <div style={{ color: "var(--text-3)", padding: "1rem 0" }}>Loading news…</div>
      ) : items.length === 0 ? (
        <p className="muted" style={{ padding: "0.5rem 0" }}>No recent news found for this stock.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "520px", overflowY: "auto" }}>
          {items.map((item, idx) => (
            <a
              key={idx}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", gap: "0.75rem", textDecoration: "none", color: "inherit", paddingBottom: "0.85rem", borderBottom: "1px solid var(--outline-variant)" }}
            >
              {item.thumbnail && (
                <img src={item.thumbnail} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "0.4rem", flexShrink: 0 }} />
              )}
              <div>
                <div className="body-sm" style={{ color: "var(--on-surface)", lineHeight: 1.4 }}>{item.title}</div>
                <div className="label-sm" style={{ color: "var(--text-3)", marginTop: "0.35rem" }}>
                  {item.publisher}
                  {item.publishedAt && ` · ${new Date(item.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
