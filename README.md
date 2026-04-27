# 🔐 VaultX — Gestionnaire de mots de passe chiffré offline-first

> **The Engine: The Solutions Hackathon 2025–2026**  
> Équipe: ALE GONH-GOH Olushègun Clinton & KOUDADZE Kodjogan Josias  
> IPNET Institute of Technology — Lomé, Togo

---

## 📋 Table des matières

- [Présentation](#présentation)
- [Fonctionnalités MVP](#fonctionnalités-mvp)
- [Architecture technique](#architecture-technique)
- [Sécurité cryptographique](#sécurité-cryptographique)
- [Installation & lancement](#installation--lancement)
- [Structure du projet](#structure-du-projet)
- [Roadmap](#roadmap)
- [Licence](#licence)
- [Vidéo](#Vidéo)

---

## Présentation

**VaultX** est un gestionnaire de mots de passe **chiffré de bout en bout**, conçu pour fonctionner **sans connexion internet** (*offline-first*). Il s'adresse aux particuliers, PME et équipes africaines qui ont besoin d'une solution :

- 🇫🇷 **Entièrement en français**
- 🔒 **Zero-knowledge** — les développeurs de VaultX ne peuvent PAS accéder à vos mots de passe
- 📱 **Offline-first** — fonctionne sans connexion internet
- 🆓 **Open source** — auditable par la communauté
- ⚡ **Léger** — pas d'installation lourde

### Pourquoi VaultX ?

| Solution | Limite pour notre contexte |
|----------|---------------------------|
| LastPass | Payant, cloud centralisé, fuite majeure en 2022 |
| Bitwarden | Interface complexe, connectivité requise |
| 1Password | Payant (3-5 $/mois), cloud obligatoire |
| KeePass | Interface datée, pas de mobile natif moderne |
| **VaultX** | ✅ Offline-first, français, open source, léger |

---

## Fonctionnalités MVP

### 🗄️ Coffre-fort sécurisé
- Chiffrement **AES-256-GCM** (standard militaire)
- Dérivation de clé **PBKDF2-SHA256** avec 310 000 itérations (recommandation NIST 2023)
- Sel aléatoire unique par utilisateur (32 bytes)
- Verrouillage automatique après 5 minutes d'inactivité
- **Zéro donnée en clair** stockée sur le disque

### 🗂️ Gestion des identifiants
- Stockage structuré : site, URL, identifiant, mot de passe, notes chiffrées
- Catégorisation par dossiers (Banque, Réseaux sociaux, Travail…)
- Recherche instantanée par nom, URL ou identifiant
- Copie en un clic avec **effacement automatique du presse-papiers** après 30 secondes
- Filtres par catégorie

### 🔑 Générateur de mot de passe fort
- Génération via **Web Crypto API** (`window.crypto.getRandomValues`) — cryptographiquement sécurisée
- Paramètres configurables : longueur (8–128), majuscules, minuscules, chiffres, symboles
- Exclusion des caractères ambigus (0/O, I/l)
- Génération de **phrases de passe** (*passphrase*) avec séparateur configurable
- Score de robustesse en temps réel

### 🛡️ Audit de sécurité
- Détection des mots de passe **faibles**
- Détection des mots de passe **réutilisés** entre plusieurs entrées
- Alerte sur les mots de passe **trop anciens** (> 90 jours)
- **Score de sécurité global** du coffre en pourcentage

### 📦 Portabilité
- Export du coffre en fichier `.vaultx` (JSON chiffré AES-256)
- Fichier exporté **inutilisable sans le mot de passe maître**
- Import depuis LastPass, Bitwarden, 1Password (formats CSV)

---

## Architecture technique

```
┌─────────────────────────────────────────────────────────┐
│                    NAVIGATEUR (Client)                    │
│                                                          │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────┐ │
│  │  React 18  │   │ Web Crypto   │   │  IndexedDB    │ │
│  │   + Vite   │◄──│ API (natif)  │──►│  via Dexie.js │ │
│  │  Frontend  │   │ AES-256-GCM  │   │ (local only)  │ │
│  └────────────┘   │ PBKDF2-SHA256│   └───────────────┘ │
│                   └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
            ⚠️ Aucune clé ne quitte le navigateur
            
┌─────────────────────────────────────────────────────────┐
│              BACKEND (optionnel, pour sync)              │
│                                                          │
│  Node.js 20 + Express  →  SQLite / PostgreSQL           │
│  Ne manipule que des blobs chiffrés opaques             │
└─────────────────────────────────────────────────────────┘
```

### Stack technologique

| Couche | Technologie | Justification |
|--------|------------|---------------|
| **Frontend** | React 18 + Vite | SPA ultra-rapide, PWA pour usage offline |
| **UI / Design** | TailwindCSS + Radix UI | Composants accessibles, dark mode natif |
| **Chiffrement** | Web Crypto API (natif) | AES-256-GCM + PBKDF2, zéro lib externe |
| **Stockage local** | IndexedDB via Dexie.js | Persistance offline, performante |
| **Audit robustesse** | zxcvbn (Dropbox OSS) | Force des mots de passe sans appel réseau |
| **Extension** | WebExtension Manifest V3 | Chrome / Firefox / Edge |
| **Backend (opt.)** | Node.js 20 + Express | Sync chiffrée entre appareils |
| **Base de données** | SQLite / PostgreSQL | Légèreté individuelle, scalabilité équipe |
| **Conteneurs** | Docker + Docker Compose | Déploiement reproductible |
| **Tests** | Vitest + Playwright | Tests unitaires + E2E |

---

## Sécurité cryptographique

### Flux de chiffrement complet

```
Mot de passe maître (utilisateur)
           │
           ▼
    ┌─────────────┐     Sel aléatoire (32 bytes, unique par user)
    │   PBKDF2    │◄────────────────────────────────────────────┘
    │  SHA-256    │
    │ 310 000 it. │
    └──────┬──────┘
           │
           ▼
    Clé AES-256 (dérivée, jamais stockée)
           │
           ▼
    ┌─────────────┐     IV aléatoire (12 bytes, unique par chiffrement)
    │  AES-256-   │◄────────────────────────────────────────────────────┘
    │     GCM     │
    │ (avec tag   │
    │  auth.)     │
    └──────┬──────┘
           │
           ▼
    Blob chiffré = sel + IV + ciphertext + tag GCM
           │
           ▼
    Stocké dans IndexedDB (local uniquement)
```

### Garanties de sécurité

- ✅ **Zero-knowledge** : même les serveurs VaultX (si sync active) ne peuvent pas déchiffrer
- ✅ **AES-256-GCM** : intégrité et confidentialité garanties par le tag d'authentification
- ✅ **310 000 itérations PBKDF2** : résistance aux attaques par brute force (recommandation NIST SP 800-132 rev. 2023)
- ✅ **Sel unique** par utilisateur : résistance aux attaques par rainbow tables
- ✅ **IV unique** par chiffrement : résistance aux attaques par réutilisation de nonce
- ✅ **Effacement mémoire** : clé dérivée effacée après verrouillage ou inactivité
- ✅ **Clipboard auto-clear** : presse-papiers effacé 30 secondes après copie

---

## Installation & lancement

### Prérequis

```bash
Node.js >= 18.x
npm >= 9.x
```

### Développement local

```bash
# Cloner le dépôt
git clone https://github.com/votre-username/vaultx.git
cd vaultx

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Ouvrir http://localhost:5173
```

### Production (build)

```bash
npm run build
npm run preview
```

### Via Docker

```bash
docker compose up -d
# Ouvre http://localhost:3000
```

### Lancer les tests

```bash
npm run test          # Tests unitaires (Vitest)
npm run test:e2e      # Tests End-to-End (Playwright)
```

---

## Structure du projet

```
vaultx/
├── src/
│   ├── components/
│   │   ├── EntryCard.jsx       # Carte d'affichage d'une entrée
│   │   ├── EntryForm.jsx       # Formulaire ajout/modification
│   │   ├── StrengthBar.jsx     # Barre de force du mot de passe
│   │   └── Toast.jsx           # Notifications temporaires
│   ├── hooks/
│   │   ├── useAutoLock.js      # Hook de verrouillage automatique
│   │   └── useClipboard.js     # Hook copie + auto-clear
│   ├── utils/
│   │   ├── crypto.js           # Couche cryptographie (Web Crypto API)
│   │   ├── storage.js          # Couche stockage (IndexedDB via Dexie)
│   │   └── passwordScore.js    # Évaluation robustesse (zxcvbn)
│   ├── pages/
│   │   ├── CreateVault.jsx     # Création du coffre
│   │   ├── UnlockVault.jsx     # Déverrouillage
│   │   ├── VaultDashboard.jsx  # Interface principale
│   │   ├── AuditPage.jsx       # Audit de sécurité
│   │   └── GeneratorPage.jsx   # Générateur de mots de passe
│   ├── stores/
│   │   └── vaultStore.js       # État global (Zustand)
│   └── App.jsx
├── extension/                  # Extension navigateur (Manifest V3)
│   ├── manifest.json
│   ├── popup/
│   └── content/
├── backend/                    # API de synchronisation (optionnelle)
│   ├── src/
│   │   ├── routes/sync.js
│   │   └── middleware/auth.js
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── vite.config.js
├── tailwind.config.js
├── vitest.config.js
└── README.md
```

---

## Roadmap

### MVP (actuel)
- [x] Coffre chiffré AES-256-GCM offline
- [x] Générateur de mots de passe cryptographiquement sécurisé
- [x] Audit de sécurité (faibles, réutilisés, anciens)
- [x] Export/Import `.vaultx`
- [x] Interface française, dark mode

### Version 2.0
- [ ] Authentification biométrique (Face ID, empreinte)
- [ ] Partage sécurisé de mots de passe entre membres d'équipe
- [ ] Vérification HaveIBeenPwned (mode k-anonymat)
- [ ] Extension navigateur avec auto-remplissage
- [ ] Application mobile React Native

### Version 3.0
- [ ] Support passkeys / FIDO2
- [ ] Synchronisation E2E entre appareils
- [ ] Mode équipe avec gestion des rôles (admin / membre)

---

## Licence

MIT License — Voir [LICENSE](LICENSE)

---

## Auteurs

| Nom | Matricule | Établissement |
|-----|-----------|---------------|
| ALE GONH-GOH Olushègun Clinton | — | IPNET Institute of Technology |
| KOUDADZE Kodjogan Josias | — | IPNET Institute of Technology |

Niveau : Licence 1 Informatique — Réseaux  
Année académique : 2025–2026

♦Voici le lien déployé sur Vercel

https://vaultx-uw35.vercel.app/

♦Vidéo 7 min

https://drive.google.com/file/d/1vnTYGoRVaaTw73FmTblOHAxegmWJSFeX/view?usp=drive_link


<div align="center">
  <strong>VaultX</strong> — Vos mots de passe. Vos clés. Votre contrôle.
</div>
