"use client";

import { AppShell, Banner, Button, Card, DataTable, DetailList, IfPermitted, Pill, TextArea, useSession } from "@paved/ui";
import { use, useCallback, useEffect, useState } from "react";

interface KycDocument {
  id: string;
  doc_type: string;
  verification_state: string;
  uploaded_at: string;
}

interface KycCase {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  region: string;
  status: string;
  risk_score: number;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  documents: KycDocument[];
  _masked?: string[];
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, principal } = useSession();
  const [kycCase, setCase] = useState<KycCase>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(() => {
    api
      .get<{ case: KycCase }>(`/api/cases/${id}`)
      .then((d) => { setCase(d.case); setError(undefined); })
      .catch((err: Error) => setError(err.message === "forbidden" ? "Your role cannot open this case." : err.message));
  }, [api, id]);

  useEffect(() => { if (principal) load(); }, [principal, load]);

  const decide = async (decision: string) => {
    try {
      await api.post(`/api/cases/${id}/decision`, { decision, reason });
      setReason("");
      setDone(`Recorded "${decision}". Decision, reason and reviewer are in the audit log.`);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "case_already_decided" ? "This case already has a final decision." : message);
    }
  };

  const decided = kycCase?.status === "approved" || kycCase?.status === "rejected";
  const reasonTooShort = reason.trim().length < 10;

  return (
    <AppShell tool="KYC review queue" links={[{ href: "/", label: "Queue" }]}>
      <h1>{kycCase ? `${kycCase.reference} · risk ${kycCase.risk_score}` : "Case"}</h1>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}

      {kycCase ? (
        <div className="grid-2">
          <div>
            <Card title="Case">
              <DetailList
                items={[
                  { label: "Customer", value: `${kycCase.customer_reference} · ${kycCase.full_name}`, masked: (kycCase._masked ?? []).includes("full_name") },
                  { label: "Region", value: <Pill tone="info">{kycCase.region}</Pill> },
                  { label: "Risk score", value: kycCase.risk_score },
                  { label: "Status", value: <Pill tone={decided ? "good" : "warn"}>{kycCase.status}</Pill> },
                  { label: "Submitted", value: String(kycCase.submitted_at).slice(0, 10) },
                  { label: "Decided by", value: kycCase.decided_by ?? "—" },
                ]}
              />
              {kycCase.decision_reason ? (
                <p className="muted" style={{ marginTop: 12 }}>Reason on file: {kycCase.decision_reason}</p>
              ) : null}
            </Card>

            <Card title="Documents">
              <DataTable
                rows={kycCase.documents}
                rowKey={(d) => d.id}
                empty="No documents uploaded."
                columns={[
                  { key: "type", header: "Type", render: (d) => d.doc_type.replace("_", " ") },
                  {
                    key: "state",
                    header: "Verification",
                    render: (d) => (
                      <Pill tone={d.verification_state === "verified" ? "good" : d.verification_state === "failed" ? "bad" : "warn"}>
                        {d.verification_state}
                      </Pill>
                    ),
                  },
                  { key: "uploaded", header: "Uploaded", render: (d) => String(d.uploaded_at).slice(0, 10) },
                ]}
              />
            </Card>
          </div>

          <IfPermitted permission="kyc:case:decide">
            <Card title="Decision">
              {decided ? (
                <Banner tone="info">This case is closed. Reopening requires compliance, not an edit.</Banner>
              ) : (
                <>
                  <p className="muted">A reason of at least 10 characters is required and is stored with the decision.</p>
                  <TextArea label="Reason" value={reason} onChange={setReason} rows={4} placeholder="What evidence supports this decision?" />
                  <div className="actions">
                    <Button variant="primary" disabled={reasonTooShort} onClick={() => void decide("approved")}>Approve</Button>
                    <Button variant="danger" disabled={reasonTooShort} onClick={() => void decide("rejected")}>Reject</Button>
                    <Button disabled={reasonTooShort} onClick={() => void decide("escalated")}>Escalate</Button>
                    <Button disabled={reasonTooShort} onClick={() => void decide("in_review")}>Mark in review</Button>
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
