import { jest } from '@jest/globals';

// Mock environment variables
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.NODE_ENV = 'test';

// Mock fetch globally
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Increase timeout for AI tests
jest.setTimeout(30000);