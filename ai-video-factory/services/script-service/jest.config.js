module.exports = {
  rootDir: '../../',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/services/script-service/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: require('../../jest.config.js').moduleNameMapper,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
