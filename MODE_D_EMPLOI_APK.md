# 📖 Mode d'emploi — Fabriquer l'APK sur GitHub

Ce dépôt contient **tout** ce qu'il faut pour produire l'APK Android du Métronome :
le code web (React/Vite) **et** le projet Android (Capacitor 7, dossier `android/`).
Un workflow GitHub Actions compile l'APK à chaque push — **aucune installation locale** nécessaire.

---

## 1 · Prérequis

| | |
|---|---|
| Un compte **GitHub** | gratuit |
| Un dépôt **public ou privé** | le build fonctionne dans les deux cas |
| Rien d'autre | pas de Java, pas d'Android SDK, pas d'Android Studio |

---

## 2 · Pousser le projet sur GitHub

### 2.1 — Créer le dépôt
Sur [github.com/new](https://github.com/new) → nommez-le **`metronome`** → **Create repository**.

> Le nom du dépôt est **sans importance** pour la compilation : `metronome`,
> `Metronome` ou `Métronome` donnent exactement le même résultat. Les URL
> GitHub sont insensibles à la casse. Utilisez simplement le même nom dans la
> commande `git remote` que celui affiché sur GitHub.

Ne cochez **rien** : pas de README, pas de .gitignore, pas de License
(le projet a déjà tous ses fichiers).

### 2.2 — Envoyer le code
Dans un terminal, à la racine du projet :

```bash
git init -b main
git add .
git commit -m "Métronome v1.0 — projet Android Capacitor"
git remote add origin https://github.com/TON_USER/metronome.git
git push -u origin main
```

### 2.3 — Vérifier AVANT de pousser (important !)

```bash
git ls-files android | grep -c capacitor-cordova-android-plugins   # doit être > 0
git ls-files android/gradlew                                        # doit répondre
```

* Si la première commande renvoie **0**, le dossier Cordova obligatoire n'est pas
  tracké → la compilation échouera. Corrigez avec :
  ```bash
  git add -f android/capacitor-android 2>/dev/null
  git add -f android/capacitor-cordova-android-plugins
  git commit -m "forcer l'ajout du dossier Cordova"
  ```
* `android/gradlew` doit être en mode **exécutable** (100755). Sinon :
  ```bash
  chmod +x android/gradlew && git update-index --chmod=+x android/gradlew && git commit -m "gradlew exécutable"
  ```

> **Rien de tout cela n'est nécessaire si vous utilisez le `.gitignore` fourni** :
> il a été écrit pour inclure `android/capacitor-cordova-android-plugins/`
> (ignoré par défaut par le `.gitignore` d'origine de Capacitor) et pour exclure
> `node_modules/`, `dist/` et les APK.

---

## 3 · Lancer la compilation

Le fichier **`.github/workflows/build-apk.yml`** fait tout automatiquement.

### Méthode A — manuelle (celle que vous voulez probablement)
1. Allez dans l'onglet **Actions** du dépôt
2. Choisissez **📦 Build APK Android** dans la colonne de gauche
3. Cliquez **Run workflow** → `main` → vert **Run workflow**

### Méthode B — automatique
Push n'importe quel commit sur `main` :

```bash
git add . && git commit -m "maj" && git push
```

⏱️ **Durée ≈ 3 à 6 minutes** la première fois (téléchargement de Gradle 8.13 et
des dépendances Android), puis **≈ 1 à 2 minutes** grâce au cache.

---

## 4 · Récupérer l'APK

1. Onglet **Actions** → cliquez sur le workflow vert ✔ **Compiler l'APK**
2. En bas, section **Artifacts**
3. Cliquez **Metronome-apk** → un `.zip` se télécharge
4. Décompressez : **`app-debug.apk`** (≈ 5 à 8 Mo)

L'APK est conservé **30 jours** sur GitHub.

---

## 5 · L'installer sur le téléphone

1. Copiez `app-debug.apk` sur le téléphone (câble USB, Google Drive, e-mail…)
2. Touchez le fichier
3. Android affiche *« Installation bloquée »* → **Paramètres** → autorisez
   **« Installer des apps inconnues »** pour votre gestionnaire de fichiers
4. Réessayez → **Installer**
5. Ouvrez **Métronome** → acceptez l'autorisation **Microphone**
   (indispensable à l'accordeur et à l'analyseur de tempo)

> L'APK *debug* est signé avec la clé de débogage automatique de GitHub :
> parfait pour un usage personnel. Pour le **Play Store**, voir §7.3.

---

## 6 · Publier une version numérotée

```bash
git tag v1.0.0
git push origin v1.0.0
```

Le workflow détecte le tag `v*` et crée tout seul une **Release publique**
dans l'onglet **Releases**, avec l'APK en pièce jointe et les notes de version
générées automatiquement.

```bash
git tag v1.1.0 && git push origin v1.1.0   # version suivante
```

---

## 7 · Compiler en local (optionnel, sans GitHub)

### 7.1 — Prérequis
* Node.js ≥ 22
* **JDK 21** (`brew install temurin@21` / [adoptium.net](https://adoptium.net))
* Android SDK (avec Android Studio, ou `sdkmanager "platforms;android-35"`)

### 7.2 — Les 3 commandes

```bash
npm ci                    # dépendances
npm run build             # → dist/
node scripts/sync-android.mjs   # → android/app/src/main/assets/public + config
cd android && ./gradlew assembleDebug
```

L'APK se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`.

> ⚠️ **Ne lancez jamais `npx cap sync`** dans ce projet. Le SDK Capacitor est
> *vendored* dans `android/capacitor-sdk` et `capacitor.settings.gradle` est
> géré à la main — `cap sync` le réécrirait vers `node_modules` et casserait
> la compilation. `node scripts/sync-android.mjs` fait le nécessaire sans ça.

### 7.3 — Signer une APK *release* (pour le Play Store)

```bash
keytool -genkey -v -keystore metronome.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias metronome
cd android && ./gradlew assembleRelease
apksigner sign --ks metronome.jks \
        --out app/build/outputs/apk/release/app-release.apk \
        app/build/outputs/apk/release/app-release.apk
```

Mettez `metronome.jks` **hors du dépôt** (il est déjà dans le `.gitignore`).

---

## 8 · Dépannage

| Erreur | Cause | Solution |
|---|---|---|
| `cordova.variables.gradle` introuvable / *Project directory does not exist* | `android/capacitor-cordova-android-plugins/` pas commité | `git add -f android/capacitor-cordova-android-plugins && git commit` |
| `Permission denied` sur `gradlew` | bit d'exécution perdu | `chmod +x android/gradlew` (déjà fait dans le workflow) |
| `invalid source release: 21` / `unsupported class file version` | mauvaise version de Java | le workflow impose **Java 21** — ne changez pas `setup-java` |
| `SDK location not found` | pas d'Android SDK | en local : installez Android Studio ; en CI : le runner GitHub en a déjà un |
| `Could not resolve com.android.tools.build:gradle` | réseau / cache Gradle | relancez le workflow, le cache se remplit à la 2ᵉ tentative |
| L'artefact ne contient pas l'APK | `dist/` non généré | vérifiez que `npm run build` a bien tourné avant `sync-android.mjs` |
| L'app s'ouvre en **blanc** | `assets/public` vide ou `capacitor.config.json` manquant | relancez `node scripts/sync-android.mjs` puis recompilez |
| L'accordeur dit *« Accès au micro refusé »* | autorisation Android non accordée | Paramètres → Applications → Métronome → Autorisations → **Micro** |
| Le workflow n'apparaît pas dans l'onglet **Actions** | fichier pas sur la branche par défaut | `.github/workflows/build-apk.yml` doit être sur `main` |

---

## 🗂️ Ce que contient le dépôt

```
├─ .github/workflows/build-apk.yml   ← la compilation automatique
├─ scripts/sync-android.mjs          ← copie dist/ dans le projet Android
├─ capacitor.config.ts               ← config Capacitor (appId, nom, webDir)
├─ src/                              ← l'appli React (métronome, accordeur, analyseur)
├─ index.html + vite.config.ts       ← build Vite en fichier unique
└─ android/                          ← projet Android (Capacitor 7)
   ├─ gradlew                        ← lanceur Gradle 8.13
   ├─ capacitor-sdk/                 ← SDK Capacitor vendored (ne pas toucher)
   ├─ capacitor-cordova-android-plugins/
   └─ app/src/main/                  ← MainActivity (FLAG_KEEP_SCREEN_ON), manifest,
                                        ressources, permissions MICRO/VIBRATE
```

**Dossier régénéré à chaque build** (donc absent de git, c'est normal) :
`android/app/src/main/assets/public/`, `capacitor.config.json`, `capacitor.plugins.json`.
