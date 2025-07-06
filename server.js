const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Konfiguration
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// WebSocket-Verbindung für Echtzeit-Updates
io.on('connection', (socket) => {
  socket.on('request-map', (mapId) => {
    sendMapData(socket, mapId);
  });
  
  socket.on('request-maps-list', () => {
    sendMapsList(socket);
  });
  
  socket.on('disconnect', () => {
    // Client disconnected silently
  });
});

// SVG-Dateien überwachen und Updates senden
function watchSVGFiles() {
  const extractedDir = path.join(__dirname, 'extracted');
  
  if (!fs.existsSync(extractedDir)) {
    fs.mkdirSync(extractedDir, { recursive: true });
  }
  
  // Überwachung für alle _latest.svg Dateien
  fs.watch(extractedDir, (eventType, filename) => {
    if (filename && filename.endsWith('_latest.svg')) {
      // Extract mapId from filename (e.g., "10159_Main_Test_Update_latest.svg" -> "10159")
      const mapId = filename.split('_')[0];
      
      // Updates an alle verbundenen Clients senden
      io.emit('map-updated', {
        mapId: mapId,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Map-Daten an Client senden
function sendMapData(socket, mapId) {
  try {
    const extractedDir = path.join(__dirname, 'extracted');
    
    // Finde die neueste SVG-Datei für diese mapId
    const files = fs.readdirSync(extractedDir);
    const svgFiles = files.filter(f => f.startsWith(`${mapId}_`) && f.endsWith('_latest.svg'));
    const jsonFiles = files.filter(f => f.startsWith(`${mapId}_`) && f.endsWith('_latest.json'));
    
    if (svgFiles.length === 0) {
      socket.emit('map-error', {
        mapId: mapId,
        error: 'Map not found'
      });
      return;
    }
    
    // Neueste Datei verwenden (nach Timestamp sortiert)
    const latestSvgFile = svgFiles.sort().pop();
    const latestJsonFile = jsonFiles.sort().pop();
    
    const svgPath = path.join(extractedDir, latestSvgFile);
    const svgData = fs.readFileSync(svgPath, 'utf8');
    
    let metadata = {
      mapId: mapId,
      mapName: `Map ${mapId}`,
      timestamp: new Date().toISOString()
    };
    
    if (latestJsonFile) {
      const metadataPath = path.join(extractedDir, latestJsonFile);
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
    
    socket.emit('map-data', {
      mapId: mapId,
      svgData: svgData,
      metadata: metadata
    });
    
  } catch (error) {
    console.error('Error sending map data:', error);
    socket.emit('map-error', {
      mapId: mapId,
      error: error.message
    });
  }
}

// Maps-Liste an Client senden
function sendMapsList(socket) {
  try {
    const extractedDir = path.join(__dirname, 'extracted');
    const maps = [];
    
    if (fs.existsSync(extractedDir)) {
      const files = fs.readdirSync(extractedDir);
      const latestFiles = files.filter(f => f.endsWith('_latest.json'));
      
      latestFiles.forEach(file => {
        try {
          const metadata = JSON.parse(fs.readFileSync(path.join(extractedDir, file), 'utf8'));
          maps.push({
            id: metadata.mapId,
            name: metadata.mapName,
            lastUpdate: metadata.timestamp,
            size: metadata.size
          });
        } catch (error) {
          console.error(`Error reading metadata for ${file}:`, error);
        }
      });
    }
    
    socket.emit('maps-list', { maps });
    
  } catch (error) {
    console.error('Error sending maps list:', error);
    socket.emit('map-error', {
      mapId: null,
      error: error.message
    });
  }
}

// REST API für Map-Verwaltung
app.get('/api/maps', (req, res) => {
  try {
    const extractedDir = path.join(__dirname, 'extracted');
    const maps = [];
    
    if (fs.existsSync(extractedDir)) {
      const files = fs.readdirSync(extractedDir);
      const latestFiles = files.filter(f => f.endsWith('_latest.json'));
      
      latestFiles.forEach(file => {
        try {
          const metadata = JSON.parse(fs.readFileSync(path.join(extractedDir, file), 'utf8'));
          maps.push({
            id: metadata.mapId,
            name: metadata.mapName,
            lastUpdate: metadata.timestamp,
            size: metadata.size
          });
        } catch (error) {
          console.error(`Error reading metadata for ${file}:`, error);
        }
      });
    }
    
    res.json({ maps });
  } catch (error) {
    console.error('Error listing maps:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/maps/:id', (req, res) => {
  try {
    const mapId = req.params.id;
    const extractedDir = path.join(__dirname, 'extracted');
    
    // Finde die neueste SVG-Datei für diese mapId
    const files = fs.readdirSync(extractedDir);
    const svgFiles = files.filter(f => f.startsWith(`${mapId}_`) && f.endsWith('_latest.svg'));
    const jsonFiles = files.filter(f => f.startsWith(`${mapId}_`) && f.endsWith('_latest.json'));
    
    if (svgFiles.length === 0) {
      return res.status(404).json({ error: 'Map not found' });
    }
    
    // Neueste Datei verwenden (nach Timestamp sortiert)
    const latestSvgFile = svgFiles.sort().pop();
    const latestJsonFile = jsonFiles.sort().pop();
    
    const svgPath = path.join(extractedDir, latestSvgFile);
    const svgData = fs.readFileSync(svgPath, 'utf8');
    
    let metadata = {
      mapId: mapId,
      mapName: `Map ${mapId}`,
      timestamp: new Date().toISOString()
    };
    
    if (latestJsonFile) {
      const metadataPath = path.join(extractedDir, latestJsonFile);
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }

    res.json({
      mapId: mapId,
      svgData: svgData,
      metadata: metadata
    });
  } catch (error) {
    console.error(`Error getting map ${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Extraktions-Status API
app.get('/api/status', (req, res) => {
  try {
    const extractedDir = path.join(__dirname, 'extracted');
    const files = fs.existsSync(extractedDir) ? fs.readdirSync(extractedDir) : [];
    
    const stats = {
      totalFiles: files.length,
      svgFiles: files.filter(f => f.endsWith('.svg')).length,
      latestFiles: files.filter(f => f.endsWith('_latest.svg')).length,
      lastUpdate: null
    };
    
    // Neueste Datei finden
    const latestFiles = files.filter(f => f.endsWith('_latest.json'));
    if (latestFiles.length > 0) {
      const timestamps = latestFiles.map(file => {
        try {
          const metadata = JSON.parse(fs.readFileSync(path.join(extractedDir, file), 'utf8'));
          return new Date(metadata.timestamp);
        } catch {
          return new Date(0);
        }
      });
      stats.lastUpdate = new Date(Math.max(...timestamps)).toISOString();
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Startseite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA-Routing: Alle nicht-API Routen zur index.html weiterleiten
app.get('/map/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all für alle anderen Routen (außer API)
app.get('*', (req, res) => {
  // Prüfen ob es sich um eine API-Route handelt
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Prüfen ob es sich um eine statische Datei handelt (hat Dateiendung)
  if (req.path.includes('.') && !req.path.endsWith('/')) {
    return res.status(404).send('File not found');
  }
  
  // Für alle anderen Routen die index.html ausliefern (SPA-Routing)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server starten
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  console.log(`📁 Extracted files directory: ${path.join(__dirname, 'extracted')}`);
  
  // SVG-Dateien überwachen
  watchSVGFiles();
});
