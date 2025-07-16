const puppeteer = require('puppeteer');
require('dotenv').config();

class SingleMapExtractor {
  constructor(routerIP, username, password, mapId, mapName, onUpdateCallback = null) {
    this.routerIP = routerIP;
    this.username = username;
    this.password = password;
    this.mapId = mapId;
    this.mapName = mapName;
    this.onUpdateCallback = onUpdateCallback;
    this.browser = null;
    this.page = null;
    this.extractionInterval = null;
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.lastSuccessfulExtraction = Date.now();
    this.extractionCount = 0; // Für reduzierte Verbosity
    this.lastBrowserRestart = Date.now(); // Für periodischen Browser-Neustart
    this.browserRestartInterval = 30 * 60 * 1000; // Alle 30 Minuten Browser neu starten
  }

  async init() {
    const headless = process.env.HEADLESS === 'true';
    console.log(`🚀 [${this.mapName}] Starting extraction process`);
    
    try {
      this.browser = await puppeteer.launch({
        headless: headless,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-web-security',
          '--disable-dev-shm-usage', // Weniger shared memory nutzen
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking',
          '--disable-back-forward-cache',
          '--disable-ipc-flooding-protection',
          '--no-default-browser-check',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-hang-monitor',
          '--disable-sync',
          '--disable-translate',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images', // Bilder deaktivieren um Memory zu sparen
          '--memory-pressure-off',
          '--aggressive-cache-discard', // Aggressives Cache-Clearing
          '--purge-memory-button',
          '--disable-background-mode',
          '--disable-gpu-sandbox'
          // Entfernt: --single-process und --no-zygote (verursachen Probleme)
        ],
        defaultViewport: { width: 1920, height: 1080 },
        timeout: 30000,
        userDataDir: `/tmp/puppeteer/${this.mapId}` // Map-spezifisches User Data Directory
      });
      
      console.log(`✅ [${this.mapName}] Browser launched successfully`);
      
      this.page = await this.browser.newPage();
      console.log(`✅ [${this.mapName}] New page created`);
      
      // Cache komplett deaktivieren
      await this.page.setCacheEnabled(false);
      
      // Request-Interception für Memory-Optimierung
      await this.page.setRequestInterception(true);
      this.page.on('request', (request) => {
        const resourceType = request.resourceType();
        // Nur essentielle Requests durchlassen
        if (['document', 'script', 'xhr', 'fetch'].includes(resourceType)) {
          request.continue();
        } else {
          // Blockiere Bilder, Stylesheets, Fonts etc.
          request.abort();
        }
      });
      
      console.log(`✅ [${this.mapName}] Browser initialization completed`);
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Browser initialization failed:`, error.message);
      console.error(`❌ [${this.mapName}] Full error:`, error);
      throw error;
    }
  }

  async login() {
    try {
      const loginURL = `http://${this.routerIP}`;
      await this.page.goto(loginURL, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Login
      await this.page.waitForSelector('.login', { timeout: 15000 });
      const usernameField = await this.page.$('input[name="username"], input[name="user"], input[type="text"]');
      if (usernameField) {
        await usernameField.click({ clickCount: 3 });
        await usernameField.press('Backspace');
        await usernameField.type(this.username);
      }
      
      const passwordField = await this.page.$('input[name="password"], input[name="pass"], input[type="password"]');
      if (passwordField) {
        await passwordField.click({ clickCount: 3 });
        await passwordField.press('Backspace');
        await passwordField.type(this.password);
      }
      
      await this.page.click('button[type="submit"], input[type="submit"], .login button');
      
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      // Check for main interface
      const possibleSelectors = ['.acc-cont', '.mainwin', '.application', '#main', '.workarea'];
      let foundSelector = null;
      
      for (const selector of possibleSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          foundSelector = selector;
          break;
        } catch (error) {
          // Continue to next selector
        }
      }
      
      if (!foundSelector) {
        throw new Error('Login may have failed - not on TheDude page');
      }
      
      // Switch to Advanced Mode if needed
      await this.switchToAdvancedMode();
      
      console.log(`✅ [${this.mapName}] Login successful`);
    } catch (error) {
      console.error(`❌ [${this.mapName}] Login failed:`, error);
      throw error;
    }
  }

  async switchToAdvancedMode() {
    try {
      console.log(`🔄 [${this.mapName}] Checking for QuickSet mode...`);
      
      const quickSetElement = await this.page.$('.grid.grid-quickset');
      if (quickSetElement) {
        console.log(`⚙️ [${this.mapName}] QuickSet mode detected, switching to Advanced mode...`);
        
        const switchSuccess = await this.page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          const advancedElement = elements.find(el => 
            el.textContent && el.textContent.toLowerCase().includes('advanced') &&
            (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT')
          );
          if (advancedElement) {
            advancedElement.click();
            return true;
          }
          return false;
        });
        
        if (switchSuccess) {
          await this.page.waitForFunction(
            () => !document.querySelector('.grid.grid-quickset'),
            { timeout: 10000 }
          );
          
          // LocalStorage setzen
          await this.page.evaluate(() => {
            localStorage.setItem('preferences', JSON.stringify({
              "": { applet: "id_WebFig" },
              "#Files.File": { sort: ["!Size", "File Name"] }
            }));
          });
        }
      }
    } catch (error) {
      // Advanced mode switch failed, continue anyway
    }
  }

  async checkIfLoggedOut() {
    try {
      // Prüfe auf Login-Seite Indikatoren
      const loginIndicators = [
        '.login',
        'input[name="username"]',
        'input[name="password"]',
        'button[type="submit"]',
        '.login-form',
        '#login'
      ];
      
      for (const selector of loginIndicators) {
        try {
          await this.page.waitForSelector(selector, { timeout: 1000 });
          console.log(`🔍 [${this.mapName}] Login screen detected (${selector})`);
          return true;
        } catch (error) {
          // Continue checking other selectors
        }
      }
      
      // Prüfe auch anhand der URL
      const currentUrl = await this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('auth')) {
        console.log(`🔍 [${this.mapName}] Login screen detected (URL: ${currentUrl})`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ [${this.mapName}] Error checking login status:`, error.message);
      return false;
    }
  }

  async handleSessionExpired() {
    console.log(`🔄 [${this.mapName}] Session expired, attempting re-login...`);
    
    try {
      // Versuche erneut zu loggen
      await this.login();
      await this.navigateToMap();
      
      // Reset error counter on successful recovery
      this.consecutiveErrors = 0;
      this.lastSuccessfulExtraction = Date.now();
      
      console.log(`✅ [${this.mapName}] Session recovered successfully`);
      return true;
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Session recovery failed:`, error.message);
      return false;
    }
  }

  async navigateToMap() {
    try {
      // Navigate using hash change
      await this.page.evaluate((mapId) => {
        const mapHash = `#Dude:Network_Maps.Network_Map.${mapId}`;
        window.location.hash = mapHash;
        
        // Trigger events
        const event = new HashChangeEvent('hashchange', {
          oldURL: window.location.href,
          newURL: window.location.origin + window.location.pathname + mapHash
        });
        window.dispatchEvent(event);
      }, this.mapId);
      
      // Wait for map to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Find the right selector for this map
      const possibleSelectors = [
        '.acc-cont svg',
        'svg',
        '.map svg',
        '.content svg',
        '[class*="map"] svg',
        '[id*="map"] svg',
        'canvas',
        'iframe'
      ];
      
      let workingSelector = null;
      for (const selector of possibleSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          workingSelector = selector;
          break;
        } catch (error) {
          // Continue to next selector
        }
      }
      
      if (!workingSelector) {
        throw new Error(`No map elements found for ${this.mapName}`);
      }
      
      this.workingSelector = workingSelector;
      console.log(`✅ [${this.mapName}] Map loaded successfully`);
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Error navigating to map:`, error.message);
      throw error;
    }
  }

  async startExtraction() {
    try {
      this.isRunning = true;
      
      const intervalMs = parseInt(process.env.EXTRACT_INTERVAL) || 1000;
      
      this.extractionInterval = setInterval(async () => {
        try {
          // Prüfe ob Browser-Neustart nötig ist (alle 30 Minuten)
          const timeSinceRestart = Date.now() - this.lastBrowserRestart;
          if (timeSinceRestart > this.browserRestartInterval) {
            await this.restartBrowser();
          }
          
          await this.extractSVG();
          
          // Memory-Cleanup alle 100 Extraktionen (weniger häufig)
          if (this.extractionCount % 100 === 0) {
            await this.performMemoryCleanup();
          }
          
        } catch (error) {
          console.error(`❌ [${this.mapName}] Extraction error:`, error.message);
        }
      }, intervalMs);
      
      console.log(`✅ [${this.mapName}] Extraction started (${intervalMs}ms interval)`);
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Failed to start extraction:`, error);
      throw error;
    }
  }

  async restartBrowser() {
    try {
      console.log(`🔄 [${this.mapName}] Restarting browser for memory cleanup...`);
      
      // Alte Browser-Instanz schließen
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      // Memory cleanup
      if (global.gc) {
        global.gc();
      }
      
      // Neue Browser-Instanz starten
      await this.init();
      await this.login();
      await this.navigateToMap();
      
      this.lastBrowserRestart = Date.now();
      console.log(`✅ [${this.mapName}] Browser restarted successfully`);
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Browser restart failed:`, error.message);
      // Bei Fehler trotzdem Timestamp aktualisieren um endlose Restart-Loops zu vermeiden
      this.lastBrowserRestart = Date.now();
      throw error;
    }
  }

  async performMemoryCleanup() {
    try {
      if (this.page) {
        // Browser-Cache leeren über CDP Session
        const client = await this.page.target().createCDPSession();
        
        // Verschiedene Cache-Clearing Methoden
        try {
          await client.send('Network.clearBrowserCache');
        } catch (error) {
          console.log(`🧹 [${this.mapName}] Network cache clearing not available: ${error.message}`);
        }
        
        try {
          await client.send('Storage.clearDataForOrigin', {
            origin: await this.page.url(),
            storageTypes: 'all'
          });
        } catch (error) {
          console.log(`🧹 [${this.mapName}] Storage clearing not available: ${error.message}`);
        }
        
        // Versuche Runtime.collectGarbage nur wenn verfügbar
        try {
          await client.send('Runtime.collectGarbage');
        } catch (error) {
          // Fallback: Page-level Memory cleanup
          await this.page.evaluate(() => {
            // Browser-eigene Garbage Collection triggern
            if (window.gc) {
              window.gc();
            }
            
            // Memory-intensive Operations cleanup
            if (window.performance && window.performance.clearMeasures) {
              window.performance.clearMeasures();
              window.performance.clearMarks();
            }
            
            // Clear various caches
            if ('caches' in window) {
              caches.keys().then(names => {
                names.forEach(name => {
                  caches.delete(name);
                });
              });
            }
            
            // Force garbage collection durch Memory-intensive Operation
            const largeArray = new Array(1000000).fill('cleanup');
            largeArray.length = 0;
            
            return 'cleanup_completed';
          });
        }
        
        await client.detach();
      }
      
      // Node.js Garbage Collection
      if (global.gc) {
        global.gc();
      }
      
      console.log(`🧹 [${this.mapName}] Memory cleanup performed (extraction #${this.extractionCount})`);
    } catch (error) {
      console.error(`❌ [${this.mapName}] Memory cleanup failed: ${error.message}`);
    }
  }

  async extractSVG() {
    try {
      // Check if element still exists
      await this.page.waitForSelector(this.workingSelector, { timeout: 5000 });
      
      const svgData = await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { error: 'Element not found' };
        
        if (element.tagName.toUpperCase() === 'SVG') {
          const clone = element.cloneNode(true);
          const outerHTML = clone.outerHTML;
          
          return {
            type: 'SVG',
            data: outerHTML,
            childCount: element.children.length,
            hasContent: outerHTML.length > 50,
            viewBox: element.getAttribute ? element.getAttribute('viewBox') : null,
            width: element.getAttribute ? element.getAttribute('width') : null,
            height: element.getAttribute ? element.getAttribute('height') : null
          };
        } else if (element.tagName.toUpperCase() === 'CANVAS') {
          try {
            const dataURL = element.toDataURL();
            return {
              type: 'CANVAS',
              data: dataURL,
              width: element.width,
              height: element.height,
              hasContent: dataURL.length > 100
            };
          } catch (error) {
            return { 
              type: 'CANVAS',
              error: 'Cannot read canvas: ' + error.message 
            };
          }
        }
        
        return { error: 'Unknown element type: ' + element.tagName };
      }, this.workingSelector);
      
      if (svgData.data && svgData.hasContent) {
        await this.saveSVGData(svgData.data);
        // Reset error counter on successful extraction
        this.consecutiveErrors = 0;
        this.lastSuccessfulExtraction = Date.now();
        this.extractionCount++;
      }
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] SVG extraction failed:`, error.message);
      this.consecutiveErrors++;
      
      // Check if we're logged out
      const isLoggedOut = await this.checkIfLoggedOut();
      if (isLoggedOut) {
        console.log(`🔄 [${this.mapName}] Detected logout, attempting session recovery...`);
        const recovered = await this.handleSessionExpired();
        if (!recovered) {
          console.error(`💥 [${this.mapName}] Session recovery failed, exiting...`);
          await this.stop();
          process.exit(1);
        }
      }
      
      // If too many consecutive errors, exit
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`💥 [${this.mapName}] Too many consecutive errors (${this.consecutiveErrors}), exiting...`);
        await this.stop();
        process.exit(1);
      }
      
      throw error;
    }
  }

  async saveSVGData(svgData) {
    try {
      const timestamp = new Date().toISOString();
      
      // SVG für Dark Mode anpassen - weißen Background entfernen
      let processedSvgData = svgData;
      let patternDefinition = null; // Variable außerhalb des if-Blocks definieren
      
      // SVG-Verarbeitung (nur für SVG-Daten)
      if (svgData.startsWith('<svg')) {
        // Debug: Log original SVG length per map
        console.log(`🔍 [${this.mapName}] Processing SVG with map-specific patterns (${Math.round(svgData.length / 1024)}KB)`);
        
        // WICHTIG: Mache Pattern-IDs eindeutig pro Map, anstatt sie zu entfernen
        const mapSpecificId = `background-${this.mapId}`;
        
        // Extrahiere Pattern-Definition für zentrale Verwaltung
        const patternMatch = processedSvgData.match(/<pattern id="background"[^>]*>[\s\S]*?<\/pattern>/gi);
        if (patternMatch) {
          patternDefinition = patternMatch[0].replace(/id="background"/gi, `id="${mapSpecificId}"`);
        }
        
        // Ersetze generische "background" Pattern-ID mit map-spezifischer ID
        processedSvgData = processedSvgData.replace(/<pattern id="background"/gi, `<pattern id="${mapSpecificId}"`);
        
        // Update alle Referenzen auf die neue map-spezifische ID
        // Normale Anführungszeichen
        processedSvgData = processedSvgData.replace(/fill="url\(#background\)"/gi, `fill="url(#${mapSpecificId})"`);
        processedSvgData = processedSvgData.replace(/stroke="url\(#background\)"/gi, `stroke="url(#${mapSpecificId})"`);
        
        // HTML-Entitäten (&quot; anstatt ")
        processedSvgData = processedSvgData.replace(/fill="url\(&quot;#background&quot;\)"/gi, `fill="url(&quot;#${mapSpecificId}&quot;)"`);
        processedSvgData = processedSvgData.replace(/stroke="url\(&quot;#background&quot;\)"/gi, `stroke="url(&quot;#${mapSpecificId}&quot;)"`);
        
        // Entferne nur störende weiße Hintergründe, aber behalte eingebettete Bilder
        // 1. Entferne explizite weiße background-color (nicht Pattern-Backgrounds!)
        processedSvgData = processedSvgData.replace(/style="([^"]*?)background-color:\s*(?:white|#ffffff|rgb\(255,\s*255,\s*255\))(.*?)"/gi, (match, before, after) => {
          const cleaned = (before + after).replace(/;\s*;/g, ';').replace(/^;\s*|;\s*$/g, '');
          return cleaned ? `style="${cleaned}"` : '';
        });
        
        // 2. Entferne einfache background-style Attribute (nur solid colors)
        processedSvgData = processedSvgData.replace(/\sstyle="background-color:\s*(?:white|#ffffff|rgb\(255,\s*255,\s*255\))"/gi, '');
        processedSvgData = processedSvgData.replace(/\sstyle="background:\s*(?:white|#ffffff|rgb\(255,\s*255,\s*255\))"/gi, '');
        
        // 3. Entferne weiße rect-Backgrounds nur wenn sie sehr groß sind (wahrscheinlich Vollbild-Hintergründe)
        processedSvgData = processedSvgData.replace(/(<rect[^>]*width="[^"]*"[^>]*height="[^"]*"[^>]*fill=")(?:white|#ffffff|#FFFFFF|rgb\(255,\s*255,\s*255\))("[^>]*>)/gi, (match, before, after) => {
          // Prüfe ob es ein großer Hintergrund-Rect ist
          const widthMatch = match.match(/width="([^"]+)"/);
          const heightMatch = match.match(/height="([^"]+)"/);
          if (widthMatch && heightMatch) {
            const width = parseFloat(widthMatch[1]);
            const height = parseFloat(heightMatch[1]);
            // Nur große Rects (> 1000x1000) als Hintergrund behandeln
            if (width > 1000 && height > 1000) {
              return before + 'transparent' + after;
            }
          }
          return match; // Kleine Rects behalten
        });
        
        // Debug: Log processed SVG length and changes
        const changeSize = svgData.length - processedSvgData.length;
        const patternCount = (processedSvgData.match(/pattern id="/g) || []).length;
        console.log(`🎨 [${this.mapName}] Pattern processing: ${patternCount} patterns found, ${changeSize} characters changed`);
        
        // Prüfe ob map-spezifische Pattern-ID erfolgreich gesetzt wurde
        if (processedSvgData.includes(mapSpecificId)) {
          console.log(`✅ [${this.mapName}] Map-specific pattern ID '${mapSpecificId}' applied successfully`);
        } else {
          console.log(`⚠️ [${this.mapName}] No background pattern found in SVG`);
        }
      }
      
      // Metadata erstellen
      const metadata = {
        mapId: this.mapId,
        mapName: this.mapName,
        timestamp: timestamp,
        url: `http://${this.routerIP}/webfig/#Dude:Network_Maps.Network_Map.${this.mapId}`,
        selector: this.workingSelector,
        patternDefinition: patternDefinition // Pattern-Definition hinzufügen
      };
        
        // IPC Message an Parent Process senden (In-Memory-System)
        if (process.send) {
          try {
            process.send({
              type: 'map-update',
              mapId: this.mapId,
              svgData: processedSvgData,
              metadata: metadata
            });
            
            // Reduziertes Logging - nur jede 20. Extraktion loggen
            if (this.extractionCount % 20 === 1) {
              console.log(`📡 [${this.mapName}] Extraction #${this.extractionCount} sent via IPC (${Math.round(processedSvgData.length / 1024)}KB)`);
            }
          } catch (ipcError) {
            console.error(`❌ [${this.mapName}] IPC error:`, ipcError.message);
          }
        }
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Error processing SVG data:`, error);
    }
  }

  async stop() {
    console.log(`🛑 [${this.mapName}] Stopping extraction...`);
    this.isRunning = false;
    
    if (this.extractionInterval) {
      clearInterval(this.extractionInterval);
      this.extractionInterval = null;
    }
    
    try {
      if (this.page) {
        // Seite schließen und aufräumen
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        // Browser ordnungsgemäß schließen
        await this.browser.close();
        this.browser = null;
      }
      
      // User Data Directory löschen
      const userDataDir = `/tmp/puppeteer/${this.mapId}`;
      try {
        const fs = require('fs').promises;
        const path = require('path');
        
        // Prüfe ob Verzeichnis existiert
        await fs.access(userDataDir);
        
        // Rekursiv löschen
        await fs.rm(userDataDir, { recursive: true, force: true });
        console.log(`🗑️ [${this.mapName}] User data directory cleaned: ${userDataDir}`);
      } catch (fsError) {
        // Verzeichnis existiert nicht oder konnte nicht gelöscht werden
        if (fsError.code !== 'ENOENT') {
          console.warn(`⚠️ [${this.mapName}] Could not clean user data directory: ${fsError.message}`);
        }
      }
      
      // Node.js Memory cleanup
      if (global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Error during cleanup:`, error.message);
      
      // Force kill browser wenn normal cleanup fehlschlägt
      if (this.browser && this.browser.process()) {
        this.browser.process().kill('SIGKILL');
      }
    }
    
    console.log(`✅ [${this.mapName}] Extraction stopped and cleaned up`);
  }

  async run() {
    try {
      console.log(`🔧 [${this.mapName}] Starting browser initialization...`);
      await this.init();
      
      console.log(`🔑 [${this.mapName}] Starting login process...`);
      await this.login();
      
      console.log(`🗺️ [${this.mapName}] Navigating to map...`);
      await this.navigateToMap();
      
      console.log(`⚡ [${this.mapName}] Starting extraction...`);
      await this.startExtraction();
      
      // Keep running until interrupted
      process.on('SIGINT', async () => {
        console.log(`\n🛑 [${this.mapName}] Received SIGINT, stopping...`);
        await this.stop();
        process.exit(0);
      });
      
      console.log(`🎯 [${this.mapName}] Extraction running successfully - Press Ctrl+C to stop`);
      
    } catch (error) {
      console.error(`💥 [${this.mapName}] Failed to run:`, error.message);
      console.error(`💥 [${this.mapName}] Error stack:`, error.stack);
      await this.stop();
      process.exit(1);
    }
  }
}

// CLI Usage
if (require.main === module) {
  const mapId = process.argv[2];
  const mapName = process.argv[3];
  
  if (!mapId || !mapName) {
    console.log('Usage: node extract-single-map.js <MAP_ID> <MAP_NAME>');
    console.log('Example: node extract-single-map.js 10159 "Main"');
    process.exit(1);
  }
  
  const routerIP = process.env.MIKROTIK_IP || '10.0.0.10';
  const username = process.env.MIKROTIK_USER || 'admin';
  const password = process.env.MIKROTIK_PASS || '';
  
  const extractor = new SingleMapExtractor(routerIP, username, password, mapId, mapName);
  extractor.run();
}

module.exports = SingleMapExtractor;
