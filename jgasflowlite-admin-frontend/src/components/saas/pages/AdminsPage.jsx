// src/components/saas/pages/AdminsPage.jsx
// Platform administrators — reference list layout (ListShell).
// super_admin only (route + sidebar both gate it).
import React, { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { ShieldCheck, Plus, SquarePen, Trash2 } from "lucide-react";
import { saasAdminsApi } from "../../../api/saasApi";
import { useToast } from "../../common/Toast";
import ConfirmationModal from "../../common/ConfirmationModal";
import PaginationFooter, { useClampPage } from "../../common/PaginationFooter";
import ListShell, { SkeletonRows, filterSelectCls } from "../ListShell";
import { getAdmin } from "../../../utils/saasAuth";
import SAAS_MODULES, {
  SAAS_PERMISSION_KEYS,
  permsOfModule,
} from "../../../constants/saasModules";
import {
  Modal,
  Field,
  inputCls,
  BtnPrimary,
  BtnGhost,
  StatusBadge,
  ToggleSwitch,
  Th,
  Td,
  Tr,
  fmtDateTime,
} from "../common";

// A new admin starts read-only on the dashboard — the super admin ticks the rest.
const EMPTY_FORM = {
  name: "", email: "", password: "", phone: "", role: "support", status: 1,
  modules: ["dashboard.view"],
};

const SKELETON_HEADERS = ["Name", "Email", "Role", "Status", "Last login", "Actions"];
const SKELETON_WIDTHS = ["w-32", "w-40", "w-20", "w-14", "w-28", "w-14"];

const DEFAULT_SORT = { sortBy: "created_at", sortOrder: "DESC" };

const AdminsPage = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const me = getAdmin();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [modal, setModal] = useState(null); // { mode, admin? }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const params = useMemo(
    () => ({
      page,
      limit: pageSize,
      sort_by: sort.sortBy,
      sort_order: sort.sortOrder,
      ...(search.trim() && { search: search.trim() }),
      ...(roleFilter && { role: roleFilter }),
      ...(statusFilter !== "" && { status: Number(statusFilter) }),
    }),
    [page, pageSize, search, roleFilter, statusFilter, sort],
  );

  const adminsQ = useQuery({
    queryKey: ["saas-admins", params],
    queryFn: () => saasAdminsApi.list(params),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["saas-admins"] });

  const createM = useMutation({
    mutationFn: (payload) => saasAdminsApi.create(payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Admin created");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Create failed"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }) => saasAdminsApi.update(id, payload),
    onSuccess: () => {
      invalidate();
      setModal(null);
      toast.success("Admin updated");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Update failed"),
  });

  // Instant enable/disable — optimistic, no modal. Self is excluded in the row.
  const toggleM = useMutation({
    mutationFn: ({ id, status }) => saasAdminsApi.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["saas-admins"] });
      const prev = qc.getQueriesData({ queryKey: ["saas-admins"] });
      qc.setQueriesData({ queryKey: ["saas-admins"] }, (old) =>
        old?.items
          ? {
              ...old,
              items: old.items.map((a) => (a.id === id ? { ...a, status } : a)),
            }
          : old,
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(e.response?.data?.message || "Status change failed");
    },
    // No refetch on success — the optimistic value is already correct;
    // refetching would dim the table and flash the Updating bar.
  });

  const deleteM = useMutation({
    mutationFn: (id) => saasAdminsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      toast.success("Admin removed");
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

  const openEdit = (admin) => {
    setForm({
      name: admin.name,
      email: admin.email,
      password: "",
      phone: admin.phone || "",
      role: admin.role,
      status: admin.status,
      // The API resolves access before sending it, so a legacy (never scoped)
      // admin arrives with everything ticked and saving can't silently lock
      // them down.
      modules: Array.isArray(admin.permissions)
        ? admin.permissions
        : SAAS_PERMISSION_KEYS,
    });
    setModal({ mode: "edit", admin });
  };

  const submit = (e) => {
    e.preventDefault();
    if (modal.mode === "create") {
      createM.mutate({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        role: form.role,
        ...(form.role === "super_admin" ? {} : { modules: form.modules }),
      });
    } else {
      updateM.mutate({
        id: modal.admin.id,
        payload: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
          status: Number(form.status),
          ...(form.role === "super_admin" ? {} : { modules: form.modules }),
        },
      });
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /**
   * `view` is the gate, so the two directions aren't symmetric: ticking any
   * action implies view, and clearing view clears the whole module — otherwise
   * you could grant "delete" on a screen the admin can't even open.
   */
  const togglePerm = (moduleKey, actionKey) =>
    setForm((f) => {
      const perm = `${moduleKey}.${actionKey}`;
      const has = f.modules.includes(perm);
      let next;
      if (has) {
        next =
          actionKey === "view"
            ? f.modules.filter((k) => !k.startsWith(`${moduleKey}.`))
            : f.modules.filter((k) => k !== perm);
      } else {
        next = [...f.modules, perm];
        if (actionKey !== "view" && !next.includes(`${moduleKey}.view`)) {
          next.push(`${moduleKey}.view`);
        }
      }
      return { ...f, modules: next };
    });

  /** Header checkbox: all of this module's actions, or none of them. */
  const toggleModule = (moduleKey) =>
    setForm((f) => {
      const all = permsOfModule(moduleKey);
      const on = all.every((p) => f.modules.includes(p));
      const without = f.modules.filter((k) => !k.startsWith(`${moduleKey}.`));
      return { ...f, modules: on ? without : [...without, ...all] };
    });

  const resetPageAnd = useCallback((setter) => (value) => {
    setter(value);
    setPage(1);
  }, []);

  const handleSearch = useCallback(resetPageAnd(setSearch), []);
  const handleSort = useCallback((next) => {
    setSort(next);
    setPage(1);
  }, []);

  const data = adminsQ.data;
  const items = data?.items ?? [];
  useClampPage(data, page, setPage); // filter/delete shrank the list → snap back
  const isInitialLoad = adminsQ.isLoading && !data;
  const refreshing = adminsQ.isFetching && !isInitialLoad;

  const hasActiveFilters =
    !!search.trim() ||
    !!roleFilter ||
    statusFilter !== "" ||
    sort.sortBy !== DEFAULT_SORT.sortBy ||
    sort.sortOrder !== DEFAULT_SORT.sortOrder;

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setSort(DEFAULT_SORT);
    setPage(1);
  };

  return (
    <>
      <ListShell
        icon={ShieldCheck}
        title="Platform admins"
        countLabel="Total Admins"
        count={data?.total ?? 0}
        initialLoading={isInitialLoad}
        refreshing={refreshing}
        onRefresh={() => adminsQ.refetch()}
        actions={
          <BtnPrimary onClick={openCreate}>
            <Plus className="w-4 h-4" /> New admin
          </BtnPrimary>
        }
        search={{
          value: search,
          onChange: handleSearch,
          placeholder: "Search name / email / phone…",
        }}
        filters={
          <>
            <select
              className={filterSelectCls}
              value={roleFilter}
              onChange={(e) => resetPageAnd(setRoleFilter)(e.target.value)}
            >
              <option value="">All roles</option>
              <option value="super_admin">Super admin</option>
              <option value="billing">Billing</option>
              <option value="support">Support</option>
            </select>
            <select
              className={filterSelectCls}
              value={statusFilter}
              onChange={(e) => resetPageAnd(setStatusFilter)(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="1">Active</option>
              <option value="0">Disabled</option>
            </select>
          </>
        }
        sort={{
          sortBy: sort.sortBy,
          sortOrder: sort.sortOrder,
          onChange: handleSort,
          options: [
            { value: "created_at", label: "Created" },
            { value: "name", label: "Name" },
            { value: "email", label: "Email" },
            { value: "role", label: "Role" },
            { value: "last_login_at", label: "Last login" },
          ],
        }}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        isEmpty={items.length === 0}
        empty={{
          icon: ShieldCheck,
          title: "No admins found",
          subtitle: "Create a platform admin to help manage the platform.",
          action: (
            <BtnPrimary onClick={openCreate}>
              <Plus className="w-4 h-4" /> New admin
            </BtnPrimary>
          ),
        }}
        skeleton={<SkeletonRows headers={SKELETON_HEADERS} widths={SKELETON_WIDTHS} rows={8} />}
        footer={
          data?.total > 0 ? (
            <PaginationFooter
              currentPage={page}
              totalPages={data.total_pages}
              onPageChange={setPage}
              totalItems={data.total}
              itemsPerPage={data.limit ?? pageSize}
              itemName="admins"
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          ) : null
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Last login</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <Tr key={a.id}>
                <Td className="font-medium">
                  {a.name}
                  {Number(a.id) === Number(me?.id) && (
                    <span className="ml-1.5 text-[10px] font-semibold text-primary-600">
                      (you)
                    </span>
                  )}
                </Td>
                <Td className="text-xs">{a.email}</Td>
                <Td>
                  <StatusBadge value={a.role} />
                </Td>
                <Td>
                  {Number(a.id) === Number(me?.id) ? (
                    <StatusBadge value="active" />
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <ToggleSwitch
                        checked={a.status === 1}
                        onChange={(next) =>
                          toggleM.mutate({ id: a.id, status: next ? 1 : 0 })
                        }
                      />
                      <span className="text-[11px] text-gray-400">
                        {a.status === 1 ? "Active" : "Disabled"}
                      </span>
                    </span>
                  )}
                </Td>
                <Td className="text-xs">{fmtDateTime(a.last_login_at)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    onClick={() => openEdit(a)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    title="Edit"
                  >
                    <SquarePen className="w-4 h-4" />
                  </button>
                  {Number(a.id) !== Number(me?.id) && (
                    <button
                      onClick={() => setConfirmDelete(a)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </ListShell>

      {/* Create / edit modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "create" ? "New platform admin" : `Edit — ${modal?.admin?.name}`}
        footer={
          <>
            <BtnGhost onClick={() => setModal(null)}>Cancel</BtnGhost>
            <BtnPrimary
              type="submit"
              form="admin-form"
              disabled={createM.isPending || updateM.isPending}
            >
              {modal?.mode === "create" ? "Create admin" : "Save changes"}
            </BtnPrimary>
          </>
        }
      >
        <form id="admin-form" onSubmit={submit} className="space-y-3">
          <Field label="Name" required>
            <input className={inputCls} required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Email" required>
            <input type="email" className={inputCls} required value={form.email} onChange={set("email")} />
          </Field>
          {modal?.mode === "create" && (
            <Field
              label="Password"
              required
              hint="Min 8 chars with uppercase, lowercase and a number"
            >
              <input
                type="password"
                className={inputCls}
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
              />
            </Field>
          )}
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Role" required>
            <select className={inputCls} value={form.role} onChange={set("role")}>
              <option value="super_admin">Super admin — full control</option>
              <option value="billing">Billing — plans & invoices</option>
              <option value="support">Support — read & assist</option>
            </select>
          </Field>
          {/* A super admin always has everything, so the picker only applies
              to the scoped roles. */}
          {form.role !== "super_admin" && (
            <Field label="Module access" required>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {form.modules.length} of {SAAS_PERMISSION_KEYS.length} permissions
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, modules: [...SAAS_PERMISSION_KEYS] }))}
                      className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, modules: [] }))}
                      className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      None
                    </button>
                  </div>
                </div>

                {SAAS_MODULES.map((m) => {
                  const Icon = m.icon;
                  const all = permsOfModule(m.key);
                  const on = form.modules.filter((k) => k.startsWith(`${m.key}.`));
                  const allOn = all.length === on.length;
                  return (
                    <div key={m.key} className="px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => {
                            // Partial grant reads as a dash, not an empty box.
                            if (el) el.indeterminate = on.length > 0 && !allOn;
                          }}
                          onChange={() => toggleModule(m.key)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <Icon className={`h-4 w-4 ${on.length ? "text-primary-600" : "text-gray-400"}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {m.label}
                        </span>
                      </label>

                      {/* Actions sit under their module, indented to the label. */}
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-9">
                        {m.actions.map((a) => {
                          const perm = `${m.key}.${a.key}`;
                          return (
                            <label
                              key={a.key}
                              className="flex cursor-pointer items-center gap-1.5"
                            >
                              <input
                                type="checkbox"
                                checked={form.modules.includes(perm)}
                                onChange={() => togglePerm(m.key, a.key)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-[12px] text-gray-600 dark:text-gray-300">
                                {a.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Field>
          )}
          {modal?.mode === "edit" && (
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={set("status")}>
                <option value={1}>Active</option>
                <option value={0}>Disabled</option>
              </select>
            </Field>
          )}
        </form>
      </Modal>

      <ConfirmationModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteM.mutate(confirmDelete.id)}
        title="Remove admin"
        message={`Remove "${confirmDelete?.name}"? Their sessions are revoked immediately.`}
        type="danger"
        isLoading={deleteM.isPending}
      />
    </>
  );
};

export default React.memo(AdminsPage);
