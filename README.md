# TheDude Map Extractor

Ein Tool zur kontinuierlichen Extraktion und Anzeige von MikroTik TheDude Network Maps über eine moderne Web-Oberfläche.

[![Docker Build](https://github.com/LeeO86/thedude-map-extractor/actions/workflows/docker-build.yml/badge.svg)](https://github.com/LeeO86/thedude-map-extractor/actions/workflows/docker-build.yml)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-thedude--map--extractor-blue)](https://github.com/LeeO86/thedude-map-extractor/pkgs/container/thedude-map-extractor)

## 🚀 Features

- **Integrierter Manager** - Ein einziger Befehl startet alles (Web-Server + Extraktionen)
- **Kontinuierliche SVG-Extraktion** alle 500ms von TheDude Maps
- **Moderne Web-Oberfläche** zur Echtzeit-Anzeige der Netzwerkkarten
- **WebSocket-Updates** für Live-Visualisierung ohne Page-Refresh
- **Multi-Map-Support** für bis zu 5 Netzwerkkarten parallel
- **Vollbild-Ansicht** mit kompaktem Overlay für Metadaten
- **PWA-Ready** mit Favicons und Web App Manifest
- **SEO-optimiert** mit Meta-Tags und Open Graph
- **Docker-ready** für einfaches Deployment
- **GitHub Actions** für automatisches Container-Building
- **GitHub Container Registry** für einfache Distribution
- **Dev Container** für konsistente Entwicklungsumgebung
- **Dark Mode optimiert** - Automatische Entfernung weißer Hintergründe

## 🛠️ Installation

### Option 1: Dev Container (Empfohlen)

```bash
# 1. Repository klonen
git clone https://github.com/LeeO86/thedude-map-extractor.git
cd thedude-map-extractor

# 2. VS Code öffnen
code .

# 3. Dev Container starten (VS Code Command Palette: "Dev Containers: Reopen in Container")
```

### Option 2: Lokale Installation

```bash
# 1. Repository klonen
git clone https://github.com/LeeO86/thedude-map-extractor.git
cd thedude-map-extractor

# 2. Dependencies installieren
npm install

# 3. Umgebungsvariablen setzen
cp .env.example .env
# Bearbeiten Sie .env mit Ihren Einstellungen
```

## 📋 Verwendung

### Schnellstart (Alles in einem)

```bash
# Startet Web-Server + alle Extraktionen
npm start
```

### Erweiterte Nutzung

```bash
# Nur Web-Server starten
npm run server

# Entwicklungsmodus mit Auto-Restart
npm run dev

# Web-Server Entwicklungsmodus
npm run dev:server

# Einzelne Map extrahieren
npm run extract-single
```

### Web-Interface

Das Web-Interface ist nach dem Start automatisch verfügbar unter:

- **http://localhost:3000** - Übersicht aller Maps
- **http://localhost:3000/map/10159** - Direkte Map-Ansicht

### Features der Web-Oberfläche

- ✅ **Live-Updates** via WebSocket
- ✅ **Vollbild-Ansicht** ohne störende UI-Elemente
- ✅ **Kompaktes Overlay** mit Status und Zeitstempel
- ✅ **Responsive Design** für alle Geräte
- ✅ **Direkte URLs** für einzelne Maps
- ✅ **PWA-Support** - Installierbar als App
- ✅ **SEO-optimiert** - Meta-Tags und Open Graph
- ✅ **Dark Mode Support** - Automatische Hintergrund-Bereinigung

## 🔧 Konfiguration

### Umgebungsvariablen (.env)

```env
# TheDude Server Configuration
MIKROTIK_IP=10.0.0.10
MIKROTIK_USER=admin
MIKROTIK_PASS=password

# Map Configuration (comma-separated)
# Format: MAP_ID:MAP_NAME,MAP_ID:MAP_NAME,...
MAPS=10159:Main,84820:APs,84823:CAMs,84826:Generatoren,84830:IoT

# Web Server Configuration
PORT=3000
NODE_ENV=development

# Extraction Settings
EXTRACT_INTERVAL=500
MAX_MAPS=5
MAX_RETRIES=3
TIMEOUT=30000

# Debug Options
DEBUG=true
HEADLESS=true
```

### Umgebungsvariablen Erklärung

| Variable           | Beschreibung                         | Standard      | Beispiel               |
| ------------------ | ------------------------------------ | ------------- | ---------------------- |
| `MIKROTIK_IP`      | IP-Adresse des MikroTik Routers      | -             | `10.0.0.10`            |
| `MIKROTIK_USER`    | Benutzername für TheDude             | `admin`       | `admin`                |
| `MIKROTIK_PASS`    | Passwort für TheDude                 | -             | `password`             |
| `MAPS`             | Komma-getrennte Liste der Maps       | -             | `10159:Main,84820:APs` |
| `PORT`             | Web-Server Port                      | `3000`        | `3000`                 |
| `NODE_ENV`         | Umgebung                             | `development` | `production`           |
| `EXTRACT_INTERVAL` | Intervall zwischen Extraktionen (ms) | `500`         | `1000`                 |
| `MAX_MAPS`         | Maximale Anzahl gleichzeitiger Maps  | `5`           | `10`                   |
| `MAX_RETRIES`      | Maximale Wiederholungsversuche       | `3`           | `5`                    |
| `TIMEOUT`          | Timeout für Seitenladung (ms)        | `30000`       | `60000`                |
| `DEBUG`            | Debug-Modus aktivieren               | `false`       | `true`                 |
| `HEADLESS`         | Puppeteer im Headless-Modus          | `true`        | `false`                |

## 🐳 Docker Deployment

### Development

```bash
# Mit Docker Compose
docker-compose up -d
```

### Production

```bash
# Mit Docker Compose (Production)
docker-compose -f docker-compose.prod.yml up -d
```

### GitHub Container Registry

```bash
# Direkt von GitHub Container Registry
docker run -d \
  --name thedude-extractor \
  -p 3000:3000 \
  -e MIKROTIK_IP=10.0.0.10 \
  -e MIKROTIK_USER=admin \
  -e MIKROTIK_PASS=your-password \
  ghcr.io/leeo86/thedude-map-extractor:latest
```

## 🏗️ Architektur

Die Anwendung basiert auf einer vereinfachten, stabilen Architektur:

### Komponenten

1. **extract-manager.js** - Hauptanwendung

   - Startet Web-Server
   - Verwaltet Map-Extraktionen
   - Koordiniert WebSocket-Updates

2. **extract-single-map.js** - Spezialisierte Map-Extraktion

   - Pro Map ein eigener Prozess
   - Stabilere Ausführung
   - Automatische SVG-Bereinigung für Dark Mode

3. **server.js** - Express Web-Server

   - Serviert Web-Interface
   - WebSocket-Verbindungen
   - API-Endpunkte

4. **public/index.html** - Moderne Web-Oberfläche
   - Grid-Layout für mehrere Maps
   - Live-Updates via WebSocket
   - Vollbild-Unterstützung
   - PWA-Features mit Favicons
   - SEO-optimiert

## 🧪 TheDude-spezifische Implementierung

### Login-Sequenz

```javascript
// 1. Login-Seite (.login Element)
await page.waitForSelector(".login");
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', "password");
await page.click('button[type="submit"]');

// 2. Loading-Screen (.loading Element)
await page.waitForSelector(".loading");
await page.waitForSelector(".loading", { hidden: true });

// 3. Hauptseite (.acc-cont Element)
await page.waitForSelector(".acc-cont");

// 4. SVG-Element (dynamisch aktualisiert)
const svg = await page.waitForSelector(".acc-cont svg");
```

### Map-URLs

```javascript
const mapUrl = `http://${routerIP}/#Dude:Network_Maps.Network_Map.${mapId}`;
```

### SVG-Bereinigung für Dark Mode

Die Anwendung entfernt automatisch weiße Hintergründe aus den SVGs:

```javascript
// Entferne background-style Attribute
processedSvgData = processedSvgData.replace(
  /style="[^"]*background:\s*rgb\(255,\s*255,\s*255\)[^"]*"/gi,
  ""
);
processedSvgData = processedSvgData.replace(
  /style="[^"]*background:\s*#ffffff[^"]*"/gi,
  ""
);
processedSvgData = processedSvgData.replace(
  /style="[^"]*background:\s*white[^"]*"/gi,
  ""
);
```

## 📁 Projektstruktur

```
thedude-map-extractor/
├── .devcontainer/           # Dev Container Konfiguration
├── .github/workflows/       # GitHub Actions
├── extract-manager.js       # Hauptanwendung (Manager)
├── extract-single-map.js    # Einzelne Map-Extraktion
├── server.js               # Express Web-Server
├── public/
│   ├── index.html          # Web-Interface
│   ├── favicon.svg         # SVG Favicon
│   ├── favicon.ico         # ICO Favicon
│   ├── *.png               # PNG Favicons (verschiedene Größen)
│   └── site.webmanifest    # PWA Manifest
├── extracted/              # Extrahierte SVG-Dateien
│   ├── *_latest.svg        # Aktuelle SVG-Dateien
│   └── *_latest.json       # Metadaten
├── Dockerfile              # Docker-Image
├── docker-compose.yml      # Development
├── docker-compose.prod.yml # Production
└── package.json
```

## 🚨 Bekannte Herausforderungen

1. **DOM-Struktur**: TheDude verwendet spezifische CSS-Klassen (.login, .loading, .acc-cont)
2. **Dynamische SVG-Updates**: SVG wird über JavaScript kontinuierlich aktualisiert
3. **Single-Page-Application**: Navigation erfolgt über Hash-URLs
4. **Session-Management**: Login-State muss aufrechterhalten werden
5. **Performance**: Kontinuierliche Extraktion (500ms) kann ressourcenintensiv sein

## 🔧 Erweiterte Funktionen

### Einzelne Map extrahieren

```bash
# Syntax: node extract-single-map.js <mapId> <mapName>
node extract-single-map.js 10159 "Main"
```

### Debugging

```bash
# Debug-Modus aktivieren
DEBUG=* npm start

# Puppeteer im sichtbaren Modus
HEADLESS=false npm start
```

## 🤝 Contributing

1. Fork das Repository
2. Erstellen Sie einen Feature-Branch
3. Committen Sie Ihre Änderungen
4. Push zum Branch
5. Erstellen Sie eine Pull Request

## 📄 Lizenz

MIT License - siehe LICENSE Datei für Details.

## ⚠️ Disclaimer

Dieses Tool ist für Bildungs- und Administrationszwecke gedacht. Verwenden Sie es nur auf Ihren eigenen Geräten oder mit ausdrücklicher Genehmigung.

## 🙋‍♂️ Support

Bei Fragen oder Problemen:

- Öffnen Sie ein Issue auf GitHub
- Konsultieren Sie die MikroTik-Dokumentation
- Überprüfen Sie die Browser-Entwicklertools für Debugging

## 🔮 Roadmap

- [x] Vereinfachte Architektur mit Manager
- [x] Dark Mode optimierte SVGs
- [x] Stabilere Map-Extraktion
- [x] Docker-Deployment vereinfacht
- [x] GitHub Actions CI/CD Pipeline
- [x] GitHub Container Registry Integration
- [x] PWA-Features mit Favicons und Manifest
- [x] SEO-Optimierung mit Meta-Tags
- [ ] Automatische Map-Erkennung
- [ ] Multi-Router-Support
- [ ] Mobile-optimierte Oberfläche
- [ ] API für Drittanbieter-Integration
- [ ] Helm Chart für Kubernetes
- [ ] Health Check Endpoints
