import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/browser";
import { apiFetch } from "../api/client";

export type BiometricCredential = {
  id: string;
  nickname: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * True when this browser + device can actually complete a WebAuthn
 * "platform authenticator" ceremony — i.e. there's a built-in fingerprint
 * reader / Face ID / Windows Hello available, not just a USB security key.
 */
export async function isBiometricLoginAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/**
 * Enrolls a fingerprint/biometric credential for the currently authenticated
 * user. Call right after registration (or later from account settings).
 */
export async function registerBiometricCredential(token: string, nickname?: string) {
  const { options } = await apiFetch<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    "/auth/webauthn/register/options",
    {},
    token
  );

  let response: RegistrationResponseJSON;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    throw new Error(humanizeWebAuthnError(err));
  }

  return apiFetch<{ ok: boolean; credentialId: string }>(
    "/auth/webauthn/register/verify",
    { method: "POST", body: JSON.stringify({ response, nickname }) },
    token
  );
}

/**
 * Signs a user in with a previously-registered fingerprint instead of a
 * password or access key. Returns the same shape as a normal /auth/login.
 */
export async function loginWithBiometric(usernameOrEmail: string) {
  const { options, loginId } = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    loginId: string;
  }>("/auth/webauthn/login/options", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail })
  });

  let response: AuthenticationResponseJSON;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    throw new Error(humanizeWebAuthnError(err));
  }

  return apiFetch<{ token: string; user: Record<string, unknown> }>("/auth/webauthn/login/verify", {
    method: "POST",
    body: JSON.stringify({ loginId, response })
  });
}

export async function listBiometricCredentials(token: string) {
  return apiFetch<{ credentials: BiometricCredential[] }>("/auth/webauthn/credentials", {}, token);
}

export async function deleteBiometricCredential(token: string, credentialId: string) {
  return apiFetch<{ ok: boolean }>(`/auth/webauthn/credentials/${credentialId}`, { method: "DELETE" }, token);
}

function humanizeWebAuthnError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") {
    return "Fingerprint prompt was cancelled or timed out.";
  }
  if (name === "InvalidStateError") {
    return "This device is already registered for fingerprint sign-in.";
  }
  return (err as Error)?.message || "Fingerprint action failed.";
}
