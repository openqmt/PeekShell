//! Client-side vault for `secrets_enc`.
//!
//! The login password is stretched with Argon2id (independent salt from the
//! server password hash) and used as an AES-256-GCM key. The Worker only
//! stores the envelope; it can never decrypt. The derived key stays in
//! process memory until logout.

use crate::error::{AppError, AppResult};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const VERIFIER_PLAINTEXT: &[u8] = b"peekshell-vault-v1";
const KDF: &str = "argon2id";
const ENVELOPE_VERSION: u32 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEnvelope {
    pub v: u32,
    pub kdf: String,
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
    pub verifier: String,
}

struct Unlocked {
    key: [u8; KEY_LEN],
    salt: [u8; SALT_LEN],
}

pub struct VaultState {
    inner: Mutex<Option<Unlocked>>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    fn guard(&self) -> std::sync::MutexGuard<'_, Option<Unlocked>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Unlock with the login password. When `envelope` is present (cloud already
/// has `secrets_enc`), derive against its salt and check the verifier so a
/// wrong password fails before we overwrite local secrets.
pub fn unlock(
    state: &VaultState,
    password: &str,
    envelope: Option<&VaultEnvelope>,
) -> AppResult<()> {
    if password.is_empty() {
        return Err(AppError::Message("vault_password".into()));
    }
    let (salt, key) = if let Some(env) = envelope {
        let salt = decode_salt(&env.salt)?;
        let key = derive_key(password.as_bytes(), &salt)?;
        verify_envelope(&key, env)?;
        (salt, key)
    } else {
        let mut salt = [0u8; SALT_LEN];
        rand::rngs::OsRng.fill_bytes(&mut salt);
        let key = derive_key(password.as_bytes(), &salt)?;
        (salt, key)
    };
    *state.guard() = Some(Unlocked { key, salt });
    Ok(())
}

pub fn lock(state: &VaultState) {
    *state.guard() = None;
}

pub fn is_unlocked(state: &VaultState) -> bool {
    state.guard().is_some()
}

/// Encrypt UTF-8 plaintext (secrets JSON) with the in-memory vault key.
pub fn encrypt(state: &VaultState, plaintext: &str) -> AppResult<VaultEnvelope> {
    let guard = state.guard();
    let unlocked = guard.as_ref().ok_or_else(|| AppError::Message("vault_locked".into()))?;
    let mut nonce = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ciphertext = aead_encrypt(&unlocked.key, &nonce, plaintext.as_bytes())?;
    let verifier = aead_encrypt(&unlocked.key, &verifier_nonce(&nonce), VERIFIER_PLAINTEXT)?;
    Ok(VaultEnvelope {
        v: ENVELOPE_VERSION,
        kdf: KDF.to_string(),
        salt: STANDARD.encode(unlocked.salt),
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
        verifier: STANDARD.encode(verifier),
    })
}

/// Decrypt an envelope with the in-memory vault key (salt must match unlock).
pub fn decrypt(state: &VaultState, envelope: &VaultEnvelope) -> AppResult<String> {
    let guard = state.guard();
    let unlocked = guard.as_ref().ok_or_else(|| AppError::Message("vault_locked".into()))?;
    verify_envelope(&unlocked.key, envelope)?;
    let nonce = decode_nonce(&envelope.nonce)?;
    let ciphertext = decode_b64(&envelope.ciphertext)?;
    let plain = aead_decrypt(&unlocked.key, &nonce, &ciphertext)?;
    String::from_utf8(plain).map_err(|_| AppError::Message("vault_corrupt".into()))
}

fn derive_key(password: &[u8], salt: &[u8; SALT_LEN]) -> AppResult<[u8; KEY_LEN]> {
    let params = Params::default();
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password, salt, &mut key)
        .map_err(|e| AppError::Message(e.to_string()))?;
    Ok(key)
}

fn verify_envelope(key: &[u8; KEY_LEN], envelope: &VaultEnvelope) -> AppResult<()> {
    if envelope.kdf != KDF {
        return Err(AppError::Message("vault_envelope".into()));
    }
    let nonce = decode_nonce(&envelope.nonce)?;
    let verifier = decode_b64(&envelope.verifier)?;
    let plain = aead_decrypt(key, &verifier_nonce(&nonce), &verifier)
        .map_err(|_| AppError::Message("vault_password".into()))?;
    if plain != VERIFIER_PLAINTEXT {
        return Err(AppError::Message("vault_password".into()));
    }
    Ok(())
}

fn aead_encrypt(key: &[u8; KEY_LEN], nonce: &[u8; NONCE_LEN], data: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Message("vault_key".into()))?;
    cipher
        .encrypt(Nonce::from_slice(nonce), data)
        .map_err(|_| AppError::Message("vault_encrypt".into()))
}

fn aead_decrypt(key: &[u8; KEY_LEN], nonce: &[u8; NONCE_LEN], data: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Message("vault_key".into()))?;
    cipher
        .decrypt(Nonce::from_slice(nonce), data)
        .map_err(|_| AppError::Message("vault_password".into()))
}

/// Distinct nonce for the verifier so GCM is never reused with the same (key, nonce).
fn verifier_nonce(nonce: &[u8; NONCE_LEN]) -> [u8; NONCE_LEN] {
    let mut out = *nonce;
    out[0] ^= 1;
    out
}

fn decode_b64(value: &str) -> AppResult<Vec<u8>> {
    STANDARD
        .decode(value.trim())
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(value.trim()))
        .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(value.trim()))
        .map_err(|_| AppError::Message("vault_envelope".into()))
}

fn decode_salt(value: &str) -> AppResult<[u8; SALT_LEN]> {
    let bytes = decode_b64(value)?;
    bytes
        .try_into()
        .map_err(|_| AppError::Message("vault_envelope".into()))
}

fn decode_nonce(value: &str) -> AppResult<[u8; NONCE_LEN]> {
    let bytes = decode_b64(value)?;
    bytes
        .try_into()
        .map_err(|_| AppError::Message("vault_envelope".into()))
}
