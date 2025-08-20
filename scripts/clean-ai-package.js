#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning AI package...');

const aiSrcPath = 'packages/ai/src';

// Remove legacy files that aren't being used
const legacyFiles = [
  'orchestrator.ts',
  'orchestrator.js', 
  'orchestrator.d.ts',
  'orchestrator.d.ts.map',
  'schema.ts',
  'schema.js',
  'schema.d.ts', 
  'schema.d.ts.map',
  'quantPrompt.ts',
  'quantPrompt.js',
  'quantPrompt.d.ts',
  'quantPrompt.d.ts.map',
  'featureSummary.ts',
  'featureSummary.js',
  'featureSummary.d.ts',
  'featureSummary.d.ts.map',
  'autoRepair.ts',
  'autoRepair.js',
  'autoRepair.d.ts',
  'autoRepair.d.ts.map'
];

// Remove legacy files
legacyFiles.forEach(file => {
  const filePath = path.join(aiSrcPath, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Removed legacy file: ${file}`);
  }
});

// Remove prompts directory (legacy)
const promptsDir = path.join(aiSrcPath, 'prompts');
if (fs.existsSync(promptsDir)) {
  fs.rmSync(promptsDir, { recursive: true });
  console.log('🗑️  Removed legacy prompts directory');
}

// Clean up compiled files
const compiledExtensions = ['.js', '.d.ts', '.d.ts.map'];
fs.readdirSync(aiSrcPath).forEach(file => {
  if (compiledExtensions.some(ext => file.endsWith(ext))) {
    const filePath = path.join(aiSrcPath, file);
    fs.unlinkSync(filePath);
    console.log(`🗑️  Removed compiled file: ${file}`);
  }
});

console.log('✅ AI package cleanup complete!');