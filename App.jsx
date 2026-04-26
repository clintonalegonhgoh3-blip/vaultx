// VaultX – Gestionnaire de mots de passe chiffré offline-first
// Stack: React 18 + Tailwind + Web Crypto API + IndexedDB (via localStorage simulé pour l'artifact)
// Auteurs: ALE GONH-GOH Olushègun Clinton & KOUDADZE Kodjogan Josias
// IPNET Institute of Technology – The Engine Hackathon 2025-2026

import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
// COUCHE CRYPTOGRAPHIE – Web Crypto API natif
// ─────────────────────────────────────────────
const Crypto = {
  async deriveKey(masterPassword, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(masterPassword), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, ["encrypt", "decrypt"]
    );
  },

  async encrypt(data, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data))
    );
    return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
  },

  async decrypt(encrypted, key) {
    const iv = new Uint8Array(encrypted.iv);
    const ciphertext = new Uint8Array(encrypted.ciphertext);
    const dec = new TextDecoder();
    const plain = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(dec.decode(plain));
  },

  generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(32));
  },

  generatePassword(length = 16, opts = {}) {
    const { upper = true, lower = true, numbers = true, symbols = true, noAmbiguous = true } = opts;
    let chars = "";
    if (lower) chars += noAmbiguous ? "abcdefghjkmnpqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz";
    if (upper) chars += noAmbiguous ? "ABCDEFGHJKMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (numbers) chars += noAmbiguous ? "23456789" : "0123456789";
    if (symbols) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";
    if (!chars) chars = "abcdefghjkmnpqrstuvwxyz";
    const arr = new Uint32Array(length);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(n => chars[n % chars.length]).join("");
  },

  scorePassword(pwd) {
    if (!pwd) return { score: 0, label: "Vide", color: "#ef4444", time: "Instantané" };
    let s = 0;
    if (pwd.length >= 8) s++;
    if (pwd.length >= 12) s++;
    if (pwd.length >= 16) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[a-z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    const labels = ["Très faible", "Faible", "Moyen", "Fort", "Très fort"];
    const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
    const times = ["Instantané", "Quelques minutes", "Quelques heures", "Des années", "Des siècles"];
    const idx = Math.min(Math.floor(s / 1.5), 4);
    return { score: Math.min(s * 14, 100), label: labels[idx], color: colors[idx], time: times[idx] };
  },

  async sha1Prefix(password) {
    const enc = new TextEncoder();
    const buf = await window.crypto.subtle.digest("SHA-1", enc.encode(password));
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    return { prefix: hex.slice(0, 5), suffix: hex.slice(5) };
  }
};

// ─────────────────────────────────────────────
// STOCKAGE LOCAL (simule IndexedDB / localStorage)
// ─────────────────────────────────────────────
const DB = {
  save(vaultBlob) {
    try { localStorage.setItem("vaultx_vault", JSON.stringify(vaultBlob)); return true; }
    catch { return false; }
  },
  load() {
    try { const d = localStorage.getItem("vaultx_vault"); return d ? JSON.parse(d) : null; }
    catch { return null; }
  },
  clear() { localStorage.removeItem("vaultx_vault"); }
};

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const CATEGORIES = ["Réseaux sociaux", "Banque & Finance", "Travail", "Shopping", "Email", "Jeux", "Santé", "Gouvernement", "Autre"];
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────
// PHRASE DE RÉCUPÉRATION (12 mots)
// ─────────────────────────────────────────────
const WORDLIST = [
  "alpha","bravo","cargo","delta","echo","folio","gamma","hotel","indigo","juliet",
  "kilo","lima","micro","nova","omega","papa","quest","romeo","sierra","tango",
  "ultra","victor","whisky","xray","yankee","zulu","amber","blade","cloud","drift",
  "ember","flame","grace","haven","ivory","jewel","karma","lunar","magic","noble",
  "orbit","pixel","quartz","river","stone","tiger","unity","valor","wave","xenon",
  "youth","zenith","anchor","bridge","castle","diamond","eagle","forest","garden","harbor",
  "island","jungle","knight","lagoon","meteor","night","ocean","palace","queen","radar",
  "shield","thunder","umbrella","valley","winter","xylophone","yoga","zero","arctic","bronze",
  "copper","depth","energy","falcon","glacier","horizon","iron","jasmine","kelvin","legend",
  "mountain","nectar","oasis","phoenix","quantum","rocket","summit","twilight","universe","violet"
];

function generateRecoveryPhrase() {
  const arr = new Uint32Array(12);
  window.crypto.getRandomValues(arr);
  return Array.from(arr).map(n => WORDLIST[n % WORDLIST.length]);
}

