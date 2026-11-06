// UC-02 invite by copyable link (FR-06, BR-19, no email D-3), FR-08 change role / remove.

import { useState } from 'react';
import { Check, Copy, Link2, UserMinus, UserPlus } from 'lucide-react';
import { api, type Member } from '../api';
import { Avatar, Confirm, ErrorAlert, Field, Modal, RoleBadge, Skeleton, useToast } from '../components/ui';
import { useLoad, useMember } from '../state/session';

export function MembersPage() {
  const { isOwner, member: me, family, changed } = useMember();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const { data } = useLoad(async () => ({
    members: await api.members(),
    invitations: isOwner ? await api.familyInvitations() : [],
  }), [isOwner]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{family.name}</h1>
          <p>Members and their roles.</p>
        </div>
        {isOwner && <button className="btn btn-primary" onClick={() => setInviting(true)}><UserPlus size={16} /> Invite</button>}
      </div>

      <div className="card">
        {!data ? (
          <div className="card-body stack"><Skeleton /><Skeleton /></div>
        ) : (
          <div className="list">
            {data.members.map((m) => (
              <div key={m.memberId} className="list-item">
                <Avatar name={m.fullName} size="lg" />
                <div className="grow">
                  <div className="title">{m.fullName}{m.memberId === me.memberId && <span className="muted"> · you</span>}</div>
                  <div className="sub">{m.email}</div>
                </div>
                {isOwner && m.role !== 'OWNER' ? (
                  <div className="row">
                    <select
                      className="select"
                      style={{ height: 34, width: 110 }}
                      value={m.role}
                      aria-label={`Role of ${m.fullName}`}
                      onChange={async (e) => {
                        await api.changeRole(m.memberId, e.target.value as 'ADULT' | 'CHILD');
                        toast('Role changed');
                        changed();
                      }}
                    >
                      <option value="ADULT">Adult</option>
                      <option value="CHILD">Child</option>
                    </select>
                    <button className="icon-btn" onClick={() => setRemoving(m)} aria-label={`Remove ${m.fullName}`}><UserMinus size={16} /></button>
                  </div>
                ) : (
                  <RoleBadge role={m.role} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && data && data.invitations.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Pending invitations</h2></div>
          <div className="card list">
            {data.invitations.map((i) => (
              <div key={i.invitationId} className="list-item">
                <span className="acc-icon"><Link2 size={16} /></span>
                <div className="grow">
                  <div className="title">{i.email}</div>
                  <div className="sub">{i.role === 'ADULT' ? 'Adult' : 'Child'} · valid until {new Date(i.expiresAt).toLocaleDateString()}</div>
                </div>
                <span className="badge warn">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section card card-pad">
        <h3>Who can do what</h3>
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <div><RoleBadge role="OWNER" /><p className="muted small" style={{ marginTop: 6 }}>Everything: members, accounts, sharing, any transaction, audit log.</p></div>
          <div><RoleBadge role="ADULT" /><p className="muted small" style={{ marginTop: 6 }}>All accounts and reports, transfers, budgets and goals. Edits only own transactions.</p></div>
          <div><RoleBadge role="CHILD" /><p className="muted small" style={{ marginTop: 6 }}>Only shared accounts. Records income and expenses, no transfers, no editing, no family total.</p></div>
        </div>
      </div>

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {removing && (
        <Confirm
          title={`Remove ${removing.fullName}?`}
          text="They lose access to the family. Their past transactions stay in the history with their name."
          confirmLabel="Remove"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.removeMember(removing.memberId);
            toast('Member removed');
            changed();
          }}
        />
      )}
    </>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { changed } = useMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADULT' | 'CHILD'>('ADULT');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingExists, setPendingExists] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(replace = false) {
    setError(null);
    try {
      const r = await api.invite(email, role, replace);
      setLink(r.link);
      setPendingExists(false);
      changed();
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) setPendingExists(true);
      setError(err.message);
    }
  }

  return (
    <Modal
      title="Invite a family member"
      onClose={onClose}
      footer={
        link ? (
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            {pendingExists ? (
              <button className="btn btn-primary" onClick={() => create(true)}>Create new link</button>
            ) : (
              <button className="btn btn-primary" onClick={() => create()}>Create invitation</button>
            )}
          </>
        )
      }
    >
      {link ? (
        <>
          <p>Send this link to <strong>{email}</strong> in a messenger or in person. It works once and is valid for 7 days.</p>
          <div className="link-box">
            <span style={{ flex: 1 }}>{link}</span>
            <button
              className="btn btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="muted small">The link is shown only now. If it gets lost, invite the same email again to create a new one; the old link stops working.</p>
        </>
      ) : (
        <>
          <Field label="Email">
            <input className="input" type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setPendingExists(false); setError(null); }} placeholder="daulet@mail.kz" />
          </Field>
          <Field label="Role">
            <div className="segmented">
              <button className={role === 'ADULT' ? 'on' : ''} onClick={() => setRole('ADULT')}>Adult</button>
              <button className={role === 'CHILD' ? 'on' : ''} onClick={() => setRole('CHILD')}>Child</button>
            </div>
          </Field>
          <p className="muted small">No email is sent. You get a link to share, and the person also sees the invitation when they log in with this email.</p>
          {pendingExists ? <div className="alert alert-warn">A pending invitation for this email already exists. A new link replaces the old one and is valid for 7 days from now.</div> : <ErrorAlert message={error} />}
        </>
      )}
    </Modal>
  );
}
