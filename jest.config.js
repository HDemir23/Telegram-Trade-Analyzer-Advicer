/** @type {import('jest').Config} */
module.exports = {
  passWithNoTests: true,
  testEnvironment: 'node',
  preset: 'ts-jest',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'packages/ai/src/**/*.ts',
    '!packages/ai/src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
};