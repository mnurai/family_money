// UC-01 steps 4–6 (create a family) and UC-02 steps 5–7 (accept an invitation).

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { House, Mail, LogOut } from 'lucide-react';
import { api, type Invitation } from '../api';
import { ErrorAlert, Field, ROLE_LABEL, Skeleton, useToast } from '../components/ui';
import { useLoad, useSession } from '../state/session';

export function WelcomePage() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: invitations, loading } = useLoad(() => api.myInvitations());

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.createFamily(name);
      await refresh();
      toast('Family created');
      navigate('/accounts?first=1');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="narrow stack" style={{ gap: 18 }}>
        <div className="row-between">
          <div>
            <h1>Welcome, {me?.user.fullName.split(' ')[0]}</h1>
            <p className="muted" style={{ marginTop: 4 }}>Create a family to start tracking money together, or join one you were invited to.</p>
          </div>
          <button
            className="icon-btn"
            aria-label="Log out"
            onClick={async () => {
              await api.logout();
              await refresh();
              navigate('/login');
            }}
          >
            <LogOut size={18} />
          </button>
        </div>

        {loading ? (
          <Skeleton height={120} />
        ) : (
          invitations!.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>You are invited</h2>
              </div>
              <div className="card-body stack">
                {invitations!.map((i) => (
                  <InvitationCard key={i.invitationId} invitation={i} />
                ))}
              </div>
            </div>
          )
        )}

        <div className="card card-pad stack">
          <div className="row">
            <span className="acc-icon"><House size={18} /></span>
            <div>
              <h2>Create a family</h2>
              <p className="muted small">You become the Family Owner.</p>
            </div>
          </div>
          <Field label="Family name">
            <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Seitkali family" onKeyDown={(e) => e.key === 'Enter' && create()} />
          </Field>
          <p className="muted small">Currency: KZT (₸). Default income and expense categories are added automatically.</p>
          <ErrorAlert message={error} />
          <button className="btn btn-primary btn-block" onClick={create} disabled={busy}>Create family</button>
        </div>

        {!loading && invitations!.length === 0 && (
          <div className="card card-pad row" style={{ alignItems: 'flex-start' }}>
            <span className="acc-icon"><Mail size={18} /></span>
            <div>
              <h3>Waiting for an invitation?</h3>
              <p className="muted small">Ask the family owner to invite {me?.user.email}. The invitation appears here when you log in, or open the link they send you.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvitationCard({ invitation }: { invitation: Invitation }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.respondToInvitation(invitation.invitationId, accept);
      await refresh();
      toast(accept ? `You joined ${invitation.familyName}` : 'Invitation declined');
      if (accept) navigate('/');
      setBusy(false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p>
        <strong>{invitation.invitedByName}</strong> invited you to <strong>{invitation.familyName}</strong> as <strong>{ROLE_LABEL[invitation.role].toLowerCase()}</strong>.
      </p>
      <p className="muted small">Valid until {new Date(invitation.expiresAt).toLocaleDateString()}</p>
      <ErrorAlert message={error} />
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => respond(true)}>Accept</button>
        <button className="btn" disabled={busy} onClick={() => respond(false)}>Decline</button>
      </div>
    </div>
  );
}

/** /invite/:token — the link the owner copied (doc 10 §5). */
export function InviteLinkPage() {
  const { token = '' } = useParams();
  const { me } = useSession();
  const navigate = useNavigate();
  const { data, error, loading } = useLoad(() => api.invitationByToken(token), [token]);

  return (
    <div className="center-page">
      <div className="narrow card card-pad stack">
        <h1>Family invitation</h1>
        {loading && <Skeleton height={80} />}
        {error && <ErrorAlert message={error} />}
        {data && (me?.member ? <ErrorAlert message="You already belong to a family. Leave it first to join another one." /> : <InvitationCard invitation={data} />)}
        <button className="btn" onClick={() => navigate('/')}>Go to the app</button>
      </div>
    </div>
  );
}
