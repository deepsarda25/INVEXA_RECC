import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { downloadAccountStatementPdf } from "../utils/accountStatementPdf";
import { downloadPortfolioHoldingsPdf } from "../utils/portfolioHoldingsPdf";
import {
  BiometricCredential,
  deleteBiometricCredential,
  isBiometricLoginAvailable,
  listBiometricCredentials,
  registerBiometricCredential
} from "../utils/webauthn";
import { PasswordField } from "./PasswordField";

type Holding = {
  ticker: string;
  quantity: number;
  avgCost: number;
  livePrice: number;
  marketValue: number;
  unrealizedPnl: number;
};

type Portfolio = {
  cash: number;
  totalHoldingsValue: number;
  totalPortfolioValue: number;
  totalUnrealizedPnl: number;
  holdings: Holding[];
};

type User = {
  id: string;
  username: string;
  email: string;
  role: "user" | "educator" | "admin";
  virtualBalance: string;
};

type Props = {
  user: User;
  token?: string | null;
  portfolio?: Portfolio;
  onLogout?: () => void;
  onBalanceChanged?: () => void;
};

const QUICK_AMOUNTS = [10000, 50000, 100000, 500000];

export function ProfilePanel({ user, token, portfolio, onLogout, onBalanceChanged }: Props) {
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const [amount, setAmount] = useState<number | "">(50000);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [pdfLoading, setPdfLoading] = useState<"holdings" | "statement" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Security: change password
  const [currentPasswordForPw, setCurrentPasswordForPw] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  // Security: change access key
  const [currentPasswordForKey, setCurrentPasswordForKey] = useState("");
  const [newAccessKey, setNewAccessKey] = useState("");
  const [confirmNewAccessKey, setConfirmNewAccessKey] = useState("");
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  // Security: fingerprint (biometric / WebAuthn) sign-in
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricCredentials, setBiometricCredentials] = useState<BiometricCredential[]>([]);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  useEffect(() => {
    isBiometricLoginAvailable().then(setBiometricSupported);
  }, []);

  useEffect(() => {
    if (!token) return;
    listBiometricCredentials(token)
      .then((res) => setBiometricCredentials(res.credentials))
      .catch(() => setBiometricCredentials([]));
  }, [token]);

  const enrollBiometric = async () => {
    if (!token) return;
    setBiometricLoading(true);
    setBiometricMessage(null);
    try {
      await registerBiometricCredential(token, `${user.username}'s device`);
      const res = await listBiometricCredentials(token);
      setBiometricCredentials(res.credentials);
      setBiometricMessage({ text: "✓ Fingerprint sign-in enabled for this device.", kind: "success" });
    } catch (error) {
      setBiometricMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setBiometricLoading(false);
    }
  };

  const removeBiometric = async (credentialId: string) => {
    if (!token) return;
    setBiometricLoading(true);
    setBiometricMessage(null);
    try {
      await deleteBiometricCredential(token, credentialId);
      setBiometricCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      setBiometricMessage({ text: "✓ Fingerprint credential removed.", kind: "success" });
    } catch (error) {
      setBiometricMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setBiometricLoading(false);
    }
  };

  const portfolioValue = portfolio?.totalPortfolioValue ?? 0;
  const holdingsCount = portfolio?.holdings.length ?? 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !amount || Number(amount) <= 0) return;

    setLoading(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ ok: boolean; amountAdded: number; virtualBalance: string }>(
        "/portfolio/deposit",
        { method: "POST", body: JSON.stringify({ amount: Number(amount) }) },
        token
      );
      updateBalance(res.virtualBalance);
      onBalanceChanged?.();
      setMessage({
        text: `✓ Added ₹${res.amountAdded.toLocaleString("en-IN")} — new balance ₹${Number(res.virtualBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        kind: "success"
      });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setPwMessage(null);

    if (newPassword !== confirmNewPassword) {
      setPwMessage({ text: "New password and confirm new password do not match.", kind: "error" });
      return;
    }

    setPwLoading(true);
    try {
      await apiFetch(
        "/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword: currentPasswordForPw, newPassword, confirmNewPassword }) },
        token
      );
      setPwMessage({ text: "✓ Password updated successfully", kind: "success" });
      setCurrentPasswordForPw("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      setPwMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setPwLoading(false);
    }
  };

  const submitAccessKeyChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setKeyMessage(null);

    if (!/^\d{4}$/.test(newAccessKey)) {
      setKeyMessage({ text: "Access Key must be exactly 4 digits.", kind: "error" });
      return;
    }
    if (newAccessKey !== confirmNewAccessKey) {
      setKeyMessage({ text: "New Access Key and confirm Access Key do not match.", kind: "error" });
      return;
    }

    setKeyLoading(true);
    try {
      await apiFetch(
        "/auth/change-access-key",
        { method: "POST", body: JSON.stringify({ currentPassword: currentPasswordForKey, newAccessKey, confirmNewAccessKey }) },
        token
      );
      setKeyMessage({ text: "✓ Access Key updated successfully", kind: "success" });
      setCurrentPasswordForKey("");
      setNewAccessKey("");
      setConfirmNewAccessKey("");
    } catch (error) {
      setKeyMessage({ text: (error as Error).message, kind: "error" });
    } finally {
      setKeyLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <h2 className="headline-sm">Profile</h2>
            <span className="badge badge-filled">{user.role}</span>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <span>User Name</span>
            <strong>{user.username}</strong>
          </div>
          <div className="stat-cell">
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>
          <div className="stat-cell">
            <span>Account ID</span>
            <strong>{user.id.slice(0, 8)}…</strong>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <span>Portfolio Value</span>
            <strong>₹{portfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="stat-cell">
            <span>Virtual Balance</span>
            <strong>₹{Number(user.virtualBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <div className="stat-cell">
            <span>Active Holdings</span>
            <strong>{holdingsCount}</strong>
          </div>
        </div>
      </div>

      {/* Add Money */}
      <div className="card">
        <div className="card-header">
          <h2 className="title-sm">Add Money</h2>
        </div>
        <p className="body-sm" style={{ color: "var(--text-2)", marginBottom: "1rem" }}>
          Top up your virtual balance with any amount — instantly credited to your portfolio's buying power.
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {QUICK_AMOUNTS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={`btn-sm ${Number(amount) === preset ? "active" : ""}`}
                onClick={() => setAmount(preset)}
              >
                ₹{preset.toLocaleString("en-IN")}
              </button>
            ))}
          </div>

          <label className="form-label">
            Amount (₹)
            <input
              className="form-input"
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Enter any amount"
            />
          </label>

          <button type="submit" className="btn-primary" disabled={loading || !amount || Number(amount) <= 0}>
            {loading ? "Adding…" : `Add ₹${amount ? Number(amount).toLocaleString("en-IN") : "0"} to Portfolio`}
          </button>
        </form>

        {message && <p className={`order-msg ${message.kind}`}>{message.text}</p>}
      </div>

      {/* Downloads */}
      <div className="card">
        <div className="card-header">
          <h2 className="title-sm">Downloads</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <p className="body-sm" style={{ color: "var(--text-2)", marginBottom: "0.6rem" }}>
              <strong style={{ color: "var(--on-surface)" }}>Portfolio Holdings</strong> — every stock currently in your
              portfolio, with cost basis, market value, unrealized P&amp;L, sector, and portfolio weightage.
            </p>
            <button
              className="btn-sm"
              style={{ padding: "0.65rem 1.25rem" }}
              disabled={!token || pdfLoading !== null}
              onClick={async () => {
                if (!token) return;
                setPdfLoading("holdings");
                setPdfError(null);
                try {
                  await downloadPortfolioHoldingsPdf({ user, token, portfolio });
                } catch (e) {
                  setPdfError((e as Error).message);
                } finally {
                  setPdfLoading(null);
                }
              }}
            >
              {pdfLoading === "holdings" ? "Preparing…" : "⬇ Download Portfolio Holdings (PDF)"}
            </button>
          </div>

          <div>
            <p className="body-sm" style={{ color: "var(--text-2)", marginBottom: "0.6rem" }}>
              <strong style={{ color: "var(--on-surface)" }}>Account Statement</strong> — a full transaction history:
              every buy, every sell (with date and rate), and every deposit into your portfolio.
            </p>
            <button
              className="btn-sm"
              style={{ padding: "0.65rem 1.25rem" }}
              disabled={!token || pdfLoading !== null}
              onClick={async () => {
                if (!token) return;
                setPdfLoading("statement");
                setPdfError(null);
                try {
                  await downloadAccountStatementPdf({ user, token });
                } catch (e) {
                  setPdfError((e as Error).message);
                } finally {
                  setPdfLoading(null);
                }
              }}
            >
              {pdfLoading === "statement" ? "Preparing…" : "⬇ Download Account Statement (PDF)"}
            </button>
          </div>

          {pdfError && <p className="order-msg error">{pdfError}</p>}
        </div>
      </div>

      {/* Security */}
      <div className="card">
        <div className="card-header">
          <h2 className="title-sm">Security</h2>
        </div>
        <div className="grid-2">
          <form onSubmit={submitPasswordChange} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <h3 className="body-sm" style={{ color: "var(--on-surface)", fontWeight: 600 }}>Change Password</h3>
            <label className="form-label">
              Current Password
              <PasswordField value={currentPasswordForPw} onChange={setCurrentPasswordForPw} placeholder="••••••••" autoComplete="current-password" required />
            </label>
            <label className="form-label">
              New Password
              <PasswordField value={newPassword} onChange={setNewPassword} placeholder="••••••••" autoComplete="new-password" required />
            </label>
            <label className="form-label">
              Confirm New Password
              <PasswordField value={confirmNewPassword} onChange={setConfirmNewPassword} placeholder="••••••••" autoComplete="new-password" required />
            </label>
            <button type="submit" className="btn-sm" style={{ padding: "0.6rem 1.1rem" }} disabled={pwLoading}>
              {pwLoading ? "Updating…" : "Update Password"}
            </button>
            {pwMessage && <p className={`order-msg ${pwMessage.kind}`}>{pwMessage.text}</p>}
          </form>

          <form onSubmit={submitAccessKeyChange} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <h3 className="body-sm" style={{ color: "var(--on-surface)", fontWeight: 600 }}>Change Access Key</h3>
            <label className="form-label">
              Current Password
              <PasswordField value={currentPasswordForKey} onChange={setCurrentPasswordForKey} placeholder="••••••••" autoComplete="current-password" required />
            </label>
            <label className="form-label">
              New Access Key (4-digit PIN)
              <PasswordField
                value={newAccessKey}
                onChange={(v) => setNewAccessKey(v.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                required
                style={{ letterSpacing: "0.4em" }}
              />
            </label>
            <label className="form-label">
              Confirm New Access Key
              <PasswordField
                value={confirmNewAccessKey}
                onChange={(v) => setConfirmNewAccessKey(v.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                required
                style={{ letterSpacing: "0.4em" }}
              />
            </label>
            <button type="submit" className="btn-sm" style={{ padding: "0.6rem 1.1rem" }} disabled={keyLoading}>
              {keyLoading ? "Updating…" : "Update Access Key"}
            </button>
            {keyMessage && <p className={`order-msg ${keyMessage.kind}`}>{keyMessage.text}</p>}
          </form>
        </div>
      </div>

      {/* Fingerprint sign-in */}
      <div className="card">
        <div className="card-header">
          <h2 className="title-sm">Fingerprint Sign-in</h2>
        </div>
        {!biometricSupported ? (
          <p className="label-sm" style={{ textTransform: "none", color: "var(--on-surface-variant)" }}>
            This browser or device doesn't support fingerprint / biometric sign-in (a platform authenticator like
            Touch ID, Windows Hello, or an Android fingerprint reader is required).
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <p className="label-sm" style={{ textTransform: "none", color: "var(--on-surface-variant)" }}>
              Register this device's fingerprint reader so you can sign in without typing your password or access key.
            </p>

            {biometricCredentials.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {biometricCredentials.map((cred) => (
                  <li
                    key={cred.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.6rem 0.85rem",
                      background: "var(--surface-variant)",
                      borderRadius: "0.5rem"
                    }}
                  >
                    <span className="body-sm">
                      👆 {cred.nickname ?? "Registered device"}
                      <span className="label-sm" style={{ display: "block", color: "var(--on-surface-variant)", textTransform: "none" }}>
                        Added {new Date(cred.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        {cred.lastUsedAt ? ` · last used ${new Date(cred.lastUsedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}
                      </span>
                    </span>
                    <button type="button" className="btn-sm" onClick={() => void removeBiometric(cred.id)} disabled={biometricLoading}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className="btn-sm" style={{ padding: "0.6rem 1.1rem", alignSelf: "flex-start" }} onClick={() => void enrollBiometric()} disabled={biometricLoading}>
              {biometricLoading ? "Waiting for fingerprint…" : "+ Register This Device's Fingerprint"}
            </button>
            {biometricMessage && <p className={`order-msg ${biometricMessage.kind}`}>{biometricMessage.text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
