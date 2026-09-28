"use client";

import { AppShell, Banner, Button, Card, DetailList, IfPermitted, Pill, TextArea, useSession } from "@paved/ui";
import { use, useCallback, useEffect, useState } from "react";

interface DsarRequest {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  email: string;
  region: string;
  request_type: string;
  status: string;
  received_at: string;
  due_at: string;
  closed_at: string | null;
  closed_by: string | null;
  resolution_note: string | null;
  _masked?: string[];
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, principal } = useSession();
  const [dsar, setDsar] = useState<DsarRequest>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(() => {
    api
      .get<{ request: DsarRequest }>(`/api/requests/${id}`)
      .then((d) => { setDsar(d.request); setError(undefined); })
      .catch((err: Error) => setError(err.message === "forbidden" ? "Your role cannot open this request." : err.message));
  }, [api, id]);

  useEffect(() => { if (principal) load(); }, [principal, load]);

  const resolve = async (resolution: string) => {
    try {
      await api.post(`/api/requests/${id}/resolution`, { resolution, note });
      setNote("");
      setDone(`Recorded "${resolution}". Note, actor and transition are in the audit log.`);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "request_already_closed" ? "This request is already closed." : message);
    }
  };

  const closed = dsar?.status === "fulfilled" || dsar?.status === "refused";
  const overdue = dsar ? !closed && new Date(dsar.due_at) < new Date() : false;
  const noteTooShort = note.trim().length < 10;

  return (
    <AppShell tool="Data subject requests" links={[{ href: "/", label: "Requests" }]}>
      <h1>{dsar ? `${dsar.reference} · ${dsar.request_type}` : "Request"}</h1>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}
      {overdue ? <Banner tone="warn">Past its statutory deadline.</Banner> : null}

      {dsar ? (
        <div className="grid-2">
          <Card title="Request">
            <DetailList
              items={[
                { label: "Customer", value: `${dsar.customer_reference} · ${dsar.full_name}`, masked: (dsar._masked ?? []).includes("full_name") },
                { label: "Email", value: dsar.email, masked: (dsar._masked ?? []).includes("email") },
                { label: "Region", value: <Pill tone="info">{dsar.region}</Pill> },
                { label: "Type", value: dsar.request_type },
                { label: "Status", value: <Pill tone={closed ? "good" : "warn"}>{dsar.status}</Pill> },
                { label: "Received", value: String(dsar.received_at).slice(0, 10) },
                { label: "Due", value: String(dsar.due_at).slice(0, 10) },
                { label: "Closed by", value: dsar.closed_by ?? "—" },
              ]}
            />
            {dsar.resolution_note ? (
              <p className="muted" style={{ marginTop: 12 }}>Note on file: {dsar.resolution_note}</p>
            ) : null}
          </Card>

          <IfPermitted permission="dsar:resolve">
            <Card title="Resolution">
              {closed ? (
                <Banner tone="info">This request is closed. Reopening is a compliance action, not an edit.</Banner>
              ) : (
                <>
                  <p className="muted">A note of at least 10 characters is required and is stored with the resolution.</p>
                  <TextArea label="Note" value={note} onChange={setNote} rows={4} placeholder="What was provided to the data subject, and on what basis?" />
                  <div className="actions">
                    <Button variant="primary" disabled={noteTooShort} onClick={() => void resolve("fulfilled")}>Fulfil</Button>
                    <Button variant="danger" disabled={noteTooShort} onClick={() => void resolve("refused")}>Refuse</Button>
                    <Button disabled={noteTooShort} onClick={() => void resolve("in_progress")}>Mark in progress</Button>
                  </div>
                </>
              )}
            </Card>
          </IfPermitted>
        </div>
      ) : null}
    </AppShell>
  );
}
