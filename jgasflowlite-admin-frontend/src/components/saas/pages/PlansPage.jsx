// src/components/saas/pages/PlansPage.jsx
// Subscription plans — reference list layout (ListShell) with a CARD GRID
// content area. Filters (status / type / search / sort) are server-side.
import React, { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { Package, Plus, SquarePen, Building2, Clock, ShoppingCart, Trash2 } from "lucide-react";
import { saasPlansApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import ConfirmationModal from "../../common/ConfirmationModal";
import { getAdmin, can } from "../../../utils/saasAuth";
import ListShell, { SkeletonCards, filterSelectCls } from "../ListShell";
import {
  Modal,
  Field,
  inputCls,
  BtnPrimary,
  BtnGhost,
  CurrencySelect,
  ToggleSwitch,
  fmtMoney,
  fmtDuration,
} from "../common";

const EMPTY_FORM = {
  name: "",
  slug: "",
  description: "",
  price: "0",
  currency: "PKR",
  plan_type: "month",
  plan_category: "paid",
  duration_count: "1",
  max_branches: "",
  max_users: "",
  max_doctors: "",
  max_patients: "",
  storage_mb: "",
  modules: null, // null = every standard module (add-ons stay off)
  is_active: 1,
  sort_order: "0",
};

const limitOrNull = (v) => (v === "" ? null : Number(v));

/* Slim uppercase divider between the form's sections. */
const SectionHeading = ({ children }) => (
  <p className="col-span-2 mt-1 pb-1 border-b border-gray-100 dark:border-gray-700 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
    {children}
  </p>
);

const toPayload = (f) => ({
  name: f.name.trim(),
  slug: f.slug.trim(),
  description: f.description?.trim() || undefined,
  // free/trial plans are always 0 — the price field is locked in the form
  price: f.plan_category !== "paid" ? 0 : Number(f.price || 0),
  currency: f.currency || "PKR",
  plan_type: f.plan_type,
  plan_category: f.plan_category,
  duration_count: Number(f.duration_count || 1),
  max_branches: limitOrNull(f.max_branches),
  max_users: limitOrNull(f.max_users),
  max_doctors: limitOrNull(f.max_doctors),
  max_patients: limitOrNull(f.max_patients),
  storage_mb: limitOrNull(f.storage_mb),
  modules: f.modules, // null = all modules
  is_active: Number(f.is_active),
  sort_order: Number(f.sort_order || 0),
});

/* Checkbox grid for the feature modules a plan / override includes.
   `value` null = every STANDARD module. Add-ons (`default_off` in the
   catalogue) are sold separately and are only included when ticked, so null
   deliberately does not mean "literally everything". */
export const ModulesChecklist = ({ catalog, value, onChange }) => {
  const all = value === null;
  const set = new Set(value ?? []);
  const defaultOn = catalog.filter((m) => !m.default_off).map((m) => m.key);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-primary-600"
          checked={all}
          onChange={(e) => onChange(e.target.checked ? null : defaultOn)}
        />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          All standard modules included
        </span>
      </label>
      {!all && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
          {catalog.map((m) => (
            <label key={m.key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary-600"
                checked={set.has(m.key)}
                onChange={(e) => {
                  const next = new Set(set);
                  e.target.checked ? next.add(m.key) : next.delete(m.key);
                  onChange([...next]);
                }}
              />
              {m.label}
              {m.default_off ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/20">
                  Add-on
                </span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const DEFAULT_SORT = { sortBy: "sort_order", sortOrder: "ASC" };

const PlansPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const isSuper = getAdmin()?.role === "super_admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', plan? }
  const [confirmDelete, setConfirmDelete] = useState(null); // plan
  const [form, setForm] = useState(EMPTY_FORM);

  const params = useMemo(
    () => ({
      sort_by: sort.sortBy,
      sort_order: sort.sortOrder,
      ...(search.trim() && { search: search.trim() }),
      ...(statusFilter !== "" && { is_active: Number(statusFilter) }),
      ...(typeFilter && { plan_type: typeFilter }),
    }),
    [search, statusFilter, typeFilter, sort],
  );

  const plansQ = useQuery({
    queryKey: ["saas-plans", params],
    queryFn: () => saasPlansApi.list(params),
    placeholderData: keepPreviousData,
  });
  const modulesQ = useQuery({
    queryKey: ["saas-modules-catalog"],
    queryFn: saasPlansApi.modulesCatalog,
    staleTime: 10 * 60_000,
  });
  const moduleCatalog = modulesQ.data?.modules ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["saas-plans"] });

  const createM = useMutation({
    mutationFn: (payload) => saasPlansApi.create(payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Plan created");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Create failed"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }) => saasPlansApi.update(id, payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Plan updated");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Update failed"),
  });

  // Instant activate/deactivate — optimistic cache update, no modal.
  // The switch flips immediately. NO refetch on success: the optimistic
  // value IS the server value, and refetching would dim the list +
  // slide the Updating bar (visible glitch). Only an error rolls back.
  const toggleM = useMutation({
    mutationFn: ({ id, is_active }) => saasPlansApi.update(id, { is_active }),
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ["saas-plans"] });
      const prev = qc.getQueriesData({ queryKey: ["saas-plans"] });
      qc.setQueriesData({ queryKey: ["saas-plans"] }, (old) =>
        Array.isArray(old)
          ? old.map((p) => (p.id === id ? { ...p, is_active } : p))
          : old,
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(e.response?.data?.message || "Status change failed");
    },
  });

  // Hard delete — only offered for plans never purchased; the backend
  // double-checks and returns 409 if any subscription exists.
  const deleteM = useMutation({
    mutationFn: (id) => saasPlansApi.remove(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      toast.success("Plan deleted");
    },
    onError: (e) => {
      setConfirmDelete(null);
      toast.error(e.response?.data?.message || "Delete failed");
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: "create" });
  };

  const openEdit = (plan) => {
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      // Number() strips the DB's trailing decimals ("900.00" → "900")
      price: String(Number(plan.price ?? 0)),
      currency: plan.currency || "PKR",
      plan_type: plan.plan_type || "month",
      plan_category: plan.plan_category || "paid",
      duration_count: String(plan.duration_count ?? 1),
      max_branches: plan.max_branches ?? "",
      max_users: plan.max_users ?? "",
      max_doctors: plan.max_doctors ?? "",
      max_patients: plan.max_patients ?? "",
      storage_mb: plan.storage_mb ?? "",
      modules: Array.isArray(plan.modules) ? [...plan.modules] : null,
      is_active: plan.is_active,
      sort_order: String(plan.sort_order ?? 0),
    });
    setModal({ mode: "edit", plan });
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = toPayload(form);
    if (modal.mode === "create") createM.mutate(payload);
    else updateM.mutate({ id: modal.plan.id, payload });
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const handleSearch = useCallback((v) => setSearch(v), []);
  const handleSort = useCallback((next) => setSort(next), []);

  const plans = plansQ.data ?? [];
  const isInitialLoad = plansQ.isLoading && !plansQ.data;
  const refreshing = plansQ.isFetching && !isInitialLoad;

  const hasActiveFilters =
    !!search.trim() ||
    statusFilter !== "" ||
    !!typeFilter ||
    sort.sortBy !== DEFAULT_SORT.sortBy ||
    sort.sortOrder !== DEFAULT_SORT.sortOrder;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
    setSort(DEFAULT_SORT);
  };

  return (
    <>
      <ListShell
        icon={Package}
        title="Plans"
        countLabel="Total Plans"
        count={plans.length}
        initialLoading={isInitialLoad}
        refreshing={refreshing}
        onRefresh={() => plansQ.refetch()}
        actions={
          isSuper && can("plans.create") ? (
            <BtnPrimary onClick={openCreate}>
              <Plus className="w-4 h-4" /> New plan
            </BtnPrimary>
          ) : null
        }
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "Search name / slug…",
        }}
        filters={
          <>
            <select
              className={filterSelectCls}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
            <select
              className={filterSelectCls}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              <option value="days">Days</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </>
        }
        sort={{
          sortBy: sort.sortBy,
          sortOrder: sort.sortOrder,
          onChange: handleSort,
          options: [
            { value: "sort_order", label: "Order" },
            { value: "name", label: "Name" },
            { value: "price", label: "Price" },
            { value: "duration_count", label: "Duration" },
            { value: "created_at", label: "Created" },
          ],
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        isEmpty={plans.length === 0}
        empty={{
          icon: Package,
          title: "No plans found",
          subtitle: "Create the first subscription plan clinics can sign up for.",
          action: isSuper ? (
            <BtnPrimary onClick={openCreate}>
              <Plus className="w-4 h-4" /> New plan
            </BtnPrimary>
          ) : null,
        }}
        skeleton={<SkeletonCards count={3} />}
        minHeight={380}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {plans.map((plan, index) => (
            <div
              key={plan.id}
              className={`rounded-xl border bg-white dark:bg-gray-800 p-5 flex flex-col gap-3 transition-all duration-200 ${
                plan.is_active === 1
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-dashed border-gray-300 dark:border-gray-600 opacity-70"
              }`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    {plan.name}
                    {plan.is_active !== 1 && (
                      <span className="ml-2 text-[10px] font-semibold text-gray-400 uppercase">
                        inactive
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">/{plan.slug}</p>
                </div>
                {isSuper && (
                  <div className="flex items-center gap-1.5">
                    {can("plans.edit") && (
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      title="Edit"
                    >
                      <SquarePen className="w-4 h-4" />
                    </button>
                    )}
                    {can("plans.delete") && (() => {
                      const purchases = plan.stats?.purchases ?? 0;
                      const deletable = purchases === 0;
                      return (
                        <button
                          onClick={() => deletable && setConfirmDelete(plan)}
                          disabled={!deletable}
                          className={`p-1.5 rounded-md transition-colors ${
                            deletable
                              ? "text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                          }`}
                          title={
                            deletable
                              ? "Delete — never purchased, safe to remove"
                              : `Cannot delete — purchased ${purchases} time${purchases === 1 ? "" : "s"}. Deactivate it instead.`
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      );
                    })()}
                    <ToggleSwitch
                      checked={plan.is_active === 1}
                      onChange={(next) =>
                        toggleM.mutate({ id: plan.id, is_active: next ? 1 : 0 })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-gray-900 dark:text-white">
                  {fmtMoney(plan.price, plan.currency)}
                </span>
                <span className="text-xs text-gray-400">
                  / {fmtDuration(plan.plan_type, plan.duration_count)}
                </span>
              </div>

              {plan.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{plan.description}</p>
              )}

              <div className="grid grid-cols-2 gap-2 text-center text-[11px] text-gray-500 dark:text-gray-400 mt-auto">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 py-2">
                  <Building2 className="w-3.5 h-3.5 mx-auto mb-0.5" />
                  {plan.max_branches ?? "∞"} branch{plan.max_branches === 1 ? "" : "es"}
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 py-2">
                  <Clock className="w-3.5 h-3.5 mx-auto mb-0.5" />
                  {fmtDuration(plan.plan_type, plan.duration_count)}
                </div>
              </div>

              {/* Limits & module entitlements at a glance */}
              <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                {plan.max_users ?? "∞"} users · {plan.max_doctors ?? "∞"} doctors ·{" "}
                {plan.max_patients ?? "∞"} patients ·{" "}
                {plan.storage_mb ? `${plan.storage_mb} MB` : "default"} storage ·{" "}
                {Array.isArray(plan.modules)
                  ? `${plan.modules.length} module${plan.modules.length === 1 ? "" : "s"}`
                  : "standard modules"}
              </p>

              {/* Purchase stats: times purchased / currently active / collected */}
              <div className="flex items-center justify-between gap-2 text-[11px] border-t border-gray-100 dark:border-gray-700 pt-2.5">
                <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <b className="text-gray-700 dark:text-gray-200">
                    {plan.stats?.purchases ?? 0}
                  </b>
                  purchase{(plan.stats?.purchases ?? 0) === 1 ? "" : "s"}
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <b className="text-emerald-600 dark:text-emerald-400">
                    {plan.stats?.active ?? 0}
                  </b>
                  active
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  {fmtMoney(plan.stats?.revenue ?? 0, plan.currency)} collected
                </span>
              </div>
            </div>
          ))}
        </div>
      </ListShell>

      {/* Create / edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? "New plan" : `Edit — ${modal?.plan?.name}`}
        wide
        footer={
          <>
            <BtnGhost onClick={() => setModal(null)}>Cancel</BtnGhost>
            <BtnPrimary
              type="submit"
              form="plan-form"
              disabled={createM.isPending || updateM.isPending}
            >
              {modal?.mode === "create" ? "Create plan" : "Save changes"}
            </BtnPrimary>
          </>
        }
      >
        <form id="plan-form" onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {/* ── 1. Category — picked first, it drives the pricing rules ── */}
          <div className="col-span-2">
            <Field
              label="Category"
              required
              hint="free/trial activate instantly — paid waits for a confirmed payment"
            >
              <div className="flex gap-1.5">
                {[
                  ["free", "Free"],
                  ["trial", "Trial"],
                  ["paid", "Paid"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        plan_category: k,
                        ...(k !== "paid" && { price: "0" }),
                      }))
                    }
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition ${
                      form.plan_category === k
                        ? "bg-primary-600 border-primary-600 text-white"
                        : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* ── 2. Basics ── */}
          <SectionHeading>Basics</SectionHeading>
          <Field label="Name" required>
            <input className={inputCls} required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Slug" required hint="kebab-case, used in URLs">
            <input
              className={inputCls}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={set("slug")}
              disabled={modal?.mode === "edit"}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Description">
              <input className={inputCls} value={form.description} onChange={set("description")} />
            </Field>
          </div>

          {/* ── 3. Pricing & duration ── */}
          <SectionHeading>Pricing &amp; duration</SectionHeading>
          <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field
              label="Price"
              required
              hint={form.plan_category !== "paid" ? "free/trial are always 0" : undefined}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                required
                value={form.plan_category !== "paid" ? "0" : form.price}
                onChange={set("price")}
                disabled={form.plan_category !== "paid"}
              />
            </Field>
            <Field label="Currency" hint="Default PKR">
              <CurrencySelect
                value={form.currency}
                onChange={(code) => setForm((f) => ({ ...f, currency: code }))}
              />
            </Field>
            <Field label="Billed every" required>
              <select className={inputCls} value={form.plan_type} onChange={set("plan_type")}>
                <option value="days">Days</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </Field>
            <Field
              label="Duration"
              required
              hint={`lasts ${fmtDuration(form.plan_type, form.duration_count || 1)}`}
            >
              <input
                type="number"
                min="1"
                className={inputCls}
                required
                value={form.duration_count}
                onChange={set("duration_count")}
              />
            </Field>
          </div>

          {/* ── 4. Creation limits ── */}
          <SectionHeading>Limits</SectionHeading>
          <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Branches" hint="empty = ∞">
              <input type="number" min="1" className={inputCls} value={form.max_branches} onChange={set("max_branches")} />
            </Field>
            <Field label="Users" hint="empty = ∞">
              <input type="number" min="1" className={inputCls} value={form.max_users} onChange={set("max_users")} />
            </Field>
            <Field label="Doctors" hint="empty = ∞">
              <input type="number" min="1" className={inputCls} value={form.max_doctors} onChange={set("max_doctors")} />
            </Field>
            <Field label="Patients" hint="empty = ∞">
              <input type="number" min="1" className={inputCls} value={form.max_patients} onChange={set("max_patients")} />
            </Field>
            {/* Default storage allocation for clinics on this plan. A platform
                admin can still override it per clinic. */}
            <Field label="Storage (MB)" hint="empty = default">
              <input type="number" min="1" className={inputCls} value={form.storage_mb} onChange={set("storage_mb")} />
            </Field>
          </div>

          {/* ── 5. Modules ── */}
          <SectionHeading>Modules included</SectionHeading>
          <div className="col-span-2">
            <ModulesChecklist
              catalog={moduleCatalog}
              value={form.modules}
              onChange={(v) => setForm((f) => ({ ...f, modules: v }))}
            />
          </div>

          {/* ── 6. Display ── */}
          <SectionHeading>Display</SectionHeading>
          <Field label="Sort order">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={form.sort_order}
              onChange={set("sort_order")}
            />
          </Field>
          {modal?.mode === "edit" && (
            <Field label="Status">
              <select
                className={inputCls}
                value={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: Number(e.target.value) }))}
              >
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </Field>
          )}
        </form>
      </Modal>

      {/* Delete confirm — only reachable for never-purchased plans */}
      <ConfirmationModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteM.mutate(confirmDelete.id)}
        title="Delete plan"
        message={`Permanently delete the "${confirmDelete?.name}" plan? It has never been purchased, so nothing else is affected. This cannot be undone.`}
        type="danger"
        confirmText="Delete"
        isLoading={deleteM.isPending}
      />
    </>
  );
};

export default React.memo(PlansPage);
