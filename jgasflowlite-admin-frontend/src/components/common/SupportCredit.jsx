// src/components/common/SupportCredit.jsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import saasClient from "../../api/saasClient";

/** "Software developed by Jantrah Tech | ☎ <phone>", the phone from Settings > Support contact. */
export default function SupportCredit({ className }) {
  const q = useQuery({
    queryKey: ["public-config"],
    queryFn: () => saasClient.get("/public/config").then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const phone = q.data?.support?.phone;
  return (
    <p className={className}>
      Software developed by Jantrah Tech{phone ? ` | ☎ ${phone}` : ""}
    </p>
  );
}