async function hashPhrase(words) {
  const enc = new TextEncoder();
  const buf = await window.crypto.subtle.digest("SHA-256", enc.encode(words.join(" ")));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// ─────────────────────────────────────────────
// ICÔNES SVG intégrées
// ─────────────────────────────────────────────
const Icon = {
  Shield: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Lock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  Unlock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>,
  Eye: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Copy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Key: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  AlertTriangle: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>,
  Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  RefreshCw: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Globe: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  User: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  BarChart: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  LogOut: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

// ─────────────────────────────────────────────
// COMPOSANTS UTILITAIRES
// ─────────────────────────────────────────────
function Toast({ message, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "success" ? "bg-emerald-500" : type === "error" ? "bg-red-500" : "bg-blue-500";
  return (
    <div className={`fixed bottom-6 right-6 ${bg} text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 animate-slideUp`}>
      {type === "success" ? <Icon.Check /> : <Icon.AlertTriangle />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

function StrengthBar({ password }) {
  const { score, label, color, time } = Crypto.scorePassword(password);
  return (
    <div className="space-y-1">
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between text-xs" style={{ color }}>
        <span>{label}</span>
        <span>⏱ {time}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: CRÉATION DU COFFRE
// ─────────────────────────────────────────────
function CreateVaultPage({ onCreate }) {
  const [master, setMaster] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1); // 1=formulaire 2=afficher phrase 3=confirmer phrase
  const [phrase, setPhrase] = useState([]);
  const [phraseConfirm, setPhraseConfirm] = useState(Array(12).fill(""));
  const [phraseError, setPhraseError] = useState("");

  const handleCreate = async () => {
    if (master.length < 8) { setError("Le mot de passe maître doit faire au moins 8 caractères."); return; }
    if (master !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    const words = generateRecoveryPhrase();
    setPhrase(words);
    setStep(2);
  };

  const handleConfirmPhrase = async () => {
    const entered = phraseConfirm.map(w => w.trim().toLowerCase());
    if (entered.join(" ") !== phrase.join(" ")) {
      setPhraseError("Les mots ne correspondent pas. Vérifiez l'ordre.");
      return;
    }
    setLoading(true);
    try {
      const salt = Crypto.generateSalt();
      const key = await Crypto.deriveKey(master, salt);
      const vault = { entries: [], createdAt: new Date().toISOString() };
      const encrypted = await Crypto.encrypt(vault, key);
      const phraseHash = await hashPhrase(phrase);
      const phraseSalt = Crypto.generateSalt();
      const phraseKey = await Crypto.deriveKey(phrase.join(" "), phraseSalt);
      const encryptedMaster = await Crypto.encrypt({ master }, phraseKey);
      DB.save({ encrypted, salt: Array.from(salt), version: 1,
        recovery: { phraseHash, phraseSalt: Array.from(phraseSalt), encryptedMaster }
      });
      onCreate(key, vault);
    } catch { setError("Erreur lors de la création du coffre."); }
    setLoading(false);
  };

  // Étape 2 — Afficher la phrase
  if (step === 2) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black" style={{ color: "#00d4ff", fontFamily: "'Courier New', monospace" }}>VaultX</h1>
          <p className="text-white/40 text-sm mt-1">Phrase de récupération</p>
        </div>
        <div className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-3 mb-5 p-4 rounded-xl" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}>
            <span className="text-yellow-400 text-lg flex-shrink-0">⚠️</span>
            <p className="text-yellow-300 text-xs leading-relaxed">
              <strong>Notez ces 12 mots dans l'ordre sur papier.</strong><br/>
              Ils sont la seule façon de récupérer votre coffre si vous oubliez votre mot de passe maître. Ne les stockez jamais numériquement.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {phrase.map((word, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="text-white/30 text-xs w-4">{i+1}.</span>
                <span className="text-white font-mono text-sm font-bold">{word}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigator.clipboard.writeText(phrase.join(" "))}
            className="w-full py-2 rounded-xl text-white/60 text-sm mb-3 hover:bg-white/5 border border-white/10 flex items-center justify-center gap-2">
            <Icon.Copy /> Copier la phrase
          </button>
          <button onClick={() => { setPhraseConfirm(Array(12).fill("")); setStep(3); }}
            className="w-full py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
            J'ai noté ma phrase → Continuer
          </button>
        </div>
      </div>
    </div>
  );

  // Étape 3 — Confirmer la phrase
  if (step === 3) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black" style={{ color: "#00d4ff", fontFamily: "'Courier New', monospace" }}>VaultX</h1>
          <p className="text-white/40 text-sm mt-1">Confirmer la phrase</p>
        </div>
        <div className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
          <p className="text-white/60 text-sm mb-4">Entrez vos 12 mots dans l'ordre pour confirmer.</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {phraseConfirm.map((word, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-white/30 text-xs w-4 flex-shrink-0">{i+1}.</span>
                <input type="text" value={word}
                  onChange={e => { const n=[...phraseConfirm]; n[i]=e.target.value; setPhraseConfirm(n); setPhraseError(""); }}
                  className="flex-1 px-2 py-1.5 rounded-lg text-white text-xs font-mono outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  placeholder={`mot ${i+1}`}
                />
              </div>
            ))}
          </div>
          {phraseError && <div className="flex items-center gap-2 text-red-400 text-xs p-3 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.1)" }}><Icon.AlertTriangle />{phraseError}</div>}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl text-white/60 text-sm border border-white/10 hover:bg-white/5">← Revoir</button>
            <button onClick={handleConfirmPhrase} disabled={loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
              {loading ? "Création..." : "Créer le coffre →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Courier New', monospace", color: "#00d4ff", letterSpacing: "-1px" }}>VaultX</h1>
          <p className="text-white/40 text-sm mt-1">Gestionnaire de mots de passe chiffré</p>
        </div>

        <div className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)", backdropFilter: "blur(20px)" }}>
          <h2 className="text-white font-bold text-xl mb-1">Créer votre coffre-fort</h2>
          <p className="text-white/40 text-sm mb-6">Votre clé maître ne quittera jamais cet appareil.</p>

          <div className="space-y-4">
            <div>
              <label className="text-white/60 text-xs uppercase tracking-widest mb-2 block">Mot de passe maître</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={master}
                  onChange={e => { setMaster(e.target.value); setError(""); }}
                  placeholder="Minimum 8 caractères..."
                  className="w-full px-4 py-3 rounded-xl text-white text-sm pr-12 outline-none focus:ring-1"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", focusRingColor: "#00d4ff" }}
                />
                <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                  {show ? <Icon.EyeOff /> : <Icon.Eye />}
                </button>
              </div>
              {master && <div className="mt-2"><StrengthBar password={master} /></div>}
            </div>

            <div>
              <label className="text-white/60 text-xs uppercase tracking-widest mb-2 block">Confirmer</label>
              <input
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(""); }}
                placeholder="Répétez votre mot de passe..."
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)" }}>
                <Icon.AlertTriangle />{error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}
            >
              {loading ? "Chiffrement en cours..." : "Créer mon coffre-fort →"}
            </button>
          </div>

          <div className="mt-6 p-4 rounded-xl" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <p className="text-xs text-white/40 leading-relaxed">
              🔐 <strong className="text-white/60">AES-256-GCM</strong> + <strong className="text-white/60">PBKDF2 (310 000 itérations)</strong><br/>
              Chiffrement 100% local — aucune donnée envoyée sur internet.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: RÉCUPÉRATION PAR PHRASE
// ─────────────────────────────────────────────
function RecoveryPage({ onBack, onRecovered }) {
  const [words, setWords] = useState(Array(12).fill(""));
  const [step, setStep] = useState(1); // 1=entrer phrase, 2=nouveau mdp
  const [newMaster, setNewMaster] = useState("");
  const [confirmMaster, setConfirmMaster] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerifyPhrase = async () => {
    setLoading(true); setError("");
    try {
      const stored = DB.load();
      if (!stored?.recovery) { setError("Aucune phrase de récupération enregistrée."); setLoading(false); return; }
      const entered = words.map(w => w.trim().toLowerCase());
      const enteredHash = await hashPhrase(entered);
      if (enteredHash !== stored.recovery.phraseHash) {
        setError("Phrase incorrecte. Vérifiez l'ordre et l'orthographe des mots.");
        setLoading(false); return;
      }
      setStep(2);
    } catch { setError("Erreur de vérification."); }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (newMaster.length < 8) { setError("Minimum 8 caractères."); return; }
    if (newMaster !== confirmMaster) { setError("Les mots de passe ne correspondent pas."); return; }
    setLoading(true);
    try {
      const stored = DB.load();
      // Déchiffrer les données avec l'ancienne clé (via phrase)
      const phraseSalt = new Uint8Array(stored.recovery.phraseSalt);
      const phraseKey = await Crypto.deriveKey(words.map(w=>w.trim().toLowerCase()).join(" "), phraseSalt);
      const { master: oldMaster } = await Crypto.decrypt(stored.recovery.encryptedMaster, phraseKey);
      const oldSalt = new Uint8Array(stored.salt);
      const oldKey = await Crypto.deriveKey(oldMaster, oldSalt);
      const vault = await Crypto.decrypt(stored.encrypted, oldKey);
      // Rechiffrer avec le nouveau mot de passe
      const newSalt = Crypto.generateSalt();
      const newKey = await Crypto.deriveKey(newMaster, newSalt);
      const newEncrypted = await Crypto.encrypt(vault, newKey);
      // Nouveau hash de phrase
      const newPhraseSalt = Crypto.generateSalt();
      const newPhraseKey = await Crypto.deriveKey(words.map(w=>w.trim().toLowerCase()).join(" "), newPhraseSalt);
      const newEncMaster = await Crypto.encrypt({ master: newMaster }, newPhraseKey);
      const phraseHash = await hashPhrase(words.map(w=>w.trim().toLowerCase()));
      DB.save({
        encrypted: newEncrypted, salt: Array.from(newSalt), version: 1,
        recovery: { phraseHash, phraseSalt: Array.from(newPhraseSalt), encryptedMaster: newEncMaster }
      });
      onRecovered(newKey, vault);
    } catch(e) { setError("Erreur lors de la réinitialisation. Vérifiez votre phrase."); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black" style={{ color: "#00d4ff", fontFamily: "'Courier New', monospace" }}>VaultX</h1>
          <p className="text-white/40 text-sm mt-1">{step === 1 ? "Récupération du coffre" : "Nouveau mot de passe"}</p>
        </div>
        <div className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
          {step === 1 ? (
            <>
              <p className="text-white/60 text-sm mb-4">Entrez vos 12 mots de récupération dans l'ordre exact.</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {words.map((w, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-white/30 text-xs w-4 flex-shrink-0">{i+1}.</span>
                    <input type="text" value={w}
                      onChange={e => { const n=[...words]; n[i]=e.target.value; setWords(n); setError(""); }}
                      className="flex-1 px-2 py-1.5 rounded-lg text-white text-xs font-mono outline-none"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                      placeholder={`mot ${i+1}`}
                    />
                  </div>
                ))}
              </div>
              {error && <div className="flex items-center gap-2 text-red-400 text-xs p-3 rounded-xl mb-3" style={{ background: "rgba(239,68,68,0.1)" }}><Icon.AlertTriangle />{error}</div>}
              <div className="flex gap-3">
                <button onClick={onBack} className="flex-1 py-2.5 rounded-xl text-white/60 text-sm border border-white/10 hover:bg-white/5">← Retour</button>
                <button onClick={handleVerifyPhrase} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
                  {loading ? "Vérification..." : "Vérifier →"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <Icon.Check /><span className="text-emerald-400 text-sm font-medium">Phrase vérifiée ✓ Définissez votre nouveau mot de passe</span>
              </div>
              <div className="space-y-3">
                <input type="password" value={newMaster} onChange={e=>{setNewMaster(e.target.value);setError("");}}
                  placeholder="Nouveau mot de passe maître..."
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
                {newMaster && <StrengthBar password={newMaster} />}
                <input type="password" value={confirmMaster} onChange={e=>{setConfirmMaster(e.target.value);setError("");}}
                  placeholder="Confirmer le mot de passe..."
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
              {error && <div className="flex items-center gap-2 text-red-400 text-xs p-3 rounded-xl mt-3" style={{ background: "rgba(239,68,68,0.1)" }}><Icon.AlertTriangle />{error}</div>}
              <button onClick={handleResetPassword} disabled={loading}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
                {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: DÉVERROUILLAGE
// ─────────────────────────────────────────────
function UnlockPage({ onUnlock, onReset, onRecover }) {
  const [master, setMaster] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async () => {
    setLoading(true); setError("");
    try {
      const stored = DB.load();
      if (!stored) { setError("Aucun coffre trouvé."); setLoading(false); return; }
      const salt = new Uint8Array(stored.salt);
      const key = await Crypto.deriveKey(master, salt);
      const vault = await Crypto.decrypt(stored.encrypted, key);
      onUnlock(key, vault);
    } catch { setError("Mot de passe incorrect."); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}>
            <Icon.Lock />
          </div>
          <h1 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Courier New', monospace", color: "#00d4ff" }}>VaultX</h1>
          <p className="text-white/40 text-sm mt-1">Coffre verrouillé</p>
        </div>

        <div className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="space-y-4">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={master}
                onChange={e => { setMaster(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleUnlock()}
                placeholder="Mot de passe maître..."
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-white text-sm pr-12 outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.1)"}` }}
              />
              <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                {show ? <Icon.EyeOff /> : <Icon.Eye />}
              </button>
            </div>

            {error && <div className="text-red-400 text-sm flex items-center gap-2"><Icon.AlertTriangle />{error}</div>}

            <button
              onClick={handleUnlock}
              disabled={loading || !master}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #00d4ff, #0066ff)" }}
            >
              {loading ? "Déchiffrement..." : "Déverrouiller →"}
            </button>

            <button onClick={onRecover} className="w-full py-2 text-cyan-400/70 hover:text-cyan-400 text-xs transition-colors font-medium">
              🔑 Mot de passe oublié ? Utiliser ma phrase de récupération
            </button>
            <button onClick={onReset} className="w-full py-2 text-white/30 hover:text-red-400 text-xs transition-colors">
              Réinitialiser le coffre (⚠️ supprime toutes les données)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT: FORMULAIRE ENTRÉE
// ─────────────────────────────────────────────
function EntryForm({ initial = null, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    title: "", url: "", username: "", password: "", notes: "", category: "Autre"
  });
  const [showPwd, setShowPwd] = useState(false);
  const [genOpts, setGenOpts] = useState({ length: 16, upper: true, lower: true, numbers: true, symbols: true, noAmbiguous: true });
  const [showGen, setShowGen] = useState(false);

  const generateAndFill = () => {
    setForm(f => ({ ...f, password: Crypto.generatePassword(genOpts.length, genOpts) }));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-lg rounded-2xl p-6 border max-h-[90vh] overflow-y-auto" style={{ background: "#0d1117", borderColor: "rgba(255,255,255,0.1)" }}>
        <h3 className="text-white font-bold text-lg mb-5">{initial ? "Modifier l'entrée" : "Nouvelle entrée"}</h3>

        <div className="space-y-3">
          {[["Titre / Site", "title", "text"], ["URL", "url", "url"], ["Identifiant / Email", "username", "text"]].map(([label, key, type]) => (
            <div key={key}>
              <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">{label}</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                  {key === "url" ? <Icon.Globe /> : <Icon.User />}
                </div>
                <input
                  type={type} value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
          ))}

          <div>
            <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">Mot de passe</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"><Icon.Key /></div>
              <input
                type={showPwd ? "text" : "password"} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full pl-9 pr-20 py-2.5 rounded-xl text-white text-sm outline-none font-mono"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button onClick={() => setShowGen(!showGen)} className="p-1 text-white/40 hover:text-white/80" title="Générateur"><Icon.RefreshCw /></button>
                <button onClick={() => setShowPwd(!showPwd)} className="p-1 text-white/40 hover:text-white/80">{showPwd ? <Icon.EyeOff /> : <Icon.Eye />}</button>
              </div>
            </div>
            {form.password && <div className="mt-1"><StrengthBar password={form.password} /></div>}
          </div>

          {showGen && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-sm font-medium">Générateur</span>
                <button onClick={generateAndFill} className="px-3 py-1 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#00d4ff,#0066ff)" }}>
                  Générer
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-xs">Longueur: {genOpts.length}</span>
                <input type="range" min="8" max="64" value={genOpts.length}
                  onChange={e => setGenOpts(g => ({ ...g, length: +e.target.value }))}
                  className="flex-1 accent-cyan-400" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[["Majuscules", "upper"], ["Minuscules", "lower"], ["Chiffres", "numbers"], ["Symboles", "symbols"], ["Éviter ambigus", "noAmbiguous"]].map(([label, key]) => (
                  <label key={key} className="flex items-center gap-2 text-white/60 text-xs cursor-pointer">
                    <input type="checkbox" checked={genOpts[key]} onChange={e => setGenOpts(g => ({ ...g, [key]: e.target.checked }))} className="accent-cyan-400" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">Catégorie</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {CATEGORIES.map(c => <option key={c} value={c} style={{ background: "#0d1117" }}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">Notes chiffrées</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full px-4 py-2.5 rounded-xl text-white text-sm outline-none resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-white/60 text-sm hover:bg-white/5 border border-white/10">Annuler</button>
          <button
            onClick={() => form.title && form.password && onSave(form)}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#00d4ff,#0066ff)" }}>
            {initial ? "Enregistrer" : "Ajouter au coffre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT: CARTE ENTRÉE
// ─────────────────────────────────────────────
function EntryCard({ entry, onEdit, onDelete, onCopy }) {
  const [showPwd, setShowPwd] = useState(false);
  const { score, color } = Crypto.scorePassword(entry.password);

  return (
    <div className="rounded-xl p-4 border transition-all hover:border-cyan-500/30 group" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-white font-semibold text-sm truncate">{entry.title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff" }}>{entry.category}</span>
          </div>
          {entry.username && <p className="text-white/40 text-xs truncate">{entry.username}</p>}
          {entry.url && <p className="text-white/30 text-xs truncate">{entry.url}</p>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><Icon.Edit /></button>
          <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10"><Icon.Trash /></button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          <span className="font-mono text-xs text-white/70 flex-1 truncate">
            {showPwd ? entry.password : "•".repeat(Math.min(entry.password?.length || 8, 20))}
          </span>
          <button onClick={() => setShowPwd(!showPwd)} className="text-white/30 hover:text-white/70 flex-shrink-0">
            {showPwd ? <Icon.EyeOff /> : <Icon.Eye />}
          </button>
        </div>
        <button onClick={() => onCopy(entry.password)} className="p-1.5 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-cyan-400/10 transition-all" title="Copier">
          <Icon.Copy />
        </button>
      </div>

      {/* Barre de force */}
      <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: AUDIT DE SÉCURITÉ
// ─────────────────────────────────────────────
function AuditPage({ entries }) {
  const weak = entries.filter(e => Crypto.scorePassword(e.password).score < 42);
  const pwdMap = {};
  entries.forEach(e => { if (e.password) { pwdMap[e.password] = (pwdMap[e.password] || []); pwdMap[e.password].push(e.title); } });
  const reused = entries.filter(e => e.password && pwdMap[e.password].length > 1);
  const old = entries.filter(e => {
    const days = (Date.now() - new Date(e.createdAt).getTime()) / 86400000;
    return days > 90;
  });

  const totalIssues = weak.length + reused.length + old.length;
  const score = Math.max(0, 100 - totalIssues * 10);

  const scoreColor = score >= 80 ? "#10b981" : score >= 60 ? "#eab308" : "#ef4444";

  return (
    <div className="space-y-6">
      {/* Score global */}
      <div className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">Score de sécurité</h3>
            <p className="text-white/40 text-sm">{entries.length} entrées analysées</p>
          </div>
          <div className="text-5xl font-black" style={{ color: scoreColor }}>{score}<span className="text-2xl text-white/30">%</span></div>
        </div>
        <div className="mt-4 h-3 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${score}%`, backgroundColor: scoreColor }} />
        </div>
      </div>

      {/* Problèmes */}
      {[
        { title: "Mots de passe faibles", items: weak, color: "#ef4444", icon: "🔴" },
        { title: "Mots de passe réutilisés", items: reused, color: "#f97316", icon: "🟠" },
        { title: "Mots de passe anciens (+90j)", items: old, color: "#eab308", icon: "🟡" },
      ].map(({ title, items, color, icon }) => (
        <div key={title} className="rounded-2xl p-5 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-semibold text-sm flex items-center gap-2">{icon} {title}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${color}22`, color }}>
              {items.length} entrée{items.length > 1 ? "s" : ""}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="text-emerald-400 text-xs flex items-center gap-1"><Icon.Check /> Aucun problème détecté</p>
          ) : (
            <div className="space-y-1">
              {items.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs text-white/50 py-1 border-b border-white/5 last:border-0">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  {e.title}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// APP PRINCIPALE
// ─────────────────────────────────────────────
export default function VaultXApp() {
  const [state, setState] = useState("loading"); // loading | create | unlock | open
  const [cryptoKey, setCryptoKey] = useState(null);
  const [vault, setVault] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [activeTab, setActiveTab] = useState("coffre");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [toast, setToast] = useState(null);
  const lockTimer = useRef(null);

  // Initialisation
  useEffect(() => {
    const stored = DB.load();
    setState(stored ? "unlock" : "create");
  }, []);

  // Auto-lock
  const resetLockTimer = useCallback(() => {
    clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      setCryptoKey(null); setVault(null); setState("unlock");
    }, LOCK_TIMEOUT);
  }, []);

  useEffect(() => {
    if (state === "open") {
      window.addEventListener("mousemove", resetLockTimer);
      window.addEventListener("keydown", resetLockTimer);
      resetLockTimer();
      return () => {
        window.removeEventListener("mousemove", resetLockTimer);
        window.removeEventListener("keydown", resetLockTimer);
        clearTimeout(lockTimer.current);
      };
    }
  }, [state, resetLockTimer]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const saveVault = async (newVault) => {
    try {
      const stored = DB.load();
      const salt = new Uint8Array(stored.salt);
      const encrypted = await Crypto.encrypt(newVault, cryptoKey);
      DB.save({ encrypted, salt: Array.from(salt), version: 1 });
      setVault(newVault);
    } catch { showToast("Erreur de sauvegarde", "error"); }
  };

  const handleCreate = (key, v) => { setCryptoKey(key); setVault(v); setState("open"); };
  const handleUnlock = (key, v) => { setCryptoKey(key); setVault(v); setState("open"); };
  const handleReset = () => { if (confirm("⚠️ Supprimer définitivement le coffre ?")) { DB.clear(); setState("create"); } };
  const handleLock = () => { setCryptoKey(null); setVault(null); setState("unlock"); };

  const handleSaveEntry = async (form) => {
    const newVault = { ...vault };
    if (editEntry) {
      newVault.entries = newVault.entries.map(e => e.id === editEntry.id ? { ...form, id: e.id, createdAt: e.createdAt, updatedAt: new Date().toISOString() } : e);
      showToast("Entrée modifiée");
    } else {
      newVault.entries = [...(newVault.entries || []), { ...form, id: Date.now().toString(), createdAt: new Date().toISOString() }];
      showToast("Entrée ajoutée au coffre");
    }
    await saveVault(newVault);
    setShowForm(false); setEditEntry(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    const newVault = { ...vault, entries: vault.entries.filter(e => e.id !== id) };
    await saveVault(newVault);
    showToast("Entrée supprimée");
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copié ! (effacé dans 30s)");
      setTimeout(() => navigator.clipboard.writeText(""), 30000);
    });
  };

  const handleExport = async () => {
    const stored = DB.load();
    const blob = new Blob([JSON.stringify(stored, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `vaultx-backup-${new Date().toISOString().split("T")[0]}.vaultx`;
    a.click();
    showToast("Coffre exporté (.vaultx chiffré)");
  };

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0f" }}><div className="text-white/40">Chargement...</div></div>;
  if (state === "create") return <CreateVaultPage onCreate={handleCreate} />;
  if (state === "recover") return <RecoveryPage onBack={() => setState("unlock")} onRecovered={handleUnlock} />;
  if (state === "unlock") return <UnlockPage onUnlock={handleUnlock} onReset={handleReset} onRecover={() => setState("recover")} />;

  // Interface principale
  const entries = vault?.entries || [];
  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title?.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q) || e.url?.toLowerCase().includes(q);
    const matchCat = filterCat === "Toutes" || e.category === filterCat;
    return matchSearch && matchCat;
  });

  const cats = ["Toutes", ...CATEGORIES.filter(c => entries.some(e => e.category === c))];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080b10", color: "white", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00d4ff,#0066ff)" }}>
            <Icon.Shield />
          </div>
          <span className="font-black text-lg tracking-tight" style={{ fontFamily: "'Courier New', monospace", color: "#00d4ff" }}>VaultX</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs">{entries.length} entrée{entries.length > 1 ? "s" : ""}</span>
          <button onClick={handleExport} className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all" title="Exporter le coffre"><Icon.Download /></button>
          <button onClick={handleLock} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 text-xs border border-white/10 transition-all">
            <Icon.Lock /> Verrouiller
          </button>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="flex gap-1 px-6 pt-4">
        {[["coffre", <Icon.Lock />, "Coffre"], ["audit", <Icon.BarChart />, "Audit"], ["generateur", <Icon.Key />, "Générateur"]].map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: activeTab === id ? "rgba(0,212,255,0.1)" : "transparent",
              color: activeTab === id ? "#00d4ff" : "rgba(255,255,255,0.4)",
              border: activeTab === id ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent"
            }}
          >
            {icon}{label}
          </button>
        ))}
      </nav>

      {/* Contenu */}
      <main className="flex-1 px-6 py-4 overflow-y-auto">

        {activeTab === "coffre" && (
          <div className="space-y-4">
            {/* Barre d'outils */}
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"><Icon.Search /></div>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-white text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
              <button
                onClick={() => { setEditEntry(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg,#00d4ff,#0066ff)" }}
              >
                <Icon.Plus />Ajouter
              </button>
            </div>

            {/* Filtres catégories */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {cats.map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
                  style={{
                    background: filterCat === c ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.04)",
                    color: filterCat === c ? "#00d4ff" : "rgba(255,255,255,0.4)",
                    border: `1px solid ${filterCat === c ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.06)"}`
                  }}>{c}</button>
              ))}
            </div>

            {/* Entrées */}
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔐</div>
                <p className="text-white/40 text-sm">{search ? "Aucun résultat" : "Votre coffre est vide. Ajoutez votre première entrée !"}</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map(e => (
                  <EntryCard key={e.id} entry={e}
                    onEdit={entry => { setEditEntry(entry); setShowForm(true); }}
                    onDelete={handleDelete} onCopy={handleCopy} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && <AuditPage entries={entries} />}

        {activeTab === "generateur" && <GeneratorPage onCopy={handleCopy} />}
      </main>

      {/* Formulaire modal */}
      {showForm && (
        <EntryForm
          initial={editEntry}
          onSave={handleSaveEntry}
          onCancel={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        select option { background: #0d1117; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: GÉNÉRATEUR STANDALONE
// ─────────────────────────────────────────────
function GeneratorPage({ onCopy }) {
  const [opts, setOpts] = useState({ length: 16, upper: true, lower: true, numbers: true, symbols: true, noAmbiguous: true });
  const [pwd, setPwd] = useState("");
  const [passphrase, setPassphrase] = useState(false);
  const [separator, setSeparator] = useState("-");

  useEffect(() => { generate(); }, [opts]);

  const generate = () => {
    if (passphrase) {
      const words = ["cyber","vault","secure","shield","alpha","nexus","crypto","force","prime","logic","pixel","node"];
      const w = Array.from(window.crypto.getRandomValues(new Uint8Array(4))).map(b => words[b % words.length]);
      setPwd(w.join(separator));
    } else {
      setPwd(Crypto.generatePassword(opts.length, opts));
    }
  };

  const { score, label, color, time } = Crypto.scorePassword(pwd);

  return (
    <div className="space-y-5 max-w-lg">
      <div className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="font-mono text-lg text-white break-all leading-relaxed mb-4 min-h-[2.5rem]">{pwd}</div>
        <div className="mb-4"><StrengthBar password={pwd} /></div>
        <div className="flex gap-2">
          <button onClick={generate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium hover:bg-white/10 border border-white/10 transition-all">
            <Icon.RefreshCw /> Régénérer
          </button>
          <button onClick={() => onCopy(pwd)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-all"
            style={{ background: "linear-gradient(135deg,#00d4ff,#0066ff)" }}>
            <Icon.Copy /> Copier
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-5 border space-y-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex gap-3">
          <button onClick={() => { setPassphrase(false); setTimeout(generate, 0); }}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: !passphrase ? "rgba(0,212,255,0.15)" : "transparent", color: !passphrase ? "#00d4ff" : "rgba(255,255,255,0.4)", border: `1px solid ${!passphrase ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}` }}>
            Mot de passe
          </button>
          <button onClick={() => { setPassphrase(true); setTimeout(generate, 0); }}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: passphrase ? "rgba(0,212,255,0.15)" : "transparent", color: passphrase ? "#00d4ff" : "rgba(255,255,255,0.4)", border: `1px solid ${passphrase ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}` }}>
            Phrase de passe
          </button>
        </div>

        {!passphrase ? (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-white/50 text-xs uppercase tracking-wider">Longueur</label>
                <span className="text-cyan-400 text-xs font-bold">{opts.length}</span>
              </div>
              <input type="range" min="8" max="128" value={opts.length}
                onChange={e => setOpts(o => ({ ...o, length: +e.target.value }))}
                className="w-full accent-cyan-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[["Majuscules (A-Z)", "upper"], ["Minuscules (a-z)", "lower"], ["Chiffres (0-9)", "numbers"], ["Symboles (!@#...)", "symbols"], ["Éviter ambigus (0/O, I/l)", "noAmbiguous"]].map(([label, key]) => (
                <label key={key} className="flex items-center gap-2 text-white/60 text-xs cursor-pointer py-1">
                  <input type="checkbox" checked={opts[key]} onChange={e => setOpts(o => ({ ...o, [key]: e.target.checked }))} className="accent-cyan-400 w-3 h-3" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wider mb-2 block">Séparateur</label>
            <div className="flex gap-2">
              {["-", "_", ".", " ", "!"].map(s => (
                <button key={s} onClick={() => { setSeparator(s); setTimeout(generate, 0); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-mono transition-all"
                  style={{ background: separator === s ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.05)", color: separator === s ? "#00d4ff" : "rgba(255,255,255,0.5)", border: `1px solid ${separator === s ? "rgba(0,212,255,0.3)" : "transparent"}` }}>
                  {s === " " ? "espace" : s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
