"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDataMdDigest = extractDataMdDigest;
const fs_1 = require("fs");
const path_1 = require("path");
function extractDataMdDigest(workspaceRoot) {
    try {
        const dataPath = workspaceRoot
            ? (0, path_1.join)(workspaceRoot, 'data.md')
            : (0, path_1.join)(process.cwd(), 'data.md');
        const content = (0, fs_1.readFileSync)(dataPath, 'utf-8');
        // Strip markdown, compress whitespace, limit to 600 chars
        const cleaned = content
            .replace(/^.*?→/gm, '') // Remove line numbers and arrows
            .replace(/[#*_`]/g, '') // Remove markdown formatting
            .replace(/💡/g, 'Key:') // Replace emoji
            .replace(/\n\s*\n/g, '\n') // Compress empty lines
            .replace(/\s+/g, ' ') // Compress whitespace
            .trim();
        return cleaned.slice(0, 600);
    }
    catch (error) {
        console.warn('Failed to read data.md:', error);
        return undefined;
    }
}
