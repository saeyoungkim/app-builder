"use client";

import { AppShell, Banner, Card, DataTable, Pill, TextInput, useSession } from "@paved/ui";
import { useEffect, useState } from "react";

interface AuditEvent {
  id: number;
  occurred_at: string;
  actor_email: string;
  actor_roles: string[];
  tool: string;
  action: string;
  resource_type: string;
  subject_id: string | null;
  outcome: string;
}

export default function AuditPage() {
  const { api, principal, can } = useSession();
  const [subjectId, setSubjectId] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!principal || !can("audit:read")) return;
    const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
    api
      .get<{ events: AuditEvent[] }>(`/api/audit${query}`)
      .then((data) => setEvents(data.events))
      .catch((err: Error) => setError(err.message));
  }, [api, principal, can, subjectId]);

  return (
    <AppShell tool="Customer data console" links={[{ href: "/", label: "Customers" }, { href: "/audit", label: "Audit" }]}>
      <h1>Audit log</h1>
      <p className="muted">
        One log for every tool on the platform. Append-only at the database level — updates and deletes are rejected.
      </p>
      {!can("audit:read") ? (
        <Banner tone="warn">Your role cannot read the audit log. Requires compliance-admin.</Banner>
      ) : (
        <Card>
          <div className="filterbar">
            <TextInput label="Filter by data subject" value={subjectId} onChange={setSubjectId} placeholder="e.g. CUS-10004" />
          </div>
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <DataTable
            rows={events}
            rowKey={(e) => String(e.id)}
            empty="No events recorded yet."
            columns={[
              { key: "at", header: "When", render: (e) => new Date(e.occurred_at).toISOString().replace("T", " ").slice(0, 19) },
              { key: "actor", header: "Actor", render: (e) => e.actor_email },
              { key: "roles", header: "Roles", render: (e) => (e.actor_roles ?? []).join(", ") },
              { key: "tool", header: "Tool", render: (e) => <Pill tone="info">{e.tool}</Pill> },
              { key: "action", header: "Action", render: (e) => e.action },
              { key: "subject", header: "Subject", render: (e) => e.subject_id ?? "—" },
              { key: "outcome", header: "Outcome", render: (e) => <Pill tone={e.outcome === "denied" ? "bad" : "good"}>{e.outcome}</Pill> },
            ]}
          />
        </Card>
      )}
    </AppShell>
  );
}
