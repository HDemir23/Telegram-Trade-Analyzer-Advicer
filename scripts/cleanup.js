#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning up project structure...');

// Files to remove (temporary test files)
const filesToRemove = [
  'test-all-commands.js',
  'show-eth-protection.js', 
  'test-enhanced-analysis.js',
  'test-all-markets.js',
  'test-robust-analysis.js',
  'test-fixes.js',
  'test-v2-system.js',
  'debug-env.js',
  'test-analyze.js',
  'test-enhanced-bot.js',
  'test-equal-data.js',
  'test-audit-fixes.js',
  'test-live-implementation-fixes.js',
  'demo-v2-improvements.js',
  'explain-analysis-flow.js'
];

// Markdown files to keep in docs/
const docsToKeep = [
  'TELEGRAM-BOT-GUIDE.md',
  'TRADING_GUIDE.md', 
  'V2-COMPLETE-SUMMARY.md',
  'WORKFLOW-V2.md',
  'WORKING-TELEGRAM-GUIDE.md',
  'data.md',
  'tasks.md'
];

// Create directories if they don't exist
const directories = ['scripts', 'docs', 'tests', '__tests__'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Remove temporary files
filesToRemove.forEach(file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`🗑️  Removed: ${file}`);
  }
});

// Move docs to docs/ directory
docsToKeep.forEach(file => {
  if (fs.existsSync(file) && !fs.existsSync(`docs/${file}`)) {
    fs.renameSync(file, `docs/${file}`);
    console.log(`📁 Moved to docs/: ${file}`);
  }
});

// Clean up redundant bot files
const botDir = 'apps/bot/src';
const redundantBotFiles = [
  'enhanced-index.ts',
  'index-simple.ts', 
  'working-enhanced-bot.ts'
];

redundantBotFiles.forEach(file => {
  const filePath = path.join(botDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Removed redundant bot file: ${file}`);
  }
});

console.log('✨ Project cleanup complete!');