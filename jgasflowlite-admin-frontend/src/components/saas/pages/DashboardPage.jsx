// src/components/saas/pages/DashboardPage.jsx
// Platform overview — derived client-side from plans / subscriptions /
// invoices lists (no dedicated stats endpoint needed yet).
import React from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Package,
  CreditCard,
  ReceiptText,
  Banknote,
  ArrowRight,
  Building2,
  HardDrive,
  Database,
  FolderOpen,
  Gauge,
} from "lucide-react";
import {
  saasPlansApi,
  saasSubscriptionsApi,
  saasInvoicesApi,
  saasCompaniesApi,
} from "../../../api/saasApi";
import {
  PageHeader,
  StatCard,
  StatusBadge,
  TableShell,
  Th,
  Td,
  Tr,
  EmptyState,
  fmtMoney,
  fmtDate,
  fmtDuration,
  fmtBytes,
} from "../common";
import TableSkeleton from "../../common/TableSkeleton";
import { canModule } from "../../../utils/saasAuth";

const DashboardPage = () => {
  // A scoped admin may hold /dashboard without /plans etc. — asking anyway
  // would just 403, so each tile's query is gated on its own module.
  const plansQ = useQuery({
    queryKey: ["saas-plans", {}],
    queryFn: () => saasPlansApi.list(),
    placeholderData: keepPreviousData,
    enabled: canModule("plans"),
  });
  const subsQ = useQuery({
    queryKey: ["saas-subscriptions", { page: 1, limit: 100 }],
    queryFn: () => saasSubscriptionsApi.list({ page: 1, limit: 100 }),
    placeholderData: keepPreviousData,
    enabled: canModule("subscriptions"),
  });
  const invoicesQ = useQuery({
    queryKey: ["saas-invoices", { page: 1, limit: 100 }],
    queryFn: () => saasInvoicesApi.list({ page: 1, limit: 100 }),
    placeholderData: keepPreviousData,
    enabled: canModule("invoices"),
  });
  // Platform footprint — sizes every clinic, so it's its own query and never
  // holds up the tiles beside it.
  const storageQ = useQuery({
    queryKey: ["saas-storage-summary"],
    queryFn: () => saasCompaniesApi.storageSummary(),
    enabled: canModule("companies"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const storage = storageQ.data;

  const companiesQ = useQuery({
    queryKey: ["saas-companies", { recent: true }],
    queryFn: () =>
      saasCompaniesApi.list({ page: 1, limit: 6, sort_by: "created_at", sort_order: "DESC" }),
    placeholderData: keepPreviousData,
    retry: false,
    enabled: canModule("companies"),
  });

  const subs = subsQ.data?.items ?? [];
  const invoices = invoicesQ.data?.items ?? [];
  const recentClinics = companiesQ.data?.items ?? [];

  const liveSubs = subs.filter((s) => ["active", "past_due"].includes(s.status));
  // Monthly-normalized revenue from active subs (days≈30/mo baseline)
  const mrr = liveSubs
    .filter((s) => s.status === "active")
    .reduce((sum, s) => {
      const price = Number(s.price || 0);
      const count = Number(s.duration_count || 1);
      const months =
        s.plan_type === "days" ? count / 30 : s.plan_type === "year" ? count * 12 : count;
      return sum + (months > 0 ? price / months : price);
    }, 0);
  const openInvoices = invoices.filter((i) => i.status === "open");
  const paidTotal = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total || 0), 0);

  const recentSubs = subs.slice(0, 6);
  const recentInvoices = invoices.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview — plans, subscriptions and billing"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Package}
          label="Active plans"
          value={plansQ.isLoading ? "…" : (plansQ.data ?? []).filter((p) => p.is_active === 1).length}
          hint={`${(plansQ.data ?? []).length} total`}
        />
        <StatCard
          icon={CreditCard}
          label="Live subscriptions"
          value={subsQ.isLoading ? "…" : liveSubs.length}
          hint={`${subs.length} all-time`}
          tone="sky"
        />
        <StatCard
          icon={Banknote}
          label="MRR (active)"
          value={fmtMoney(mrr)}
          hint="normalized monthly"
          tone="emerald"
        />
        <StatCard
          icon={ReceiptText}
          label="Open invoices"
          value={invoicesQ.isLoading ? "…" : openInvoices.length}
          hint={`${fmtMoney(paidTotal)} collected`}
          tone="amber"
        />
      </div>

      {/* Storage — what every clinic together is holding, against what has
          been allocated to them. */}
      {canModule("companies") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={HardDrive}
            label="Storage used"
            value={storageQ.isLoading ? "…" : fmtBytes(storage?.total_bytes ?? 0)}
            hint={`across ${storage?.clinics ?? 0} clinic${storage?.clinics === 1 ? "" : "s"}`}
            tone="sky"
          />
          <StatCard
            icon={Database}
            label="Database"
            value={storageQ.isLoading ? "…" : fmtBytes(storage?.db_bytes ?? 0)}
            hint={`${(storage?.rows ?? 0).toLocaleString()} rows · estimated`}
          />
          <StatCard
            icon={FolderOpen}
            label="Files"
            value={storageQ.isLoading ? "…" : fmtBytes(storage?.file_bytes ?? 0)}
            hint={`${(storage?.files ?? 0).toLocaleString()} uploaded`}
            tone="emerald"
          />
          <StatCard
            icon={Gauge}
            label="Allocated"
            value={
              storageQ.isLoading
                ? "…"
                : storage?.allocated_mb
                  ? fmtBytes(storage.allocated_mb * 1024 * 1024)
                  : "Unlimited"
            }
            hint={
              storage?.over_quota
                ? `${storage.over_quota} over quota`
                : storage?.near_quota
                  ? `${storage.near_quota} near quota`
                  : "all within quota"
            }
            tone={storage?.over_quota ? "amber" : "primary"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* Column 1 — subscriptions + invoices stacked */}
        <div className="space-y-4">
        {/* Recent subscriptions */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Recent subscriptions
            </h2>
            <Link
              to="/subscriptions"
              className="text-xs font-medium text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {subsQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : recentSubs.length === 0 ? (
            <TableShell>
              <tbody>
                <tr>
                  <td>
                    <EmptyState
                      icon={CreditCard}
                      title="No subscriptions yet"
                      subtitle="Subscribe a clinic to a plan from the Subscriptions page."
                    />
                  </td>
                </tr>
              </tbody>
            </TableShell>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Clinic</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recentSubs.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium whitespace-nowrap">
                      {s.company?.name ?? `Clinic #${s.company_id}`}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="text-gray-800 dark:text-gray-100">{s.plan?.name ?? s.plan_id}</p>
                      <p className="text-[11px] text-gray-400">
                        {fmtMoney(s.price, s.currency)} / {fmtDuration(s.plan_type, s.duration_count)}
                      </p>
                    </Td>
                    <Td><StatusBadge value={s.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>

        {/* Recent invoices */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Recent invoices
            </h2>
            <Link
              to="/invoices"
              className="text-xs font-medium text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {invoicesQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : recentInvoices.length === 0 ? (
            <TableShell>
              <tbody>
                <tr>
                  <td>
                    <EmptyState
                      icon={ReceiptText}
                      title="No invoices yet"
                      subtitle="Invoices are generated automatically when paid subscriptions activate or renew."
                    />
                  </td>
                </tr>
              </tbody>
            </TableShell>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <Tr key={inv.id}>
                    <Td className="whitespace-nowrap">
                      <p className="font-mono text-xs text-gray-800 dark:text-gray-100">{inv.invoice_number}</p>
                      <p className="text-[11px] text-gray-400">
                        {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap font-medium">{fmtMoney(inv.total, inv.currency)}</Td>
                    <Td><StatusBadge value={inv.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>
        </div>

        {/* Column 2 — recently registered clinics */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Recent clinics
            </h2>
            <Link
              to="/clinics"
              className="text-xs font-medium text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {companiesQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : recentClinics.length === 0 ? (
            <TableShell>
              <tbody>
                <tr>
                  <td>
                    <EmptyState
                      icon={Building2}
                      title="No clinics yet"
                      subtitle="Newly registered clinics appear here."
                    />
                  </td>
                </tr>
              </tbody>
            </TableShell>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Clinic</Th>
                  <Th>Status</Th>
                  <Th>Registered</Th>
                </tr>
              </thead>
              <tbody>
                {recentClinics.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <p className="font-medium text-gray-800 dark:text-gray-100">{c.name}</p>
                      <p className="text-[11px] text-gray-400 font-mono">/{c.slug}</p>
                    </Td>
                    <Td><StatusBadge value={c.status} /></Td>
                    <Td className="text-xs whitespace-nowrap">{fmtDate(c.created_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
