import { readFileSync } from 'fs';
import { join } from 'path';

export function extractDataMdDigest(workspaceRoot?: string): string | undefined {
  try {
    const dataPath = workspaceRoot 
      ? join(workspaceRoot, 'data.md')
      : join(process.cwd(), 'data.md');
    
    const content = readFileSync(dataPath, 'utf-8');
    
    // Strip markdown, compress whitespace, limit to 600 chars
    const cleaned = content
      .replace(/^.*?→/gm, '') // Remove line numbers and arrows
      .replace(/[#*_`]/g, '') // Remove markdown formatting
      .replace(/💡/g, 'Key:') // Replace emoji
      .replace(/\n\s*\n/g, '\n') // Compress empty lines
      .replace(/\s+/g, ' ') // Compress whitespace
      .trim();
    
    return cleaned.slice(0, 600);
  } catch (error) {
    console.warn('Failed to read data.md:', error);
    return undefined;
  }
}