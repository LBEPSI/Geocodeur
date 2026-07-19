# Géocodeur BAN & Analyse de Parcelles par IA

Ce projet est une application permettant de géolocaliser des adresses postales françaises, de récupérer les contours cadastraux officiels et d'analyser automatiquement les photos satellites (détection de piscines, panneaux solaires, etc.) en faisant appel aux modèles de vision de Google Gemini.

---

##  Technologies Utilisées

L'application est construite avec des technologies légères et modernes, privilégiant la performance et un design soigné :

- **TypeScript** : Pour un code robuste, typé et facile à maintenir.
- **Vite** : Outil de build et serveur de développement ultra-rapide.
- **HTML5 & CSS3 (Vanilla)** : Structure sémantique et mise en page responsive utilisant CSS Grid et Flexbox.
- **Design System "Human Minimalist Stone"** : Charte graphique sobre, asymétrique et épurée (tons pierre chaleureuse, terre cuite / terracotta, police géométrique *Outfit* et données de précision en *JetBrains Mono*).

---

## APIs Utilisées

L'application orchestre plusieurs services tiers officiels :

1. **API Géocodage IGN / Base Adresse Nationale (BAN)** :
   - *Endpoint* : `https://data.geopf.fr/geocodage/search`
   - *Rôle* : Recherche textuelle d'adresses et conversion en coordonnées géographiques (longitude/latitude) avec score de fiabilité.
2. **API Carto Cadastre (IGN)** :
   - *Endpoint* : `https://apicarto.ign.fr/api/cadastre/parcelle`
   - *Rôle* : Récupération de la géométrie précise (GeoJSON) et de la surface cadastrale de la parcelle ciblée.
3. **API WMS Images Satellites (IGN)** :
   - *Endpoint* : `https://data.geopf.fr/wms-r/wms` (couche `ORTHOIMAGERY.ORTHOPHOTOS`)
   - *Rôle* : Téléchargement de la photo satellite haute résolution centrée et cadrée sur la parcelle.
4. **API Google Gemini (Vision)** :
   - *Endpoint* : `https://generativelanguage.googleapis.com/v1beta/`
   - *Rôle* : Analyse par ordinateur de l'orthophoto satellite de la parcelle pour détecter automatiquement des aménagements (piscines, panneaux solaires thermiques/photovoltaïques) et fournir un compte-rendu descriptif du terrain.

---

## Exemples d'Utilisation

Voici un aperçu visuel du fonctionnement de l'application :

### 1. Recherche d'Adresse & Cadastre
Lorsque vous saisissez une adresse valide, l'application affiche la fiche de coordonnées, les informations de parcelle et superpose le tracé du cadastre sur la photo satellite :

[Recherche d'Adresse - Exemple 1] <img width="1279" height="700" alt="geocodeur-1" src="https://github.com/user-attachments/assets/069ec042-ffb3-4f7e-ba93-84f0a53c7219" />




### 2. Analyse Automatique par l'IA (Gemini)
Après avoir configuré votre clé API et cliqué sur **"Analyser la photo satellite avec Gemini"**, l'application fait défiler la page de manière fluide pour centrer les résultats de l'IA (détection de piscine, détection de panneaux solaires et description complète) :

[Analyse par l'IA - Défilement & Résultats] <img width="1279" height="697" alt="geocodeur-2" src="https://github.com/user-attachments/assets/56e52b89-d5d4-4942-b1ba-53ee63f28f5f" />



---

##  Clé API Gemini Gratuite

Pour faire fonctionner l'analyse de photo satellite, vous devez configurer votre propre clé API Google Gemini. Elle s'obtient gratuitement en quelques clics :

### Étape 1 : Obtenir la clé
1. Rendez-vous sur [Google AI Studio](https://aistudio.google.com/).
2. Connectez-vous avec votre compte Google.
3. Cliquez sur le bouton **"Get API key"** (Créer une clé API).
4. Cliquez sur **"Create API Key"**, sélectionnez ou créez un projet Google Cloud, puis validez.
5. Copiez la clé API générée (elle commence généralement par `AIzaSy...`).

### Étape 2 : Configurer l'application
- Collez cette clé dans le champ **"Configuration IA > Clé API Gemini"** du panneau latéral gauche de l'application.
- *Sécurité* : Votre clé API est **exclusivement stockée en local dans votre navigateur** (`localStorage`). Elle n'est jamais envoyée vers un serveur tiers autre que l'API officielle sécurisée de Google. Vous pouvez la supprimer à tout moment via le bouton de nettoyage intégré.

---

##  Lancement Local

### Prérequis
- [Node.js](https://nodejs.org/) (Version 18 ou supérieure recommandée)

### Installation
Clonez le projet ou ouvrez le dossier dans votre terminal, puis installez les dépendances :
```bash
npm install
```

### Développement
Démarrez le serveur de développement local :
```bash
npm run dev
```
Ouvrez ensuite l'adresse affichée dans votre console (par défaut `http://localhost:5173/`).

### Compilation (Build)
Pour compiler le code TypeScript en JavaScript optimisé pour la production :
```bash
npm run build
```
Les fichiers générés se trouveront dans le dossier `/dist`.
