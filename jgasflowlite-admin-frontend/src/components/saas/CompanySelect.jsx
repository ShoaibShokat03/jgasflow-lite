// src/components/saas/CompanySelect.jsx
// Company dropdown fed by /saas/admin/companies — replaces raw
// "Company ID" number inputs everywhere. One cached query (5 min) is
// shared by every instance on the page.
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { saasCompaniesApi } from "../../api/saasApi";
import { filterSelectCls } from "./ListShell";

export const useCompaniesOptions = () =>
  useQuery({
    queryKey: ["saas-companies-options"],
    queryFn: () =>
      saasCompaniesApi.list({ limit: 100, sort_by: "name", sort_order: "ASC" }),
    staleTime: 5 * 60 * 1000,
    select: (data) => data?.items ?? [],
  });

/**
 * @param value       selected company id ("" = none/all)
 * @param onChange    (id: string) => void
 * @param allLabel    when set, renders an "all" option with this label
 *                    (filter mode); omit for required form selects
 */
const CompanySelect = ({
  value = "",
  onChange,
  allLabel,
  required = false,
  disabled = false,
  className = "",
}) => {
  const { data: companies = [], isLoading } = useCompaniesOptions();

  return (
    <select
      value={value}
      required={required}
      disabled={disabled || isLoading}
      onChange={(e) => onChange?.(e.target.value)}
      className={className || filterSelectCls}
    >
      {allLabel ? (
        <option value="">{allLabel}</option>
      ) : (
        <option value="">{isLoading ? "Loading clinics…" : "Select a clinic…"}</option>
      )}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} (#{c.id})
        </option>
      ))}
    </select>
  );
};

export default React.memo(CompanySelect);
