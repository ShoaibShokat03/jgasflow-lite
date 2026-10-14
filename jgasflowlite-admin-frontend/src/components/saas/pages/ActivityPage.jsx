// src/components/saas/pages/ActivityPage.jsx
// Everything that happened to shop accounts: sign ups, payments, plan changes, support logins.
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, ShieldCheck } from "lucide-react";
import { platformApi } from "../../../api/saasApi";
import { fmtDateTime, fmtAgo, PageHeader, EmptyState, BtnGhost } from "../common";
import { Loading, ErrorBox, Select, EVENT_LABELS, eventLabel, eventDot } from "../kit";

const PAGE = 50;

const ActivityPage = () => {
  const [kind, setKind] = useState("");
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["events"],
    queryFn: ({ pageParam }) => platformApi.events({ limit: PAGE, before: pageParam || undefined }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  });

  const rows = useMemo(() => (data?.pages.flat() || []).filter((e) => !kind || e.action === kind), [data, kind]);

  // Group by day for an easy read.
  const groups = useMemo(() => {
    const out = [];
    for (const e of rows) {
      const day = new Date(e.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader title="Activity log" subtitle="Sign ups, payments, plan changes and every console action">
        <Select
          className="w-56"
          value={kind}
          onChange={setKind}
          options={[{ value: "", label: "Everything" }, ...Object.entries(EVENT_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </PageHeader>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <EmptyState icon={History} title="Nothing here yet" subtitle={kind ? "No entries of this kind in what is loaded." : undefined} />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.day}</h2>
              {g.items.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${eventDot(e.action)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-100">
                      <Link to={`/shops/${e.tenant_id}`} className="font-semibold hover:underline">{e.shop_name}</Link>
                      <span className="text-gray-400">: </span>
                      <span className="font-medium">{eventLabel(e.action)}</span>
                      {e.detail && <span className="text-gray-500">, {e.detail}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1">
                      {fmtDateTime(e.created_at)}
                      {e.by_name && (
                        <>
                          <span>, by {e.by_name}</span>
                          {!!e.by_admin && <ShieldCheck className="w-3 h-3 text-primary-500" title="Console admin" />}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtAgo(e.created_at)}</span>
                </div>
              ))}
            </section>
          ))}
          {hasNextPage && (
            <div className="flex justify-center">
              <BtnGhost onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading..." : "Load older entries"}
              </BtnGhost>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
