"use client";

import { AppShell, Banner, Button, Card, DetailList, IfPermitted, Pill, TextArea, useSession } from "@paved/ui";
import { use, useCallback, useEffect, useState } from "react";

interface Complaint {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  email: string;
  region: string;
  category: string;
  channel: string;
  summary: string;
  status: string;
  opened_at: string;
  due_at: string;
  closed_at: string | null;
  closed_by: string | null;
  logged_by: string;
  outcome_note: string | null;
  _masked?: string[];
}

export default function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, principal } = useSession();
  const [complaint, setComplaint] = useState<Complaint>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(() => {
    api
      .get<{ complaint: Complaint }>(`/api/complaints/${id}`)
      .then((d) => { setComplaint(d.complaint); setError(undefined); })
      .catch((err: Error) => setError(err.message === "forbidden" ? "Your role cannot open this complaint." : err.message));
  }, [api, id]);

  useEffect(() => { if (principal) load(); }, [principal, load]);

  const close = async (outcome: string) => {
    try {
      await api.post(`/api/complaints/${id}/outcome`, { outcome, note });
      setNote("");
      setDone(`Recorded "${outcome}". Note, actor and transition are in the audit log.`);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "complaint_already_closed" ? "This complaint is already closed." : message);
    }
  };

  const closed = complaint ? !["open", "investigating"].includes(complaint.status) : false;
  const breached = complaint ? !closed && new Date(complaint.due_at) < new Date() : false;
  const noteTooShort = note.trim().length < 10;

  return (
    <AppShell tool="Complaints desk" links={[{ href: "/", label: "Complaints" }]}>
      <h1>{complaint ? `${complaint.reference} · ${complaint.category}` : "Complaint"}</h1>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}
      {breached ? <Banner tone="warn">Past its eight-week final-response deadline.</Banner> : null}

      {complaint ? (
        <div className="grid-2">
          <Card title="Complaint">
            <DetailList
              items={[
                { label: "Customer", value: `${complaint.customer_reference} · ${complaint.full_name}`, masked: (complaint._masked ?? []).includes("full_name") },
                { label: "Email", value: complaint.email, masked: (complaint._masked ?? []).includes("email") },
                { label: "Region", value: <Pill tone="info">{complaint.region}</Pill> },
                { label: "Category", value: complaint.category },
                { label: "Channel", value: complaint.channel },
                { label: "Status", value: <Pill tone={closed ? "good" : "warn"}>{complaint.status}</Pill> },
                { label: "Logged", value: `${String(complaint.opened_at).slice(0, 10)} by ${complaint.logged_by}` },
                { label: "Final response due", value: String(complaint.due_at).slice(0, 10) },
                { label: "Closed by", value: complaint.closed_by ?? "—" },
              ]}
            />
            <p className="muted" style={{ marginTop: 12 }}>{complaint.summary}</p>
            {complaint.outcome_note ? (
              <p className="muted" style={{ marginTop: 12 }}>Outcome on file: {complaint.outcome_note}</p>
            ) : null}
          </Card>

          <IfPermitted permission="complaint:close">
            <Card title="Outcome">
              {closed ? (
                <Banner tone="info">This complaint is closed. Reopening is a compliance action, not an edit.</Banner>
              ) : (
                <>
                  <p className="muted">A note of at least 10 characters is required and is stored with the outcome.</p>
                  <TextArea label="Note" value={note} onChange={setNote} rows={4} placeholder="What was decided, and what was offered to the customer?" />
                  <div className="actions">
                    <Button variant="primary" disabled={noteTooShort} onClick={() => void close("upheld")}>Uphold</Button>
                    <Button variant="danger" disabled={noteTooShort} onClick={() => void close("rejected")}>Reject</Button>
                    <Button disabled={noteTooShort} onClick={() => void close("investigating")}>Mark investigating</Button>
                    <Button disabled={noteTooShort} onClick={() => void close("withdrawn")}>Withdrawn</Button>
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
