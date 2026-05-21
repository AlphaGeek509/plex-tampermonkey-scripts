require('dotenv').config();
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  use: {
    baseURL: 'https://lyntron.test.on.plex.com',
    headless: false
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.js' },
    {
      name: 'qt-tests',
      dependencies: ['setup'],
      use: { storageState: 'tests/.auth/plex-session.json' }
    }
  ]
});
