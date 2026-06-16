module.exports = {
  rootDir: '../../',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/apps/remotion-templates/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: require('../../jest.config.js').moduleNameMapper,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
      },
    }],
  },
};
