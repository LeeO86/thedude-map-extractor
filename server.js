const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Konfiguration
const PORT = process.env.PORT || 3000;

// In-Memory Store für aktuelle Map-Daten
const mapStore = new Map();

// Update Counter für reduced logging
const mapUpdateCounts = new Map();

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

// Broadcast-Funktion für In-Memory Updates
function broadcastMapUpdate(mapId, svgData, metadata) {
  try {
    // Update Memory Store
    mapStore.set(mapId, {
      svgData,
      metadata,
      lastUpdated: Date.now()
    });
    
    // Logging nur alle 10 Updates pro Map (reduziert Spam)
    if (!mapUpdateCounts.has(mapId)) {
      mapUpdateCounts.set(mapId, 0);
    }
    const count = mapUpdateCounts.get(mapId) + 1;
    mapUpdateCounts.set(mapId, count);
    
    if (count % 10 === 1) {
      console.log(`📡 [MEMORY] Map ${mapId} updated #${count} (${Math.round(svgData.length / 1024)}KB)`);
    }
    
    // Real-time Update an alle Clients senden
    io.emit('map-updated', {
      mapId: mapId,
      timestamp: metadata.timestamp || new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error broadcasting map update:', error);
  }
}

// Map-Daten an Client senden
function sendMapData(socket, mapId) {
  try {
    // Zuerst im Memory Store prüfen
    if (mapStore.has(mapId)) {
      const memoryData = mapStore.get(mapId);
      console.log(`📡 [MEMORY] Sending map ${mapId} from memory store`);
      
      socket.emit('map-data', {
        mapId: mapId,
        svgData: memoryData.svgData,
        metadata: memoryData.metadata
      });
      return;
    }
    
    // Map nicht im Memory Store gefunden
    socket.emit('map-error', {
      mapId: mapId,
      error: 'Map not found in memory store'
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
    const maps = [];
    
    // Aus Memory Store laden
    for (const [mapId, data] of mapStore.entries()) {
      maps.push({
        id: mapId,
        name: data.metadata.mapName || data.metadata.name || `Map ${mapId}`,
        lastUpdate: data.metadata.timestamp,
        size: Math.round(data.svgData.length / 1024) + 'KB'
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
    const maps = [];
    
    // Aus Memory Store
    for (const [mapId, data] of mapStore.entries()) {
      maps.push({
        id: mapId,
        name: data.metadata.mapName || data.metadata.name || `Map ${mapId}`,
        lastUpdate: new Date(data.lastUpdated).toISOString(),
        size: Math.round(data.svgData.length / 1024) + 'KB'
      });
    }
    
    res.json({ maps });
  } catch (error) {
    console.error('Error getting maps list:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/maps/:id', (req, res) => {
  try {
    const mapId = req.params.id;
    
    // Im Memory Store prüfen
    if (mapStore.has(mapId)) {
      const data = mapStore.get(mapId);
      return res.json({
        mapId: mapId,
        svgData: data.svgData,
        metadata: data.metadata
      });
    }
    
    res.status(404).json({ error: 'Map not found in memory store' });
  } catch (error) {
    console.error('Error getting map:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extraktions-Status API
app.get('/api/status', (req, res) => {
  try {
    const stats = {
      totalMaps: mapStore.size,
      lastUpdate: null,
      memoryUsage: process.memoryUsage()
    };
    
    // Neueste Update-Zeit finden
    if (mapStore.size > 0) {
      const timestamps = Array.from(mapStore.values()).map(data => data.lastUpdated);
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

// HTTP API Endpunkte für Memory-Store
app.get('/api/maps', (req, res) => {
  try {
    const maps = [];
    
    // Zuerst aus Memory Store
    for (const [mapId, data] of mapStore.entries()) {
      maps.push({
        id: mapId,
        name: data.metadata.mapName || data.metadata.name || `Map ${mapId}`,
        lastUpdate: new Date(data.lastUpdated).toISOString()
      });
    }
    
    res.json({ maps });
  } catch (error) {
    console.error('Error getting maps list:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/maps/:id', (req, res) => {
  try {
    const mapId = req.params.id;
    
    // Zuerst im Memory Store prüfen
    if (mapStore.has(mapId)) {
      const data = mapStore.get(mapId);
      return res.json({
        mapId: mapId,
        svgData: data.svgData,
        metadata: data.metadata
      });
    }
    
    res.status(404).json({ error: 'Map not found in memory store' });
  } catch (error) {
    console.error('Error getting map:', error);
    res.status(500).json({ error: error.message });
  }
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
});

// Export der Broadcast-Funktion für external use
module.exports = { broadcastMapUpdate };
