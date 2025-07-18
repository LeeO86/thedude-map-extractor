const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

// Server-Modul für in-process Callback
let serverModule = null;

class MapExtractionManager {
  constructor() {
    this.processes = new Map();
    this.serverProcess = null;
    this.broadcastCallback = null;
    this.isRunning = false;
    this.memoryMonitorInterval = null;
  }

  parseMapsConfig() {
    const mapsConfig = process.env.MAPS || '10159:Main,84820:APs,84823:CAMs,84826:Generatoren,84830:IoT';
    const maps = [];
    
    const mapEntries = mapsConfig.split(',');
    for (const entry of mapEntries) {
      const [mapId, mapName] = entry.trim().split(':');
      if (mapId && mapName) {
        maps.push({
          id: mapId.trim(),
          name: mapName.trim()
        });
      }
    }
    
    return maps;
  }

  async startWebServer() {
    console.log('🌐 Starting web server...');
    
    // Server als Modul laden für Callback-Zugriff
    try {
      serverModule = require('./server.js');
      this.broadcastCallback = serverModule.broadcastMapUpdate;
      console.log('✅ Web server started');
    } catch (error) {
      console.error('❌ Failed to start web server:', error);
      throw error;
    }
  }

  async startMapExtraction(map) {
    console.log(`🚀 [${map.name}] Starting extraction process (ID: ${map.id})`);
    
    const scriptPath = path.join(__dirname, 'extract-single-map.js');
    const child = spawn('node', [scriptPath, map.id, map.name], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { 
        ...process.env,
        // Node.js Memory-Optimierungen für Child-Prozesse
        NODE_OPTIONS: '--max-old-space-size=512 --expose-gc',
        // Reduzierte Browser-Cache-Größe
        PUPPETEER_CACHE_DIR: '/tmp/puppeteer-cache'
      }
    });
    
    // IPC Message Handler für Map-Updates
    child.on('message', (message) => {
      if (message.type === 'map-update' && this.broadcastCallback) {
        try {
          this.broadcastCallback(message.mapId, message.svgData, message.metadata);
        } catch (error) {
          console.error(`❌ [${map.name}] Broadcast error:`, error);
        }
      }
    });
    
