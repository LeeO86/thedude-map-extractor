const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class SingleMapExtractor {
  constructor(routerIP, username, password, mapId, mapName) {
    this.routerIP = routerIP;
    this.username = username;
    this.password = password;
    this.mapId = mapId;
    this.mapName = mapName;
    this.browser = null;
    this.page = null;
    this.extractionInterval = null;
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.lastSuccessfulExtraction = Date.now();
  }

  async init() {
    const headless = process.env.HEADLESS === 'true';
    console.log(`🚀 [${this.mapName}] Starting extraction process`);
    
    this.browser = await puppeteer.launch({
      headless: headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    this.page = await this.browser.newPage();
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
          await this.extractSVG();
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
      const extractedDir = path.join(__dirname, 'extracted');
      if (!fs.existsSync(extractedDir)) {
        fs.mkdirSync(extractedDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString();
      const filename = `${this.mapId}_${this.mapName.replace(/[^a-zA-Z0-9]/g, '_')}_latest`;
      
      // Save SVG
      if (svgData.startsWith('<svg')) {
        // SVG für Dark Mode anpassen - weißen Background entfernen
        let processedSvgData = svgData;
        
        // Entferne background-style Attribute
        processedSvgData = processedSvgData.replace(/style="[^"]*background:\s*rgb\(255,\s*255,\s*255\)[^"]*"/gi, '');
        processedSvgData = processedSvgData.replace(/style="[^"]*background:\s*#ffffff[^"]*"/gi, '');
        processedSvgData = processedSvgData.replace(/style="[^"]*background:\s*white[^"]*"/gi, '');
        
        // Entferne einfache background-style Attribute (wenn sie das einzige Attribut sind)
        processedSvgData = processedSvgData.replace(/\sstyle="background:\s*rgb\(255,\s*255,\s*255\)"/gi, '');
        processedSvgData = processedSvgData.replace(/\sstyle="background:\s*#ffffff"/gi, '');
        processedSvgData = processedSvgData.replace(/\sstyle="background:\s*white"/gi, '');
        
        // Entferne weiße rect-Backgrounds
        processedSvgData = processedSvgData.replace(/(<rect[^>]*fill=")(?:white|#ffffff|rgb\(255,\s*255,\s*255\))("[^>]*>)/gi, '$1transparent$2');
        
        fs.writeFileSync(path.join(extractedDir, `${filename}.svg`), processedSvgData);
      } else if (svgData.startsWith('data:image/')) {
        // Canvas data URL
        const base64Data = svgData.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(path.join(extractedDir, `${filename}.png`), base64Data, 'base64');
      }
      
      // Save metadata
      const metadata = {
        mapId: this.mapId,
        mapName: this.mapName,
        timestamp: timestamp,
        url: `http://${this.routerIP}/webfig/#Dude:Network_Maps.Network_Map.${this.mapId}`,
        selector: this.workingSelector
      };
      
      fs.writeFileSync(path.join(extractedDir, `${filename}.json`), JSON.stringify(metadata, null, 2));
      
    } catch (error) {
      console.error(`❌ [${this.mapName}] Error saving SVG data:`, error);
    }
  }

  async stop() {
    console.log(`🛑 [${this.mapName}] Stopping extraction...`);
    this.isRunning = false;
    
    if (this.extractionInterval) {
      clearInterval(this.extractionInterval);
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log(`✅ [${this.mapName}] Extraction stopped`);
  }

  async run() {
    try {
      await this.init();
      await this.login();
      await this.navigateToMap();
      await this.startExtraction();
      
      // Keep running until interrupted
      process.on('SIGINT', async () => {
        console.log(`\n🛑 [${this.mapName}] Received SIGINT, stopping...`);
        await this.stop();
        process.exit(0);
      });
      
      console.log(`🎯 [${this.mapName}] Press Ctrl+C to stop extraction`);
      
    } catch (error) {
      console.error(`💥 [${this.mapName}] Failed to run:`, error);
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
