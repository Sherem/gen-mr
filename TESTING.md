# Testing Setup

This project uses Jest for testing with support for ES modules (.mjs files).

## Test Structure

Tests are primarily located in the `src/tests/` directory, with provider-specific tests colocated (e.g., `src/git-provider/tests`). Updated structure:

```
src/tests/
├── prompt-generator.test.mjs        # Tests for AI prompt generation
└── integration.test.mjs             # Integration tests
src/git-provider/tests/
└── git-provider.test.mjs            # Tests for git operations
```

## Running Tests

### Basic test run

```bash
npm test
```

### Watch mode (reruns tests when files change)

```bash
npm run test:watch
```

### Coverage report

```bash
npm run test:coverage
```

## Test Configuration

- **Jest Config**: `jest.config.json`
- **Babel Config**: `babel.config.json` (for ES module transformation)

## Test Categories

### Unit Tests

- `git-provider.test.mjs`: Tests utility functions for Git operations like `parseRepoFromRemote` and `detectRepoType` (now in `src/git-provider/tests/`)
- `prompt-generator.test.mjs`: Tests AI prompt generation functions with mocked dependencies

### Integration Tests

- `integration.test.mjs`: Tests module imports and package configuration

## Writing Tests

Tests use Jest with ES module syntax. Example:

```javascript
import { describe, test, expect, jest } from "@jest/globals";
import { functionToTest } from "../module.mjs";

describe("Module Name", () => {
    test("should do something", () => {
        const result = functionToTest("input");
        expect(result).toBe("expected output");
    });
});
```

### Mocking Dependencies

For functions that make external calls (like git commands), use Jest mocks:

```javascript
jest.mock("../git-provider/git-provider.mjs", () => ({
    getGitDiff: jest.fn(),
    getCommitMessages: jest.fn(),
}));
```

## Coverage

The coverage report shows:

- **Statement coverage**: Percentage of statements executed
- **Branch coverage**: Percentage of branches (if/else) executed
- **Function coverage**: Percentage of functions called
- **Line coverage**: Percentage of lines executed

Coverage reports are generated in the `coverage/` directory with HTML reports for detailed analysis.

## Dependencies

Testing dependencies in `devDependencies`:

- `jest`: Testing framework
- `@babel/core`: JavaScript compiler core
- `@babel/preset-env`: Babel preset for environment-specific compilation
- `babel-jest`: Jest integration with Babel for ES module support