    // Pipe output with map name prefix - only important messages
    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        // Only log important messages (startup, errors, login status)
        if (line.includes('🚀') || line.includes('❌') || 
            line.includes('Login successful') || line.includes('Extraction started') ||
            line.includes('Error') || line.includes('Failed') || line.includes('exited') ||
            line.includes('Memory cleanup') || line.includes('Browser restarted')) {
          console.log(`📊 [${map.name}] ${line}`);
        }
      });
    });
    
    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.log(`📊 [${map.name}] ${line}`);
      });
    });
    
    child.on('exit', (code) => {
      console.log(`💀 [${map.name}] Process exited with code ${code}`);
      this.processes.delete(map.id);
      
      // Memory cleanup nach Process-Exit
      if (global.gc) {
        global.gc();
      }
      
      // Restart if it wasn't intentionally stopped
      if (this.isRunning && code !== 0) {
        console.log(`🔄 [${map.name}] Restarting in 5 seconds...`);
        setTimeout(() => {
          if (this.isRunning) {
            this.startMapExtraction(map);
          }
        }, 5000);
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ Error starting process for ${map.name}:`, error);
    });
    
    this.processes.set(map.id, {
      process: child,
      map: map,
      startTime: new Date()
    });
    
    return child;
  }

  async startAll() {
    this.isRunning = true;
    
    // Start web server first
    await this.startWebServer();
    
    const maps = this.parseMapsConfig();
    console.log(`🎯 Starting extraction for ${maps.length} maps:`);
    maps.forEach(map => console.log(`   - ${map.name} (ID: ${map.id})`));
    
    // Start each map extraction process
    for (const map of maps) {
      await this.startMapExtraction(map);
      // Small delay between starts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`✅ All ${maps.length} extraction processes started`);
    console.log('✅ Web server running');
    
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Setup signal handlers
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, stopping all processes...');
      this.stopAll();
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, stopping all processes...');
      this.stopAll();
    });
    
    this.printStatus();
  }

  startMemoryMonitoring() {
    // Memory monitoring alle 5 Minuten
    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };
      
      console.log(`🧠 Memory Usage: RSS: ${memUsageMB.rss}MB, Heap: ${memUsageMB.heapUsed}/${memUsageMB.heapTotal}MB, External: ${memUsageMB.external}MB`);
      
      // Automatische Garbage Collection wenn Memory zu hoch
      if (memUsageMB.heapUsed > 200 && global.gc) {
        console.log('🧹 Performing automatic garbage collection...');
        global.gc();
      }
      
      // Warnung bei hohem Memory-Verbrauch
      if (memUsageMB.rss > 1000) {
        console.log('⚠️ WARNING: High memory usage detected! Consider restarting the application.');
      }
      
    }, 5 * 60 * 1000); // alle 5 Minuten
  }

  async stopAll() {
    console.log('🛑 Stopping all extraction processes...');
    this.isRunning = false;
    
    // Stop memory monitoring
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
    
    // Stop web server
    if (this.serverProcess) {
      console.log('🌐 Stopping web server...');
      this.serverProcess.kill('SIGINT');
      this.serverProcess = null;
    }
    
    // Stop all extraction processes
    for (const [mapId, processInfo] of this.processes) {
      console.log(`   Stopping ${processInfo.map.name}...`);
      processInfo.process.kill('SIGINT');
    }
    
    // Wait for all processes to exit
    const timeout = setTimeout(() => {
      console.log('⚠️ Force killing remaining processes...');
      for (const [mapId, processInfo] of this.processes) {
        processInfo.process.kill('SIGKILL');
      }
    }, 10000);
    
    // Wait for all processes to finish
    while (this.processes.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    clearTimeout(timeout);
    
    // Final memory cleanup
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ All processes stopped and memory cleaned up');
    process.exit(0);
  }

  printStatus() {
    console.log('\n📊 System Status:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
    };
    console.log(`🧠 Memory Usage      | RSS: ${memUsageMB.rss}MB | Heap: ${memUsageMB.heapUsed}/${memUsageMB.heapTotal}MB`);
    
    // Web server status
    const serverStatus = this.serverProcess ? '🟢 Running' : '🔴 Stopped';
    console.log(`🌐 Web Server        | ${serverStatus} | Port: ${process.env.PORT || 3000}`);
    
    console.log('');
    
    // Extraction processes status
    for (const [mapId, processInfo] of this.processes) {
      const uptime = Math.floor((Date.now() - processInfo.startTime.getTime()) / 1000);
      console.log(`📍 ${processInfo.map.name.padEnd(15)} | PID: ${processInfo.process.pid} | Uptime: ${uptime}s`);
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎯 Total extraction processes: ${this.processes.size}`);
    console.log(`🧠 Memory-optimized mode: Automatic cleanup and browser restarts`);
    console.log(`🌐 Web interface: http://localhost:${process.env.PORT || 3000}`);
    console.log('\nPress Ctrl+C to stop all processes');
    
    // Update status every 30 seconds
    if (this.isRunning) {
      setTimeout(() => {
        if (this.isRunning) {
          this.printStatus();
        }
      }, 30000);
    }
  }
}

// CLI Usage
if (require.main === module) {
  const manager = new MapExtractionManager();
  
  console.log('🚀 TheDude Map Extraction & Web Server Manager');
  console.log('==============================================');
  console.log('Starting web server and individual extraction processes...');
  console.log('Each map will run in its own browser instance for optimal isolation.');
  console.log('Web interface will be available for live map viewing.');
  console.log('');
  
  manager.startAll().catch(error => {
    console.error('💥 Failed to start manager:', error);
    process.exit(1);
  });
}

module.exports = MapExtractionManager;
