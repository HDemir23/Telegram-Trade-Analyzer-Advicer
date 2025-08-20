#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🗑️  Removing unused packages...');

// Only keep essential packages
const packagesToKeep = ['ai'];

// Get all package directories
const packagesDir = 'packages';
const allPackages = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

// Remove unused packages
allPackages.forEach(pkg => {
  if (!packagesToKeep.includes(pkg)) {
    const pkgPath = path.join(packagesDir, pkg);
    console.log(`🗑️  Removing unused package: ${pkg}`);
    fs.rmSync(pkgPath, { recursive: true, force: true });
  }
});

console.log('✅ Package cleanup complete!');
console.log(`📦 Kept packages: ${packagesToKeep.join(', ')}`);