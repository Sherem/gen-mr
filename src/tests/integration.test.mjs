import { describe, test, expect } from "@jest/globals";

describe("System Integration Tests", () => {
    test("should be able to import main modules without errors", async () => {
        // Test that main modules can be imported successfully
        await expect(import("../git-utils.mjs")).resolves.toBeDefined();
        await expect(import("../prompt-generator.mjs")).resolves.toBeDefined();
        await expect(import("../github-utils.mjs")).resolves.toBeDefined();
        await expect(import("../merge-request-generator.mjs")).resolves.toBeDefined();
    });

    test("should have proper module exports", async () => {
        const gitUtils = await import("../git-utils.mjs");
        const promptGenerator = await import("../prompt-generator.mjs");

        // Check that expected functions are exported
        expect(typeof gitUtils.parseRepoFromRemote).toBe("function");
        expect(typeof gitUtils.detectRepoType).toBe("function");
        expect(typeof gitUtils.getGitDiff).toBe("function");

        expect(typeof promptGenerator.generateMergeRequestPrompt).toBe("function");
        expect(typeof promptGenerator.generateDefaultPrompt).toBe("function");
        expect(typeof promptGenerator.generateMinimalPrompt).toBe("function");
    });

    test("package.json should have correct test scripts", async () => {
        // Read package.json using require since we're in a test environment
        const fs = require("fs");
        const path = require("path");

        const packageJsonPath = path.join(process.cwd(), "package.json");
        const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);

        expect(packageJson.scripts.test).toBe("jest");
        expect(packageJson.scripts["test:watch"]).toBe("jest --watch");
        expect(packageJson.scripts["test:coverage"]).toBe("jest --coverage");
    });

    test("should have Jest in devDependencies", async () => {
        // Read package.json using require since we're in a test environment
        const fs = require("fs");
        const path = require("path");

        const packageJsonPath = path.join(process.cwd(), "package.json");
        const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);

        expect(packageJson.devDependencies.jest).toBeDefined();
        expect(packageJson.devDependencies["@babel/core"]).toBeDefined();
        expect(packageJson.devDependencies["@babel/preset-env"]).toBeDefined();
        expect(packageJson.devDependencies["babel-jest"]).toBeDefined();
    });
});
