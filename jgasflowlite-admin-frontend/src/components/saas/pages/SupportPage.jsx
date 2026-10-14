// src/components/saas/pages/SupportPage.jsx
// Support inbox: messages shops send from Help & support, with screenshots, and our replies.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Headset, Search, Send, CheckCircle2, RotateCcw, Store, Phone } from "lucide-react";
import { supportApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { useToast } from "../../common/Toast";
import { fmtAgo, fmtDateTime, inputCls, PageHeader, EmptyState, BtnPrimary, BtnGhost } from "../common";
import { Loading, ErrorBox, Pager } from "../kit";
import { Proofs, ShotPicker } from "../attach";

const TABS = [
  { value: "open", label: "Waiting" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];
const TOPIC = { problem: "Problem", payment: "Payment", question: "Question", feature: "Suggestion", other: "Other" };
const STATUS_CLS = {
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  answered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  closed: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};
const STATUS_LABEL = { open: "Waiting", answered: "Answered", closed: "Closed" };

const Badge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
);

/** One request: the thread and the reply box. */
const Thread = ({ id, onChanged }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: r, isLoading, error, refetch } = useQuery({ queryKey: ["support", id], queryFn: () => supportApi.get(id) });
  const [msg, setMsg] = useState("");
  const [shots, setShots] = useState([]);
  useEffect(() => {
    setMsg("");
    setShots([]);
  }, [id]);

  const done = (m) => () => {
    toast.success(m);
    qc.invalidateQueries({ queryKey: ["support"] });
    qc.invalidateQueries({ queryKey: ["support-inbox"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    onChanged?.();
  };
  const reply = useMutation({
    mutationFn: (status) => supportApi.reply(id, msg.trim(), shots, status),
    onSuccess: () => {
      setMsg("");
      setShots([]);
      done("Reply sent")();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: (s) => supportApi.setStatus(id, s),
    onSuccess: (_, s) => done(s === "closed" ? "Request closed" : "Request reopened")(),
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  const canSend = msg.trim().length > 0 || shots.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white [overflow-wrap:anywhere]">
              #{r.id} {r.subject}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <Link to={`/shops/${r.tenant_id}`} className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
                <Store className="w-3.5 h-3.5" /> {r.shop_name}
              </Link>
              {r.shop_phone && (
                <a href={`tel:${r.shop_phone}`} className="inline-flex items-center gap-1 hover:underline">
                  <Phone className="w-3.5 h-3.5" /> {r.shop_phone}
                </a>
              )}
              <span>{TOPIC[r.topic] || r.topic}</span>
              <span>by {r.opened_by || "shop"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge status={r.status} />
            {r.status === "closed" ? (
              <BtnGhost className="px-2.5 py-1.5 text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate("open")}>
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </BtnGhost>
            ) : (
              <BtnGhost className="px-2.5 py-1.5 text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate("closed")}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Close
              </BtnGhost>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {r.thread.map((m) => (
          <div key={m.id} className={`flex ${m.from_admin ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 ${
                m.from_admin
                  ? "bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800"
                  : "bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700"
              }`}
            >
              <div className="text-[11px] font-semibold text-gray-500 mb-0.5">
                {m.from_admin ? `${m.author || "Admin"} (JGasFlow)` : m.author || r.shop_name} · {fmtDateTime(m.created_at)}
              </div>
              {m.body && <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line [overflow-wrap:anywhere]">{m.body}</div>}
              {m.files > 0 && (
                <div className="mt-2">
                  <Proofs base={`${supportApi.fileUrl(m.id)}`} count={m.files} size={72} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
        <textarea
          rows={3}
          maxLength={3000}
          className={inputCls}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={r.status === "closed" ? "Writing reopens the request for the shop" : "Write your reply to the shop"}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ShotPicker files={shots} onChange={setShots} />
          <div className="flex gap-2">
            <BtnGhost disabled={!canSend || reply.isPending} onClick={() => reply.mutate("closed")}>
              Reply and close
            </BtnGhost>
            <BtnPrimary disabled={!canSend || reply.isPending} onClick={() => reply.mutate(undefined)}>
              <Send className="w-4 h-4" /> {reply.isPending ? "Sending..." : "Send reply"}
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
};

const SupportPage = () => {
  const [status, setStatus] = useState("open");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(term.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["support-inbox", status, q, page],
    queryFn: () => supportApi.inbox({ status, q, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Support inbox" subtitle="Messages shops send from Help and support, with their screenshots" />

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                status === t.value ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
              {t.value !== "all" && data?.counts?.[t.value] ? <span className="ml-1.5 text-xs text-gray-400">{data.counts[t.value]}</span> : null}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Shop, phone or subject" className={`${inputCls} pl-9`} />
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            {data.items.length === 0 ? (
              <EmptyState icon={Headset} title={status === "open" ? "Nothing waiting" : "No messages here"} subtitle="Shops write from Help and support in the app." />
            ) : (
              data.items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`w-full text-left px-4 py-3 border-t first:border-t-0 border-gray-100 dark:border-gray-700/60 transition-colors ${
                    selected === r.id ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">{r.shop_name}</span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtAgo(r.updated_at)}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                    #{r.id} {r.subject}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 truncate">{r.last_message}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {r.status === "open" && r.last_from === "shop" && <span className="w-2 h-2 rounded-full bg-amber-500" title="Waiting for us" />}
                      <Badge status={r.status} />
                    </span>
                  </div>
                </button>
              ))
            )}
            {data.total > 0 && <Pager page={data.page} totalPages={data.total_pages} total={data.total} noun="requests" onPage={setPage} />}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 lg:sticky lg:top-0 h-[70vh] min-h-[420px] overflow-hidden">
            {selected ? (
              <Thread id={selected} />
            ) : (
              <EmptyState icon={Headset} title="Choose a message" subtitle="Pick a request on the left to read it and reply." />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportPage;
