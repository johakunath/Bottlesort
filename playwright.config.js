import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/e2e', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: {width:390,height:844}, reducedMotion:'reduce',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] } },
  webServer: { command:'npm run build && npm run preview -- --port 4173', url:'http://127.0.0.1:4173', reuseExistingServer:false },
});
