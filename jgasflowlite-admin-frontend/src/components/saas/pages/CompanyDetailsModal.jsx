// src/components/saas/pages/CompanyDetailsModal.jsx
// Company "View" modal: profile info + subscription history (plan, price,
// period dates, status) + payment invoices (dates, paid/unpaid, paid date).
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, ReceiptText } from "lucide-react";
import { saasSubscriptionsApi, saasInvoicesApi } from "../../../api/saasApi";
import TableSkeleton from "../../common/TableSkeleton";
import {
  Modal,
  StatusBadge,
  Th,
  Td,
  Tr,
  fmtMoney,
  fmtDate,
  fmtDateTime,
  fmtDuration,
} from "../common";

const InfoItem = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{children || "—"}</p>
  </div>
);

const SectionTitle = ({ icon: Icon, children }) => (
  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-5 mb-2">
    <Icon className="w-3.5 h-3.5" /> {children}
  </h4>
);

const CompanyDetailsModal = ({ company, onClose }) => {
  const open = !!company;

  const subsQ = useQuery({
    queryKey: ["company-subscriptions", company?.id],
    queryFn: () =>
      saasSubscriptionsApi.list({ company_id: company.id, limit: 50 }),
    enabled: open,
  });

  const invoicesQ = useQuery({
    queryKey: ["company-invoices", company?.id],
    queryFn: () => saasInvoicesApi.list({ company_id: company.id, limit: 50 }),
    enabled: open,
  });

  const subs = subsQ.data?.items ?? [];
  const invoices = invoicesQ.data?.items ?? [];

  const paidTotal = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total || 0), 0);
  const unpaidTotal = invoices
    .filter((i) => i.status === "open")
    .reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={company ? `${company.name}` : ""} wide>
      {company && (
        <div>
          {/* Profile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 p-4">
            <InfoItem label="Slug">/{company.slug}</InfoItem>
            <InfoItem label="Status">
              <StatusBadge value={company.status} />
            </InfoItem>
            <InfoItem label="Onboarded">{fmtDate(company.onboarded_at)}</InfoItem>
            <InfoItem label="Email">{company.email}</InfoItem>
            <InfoItem label="Phone">{company.phone}</InfoItem>
            <InfoItem label="Currency / TZ">
              {company.currency} · {company.time_zone}
            </InfoItem>
          </div>

          {/* Billing summary */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm flex justify-between">
              <span className="text-emerald-700 dark:text-emerald-300">Paid</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                {fmtMoney(paidTotal, company.currency)}
              </span>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm flex justify-between">
              <span className="text-amber-700 dark:text-amber-300">Unpaid</span>
              <span className="font-bold text-amber-700 dark:text-amber-300">
                {fmtMoney(unpaidTotal, company.currency)}
              </span>
            </div>
          </div>

          {/* Subscriptions / plans */}
          <SectionTitle icon={CreditCard}>Plans & subscriptions</SectionTitle>
          {subsQ.isLoading ? (
            <TableSkeleton rows={2} />
          ) : subs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No subscriptions yet.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Plan</Th>
                    <Th>Price</Th>
                    <Th>Start date</Th>
                    <Th>End date</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-medium">{s.plan?.name ?? `#${s.plan_id}`}</Td>
                      <Td className="text-xs">
                        {fmtMoney(s.price, s.currency)}
                        <span className="text-gray-400">
                          {" "}
                          / {fmtDuration(s.plan_type, s.duration_count)}
                        </span>
                      </Td>
                      <Td className="text-xs">{fmtDate(s.current_period_start)}</Td>
                      <Td className="text-xs">{fmtDate(s.current_period_end)}</Td>
                      <Td>
                        <StatusBadge value={s.status} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payments / invoices */}
          <SectionTitle icon={ReceiptText}>Payments</SectionTitle>
          {invoicesQ.isLoading ? (
            <TableSkeleton rows={2} />
          ) : invoices.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No invoices yet.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Period</Th>
                    <Th>Total</Th>
                    <Th>Due date</Th>
                    <Th>Status</Th>
                    <Th>Paid at</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <Tr key={inv.id}>
                      <Td className="font-mono text-xs">{inv.invoice_number}</Td>
                      <Td className="text-xs whitespace-nowrap">
                        {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                      </Td>
                      <Td className="font-semibold">{fmtMoney(inv.total, inv.currency)}</Td>
                      <Td className="text-xs">{fmtDate(inv.due_date)}</Td>
                      <Td>
                        <StatusBadge value={inv.status === "open" ? "unpaid" : inv.status} />
                      </Td>
                      <Td className="text-xs">
                        {inv.paid_at ? (
                          <>
                            {fmtDateTime(inv.paid_at)}
                            {inv.payment_method && (
                              <span className="block text-[10px] text-gray-400">
                                {inv.payment_method}
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default React.memo(CompanyDetailsModal);
