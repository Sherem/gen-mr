// common.js
// Handles config/token management

import fs from "fs/promises";
import path from "path";
import os from "os";

import { execSync } from "child_process";

export const getConfig = async () => {
    const localPath = path.resolve(process.cwd(), ".gen-mr/config.json");
    const homePath = path.resolve(os.homedir(), ".gen-mr/config.json");
    try {
        await fs.access(localPath);
        const data = await fs.readFile(localPath, "utf8");
        return JSON.parse(data);
    } catch {
        try {
            await fs.access(homePath);
            const data = await fs.readFile(homePath, "utf8");
            return JSON.parse(data);
        } catch {
            throw new Error("No config found in .gen-mr directory");
        }
    }
};

/**
 * Get the configured editor command from the config file
 * @returns {Promise<string|null>} The editor command, or null if not configured
 */
export const getEditorCommand = async () => {
    try {
        const config = await getConfig();
        return config.editorCommand || null;
    } catch {
        return null;
    }
};

/**
 * Execute the configured editor on content
 * @param {string} editorCommand - The editor command to execute
 * @param {string} content - The content to edit
 * @param {string} fileExtension - File extension for syntax highlighting (default: '.md')
 * @returns {Promise<string>} The edited content
 */
const executeEditor = async (editorCommand, content, line = 1, fileExtension = ".md") => {
    const tempDir = os.tmpdir();
    const tempFileName = `gen-mr-edit-${Date.now()}${fileExtension}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    const fileRegex = /\{file\}/g;
    const lineRegex = /\{line\}/g;

    try {
        // Write content to temporary file
        await fs.writeFile(tempFilePath, content, "utf8");

        // Execute editor command
        const hasFileTemplate = fileRegex.test(editorCommand);
        const command = editorCommand
            .replace(lineRegex, `${line}`)
            .replace(fileRegex, tempFilePath);
        const commandParts = command.split(/\s+/);
        // const executable = commandParts[0];
        // const args = commandParts.slice(1);
        if (!hasFileTemplate) {
            commandParts.push(tempFilePath);
        }

        execSync(commandParts.join(" "), { stdio: "inherit", shell: true });

        const editedContent = await fs.readFile(tempFilePath, "utf8");
        return editedContent;
    } finally {
        // Clean up temporary file
        try {
            await fs.unlink(tempFilePath);
        } catch {
            // Ignore cleanup errors
        }
    }
};

/**
 * Open content in the configured editor
 * @param {string} content - The content to edit
 * @param {string} fileExtension - File extension for syntax highlighting (e.g., '.md', '.txt')
 * @returns {Promise<string>} The edited content
 */
export const openInEditor = async (content, line = 1, fileExtension = ".md") => {
    const editorCommand = await getEditorCommand();

    if (!editorCommand) {
        throw new Error(
            "No editor configured. Run 'gen-pr --configure-editor' or 'gen-mr --configure-editor' to set up an editor."
        );
    }

    return await executeEditor(editorCommand, content, line, fileExtension);
};

/**
 * Edit pull request title and description using the configured editor
 * Creates a temporary file with title on first line, followed by separator and description
 * @param {string} title - The current title
 * @param {string} description - The current description
 * @param {string} fileExtension - File extension for syntax highlighting (default: '.md')
 * @returns {Promise<{title: string, description: string}>} The edited title and description
 */
export const editPullRequestContent = async (title, description, line, fileExtension = ".md") => {
    // Create content with title on first line, separator, then description
    const content = `${title}\n\n---\n\n${description}`;

    // Execute editor and get edited content
    const editedContent = await openInEditor(content, line, fileExtension);

    // Parse the edited content back into title and description
    const lines = editedContent.split("\n");
    const separatorIndex = lines.findIndex((line) => line.trim() === "---");

    let finalTitle = title;
    let finalDescription = description;

    if (separatorIndex !== -1) {
        // Separator found - everything before is title, everything after is description
        finalTitle = lines.slice(0, separatorIndex).join("\n").trim();
        finalDescription = lines
            .slice(separatorIndex + 1)
            .join("\n")
            .trim();
    } else {
        // No separator found - treat first line as title, rest as description
        finalTitle = lines[0] || title;
        finalDescription = lines.slice(1).join("\n").trim() || description;
    }

    return {
        title: finalTitle,
        description: finalDescription,
    };
};

/**
 * Display current configuration
 * @param {boolean} isGlobal - Whether to show global configuration specifically
 */
export const showCurrentConfig = async (isGlobal = false) => {
    console.log("\n⚙️  Current Configuration");
    console.log("=".repeat(40));

    const localPath = path.resolve(process.cwd(), ".gen-mr/config.json");
    const globalPath = path.resolve(os.homedir(), ".gen-mr/config.json");

    let localConfig = null;
    let globalConfig = null;

    // Try to read local config
    try {
        await fs.access(localPath);
        const data = await fs.readFile(localPath, "utf8");
        localConfig = JSON.parse(data);
    } catch {
        // Local config doesn't exist or is invalid
    }

    // Try to read global config
    try {
        await fs.access(globalPath);
        const data = await fs.readFile(globalPath, "utf8");
        globalConfig = JSON.parse(data);
    } catch {
        // Global config doesn't exist or is invalid
    }

    if (isGlobal) {
        // Show only global configuration
        console.log("📍 Global Configuration:");
        console.log(`   Path: ${globalPath}`);

        if (globalConfig) {
            console.log("   Status: ✅ Found");
            displayConfigContents(globalConfig);
        } else {
            console.log("   Status: ❌ Not found");
        }
    } else {
        // Show both configurations with priority explanation
        console.log("📍 Configuration Locations (Local takes priority over Global):");
        console.log("");

        // Local config
        console.log("🏠 Local Configuration:");
        console.log(`   Path: ${localPath}`);
        if (localConfig) {
            console.log("   Status: ✅ Found");
            displayConfigContents(localConfig);
        } else {
            console.log("   Status: ❌ Not found");
        }

        console.log("");

        // Global config
        console.log("🌍 Global Configuration:");
        console.log(`   Path: ${globalPath}`);
        if (globalConfig) {
            console.log("   Status: ✅ Found");
            displayConfigContents(globalConfig);
        } else {
            console.log("   Status: ❌ Not found");
        }

        console.log("");

        // Show effective configuration
        const effectiveConfig = localConfig || globalConfig;
        if (effectiveConfig) {
            console.log("🎯 Effective Configuration (currently in use):");
            console.log(`   Source: ${localConfig ? "Local" : "Global"}`);
            displayConfigContents(effectiveConfig);
        } else {
            console.log("🎯 Effective Configuration: ❌ No configuration found");
            console.log("");
            console.log("💡 To get started, configure the following:");
            console.log("   • GitHub token: gen-pr --create-token");
            console.log("   • AI token: gen-pr --create-ai-token ChatGPT");
            console.log("   • Editor: gen-pr --configure-editor");
            console.log("   • AI model: gen-pr --use-model gpt-4o");
        }
    }

    console.log("");
};

/**
 * Display the contents of a configuration object
 * @param {Object} config - The configuration object to display
 */
const displayConfigContents = (config) => {
    const keys = Object.keys(config);
    if (keys.length === 0) {
        console.log("   Contents: (empty)");
        return;
    }

    console.log("   Contents:");

    // GitHub Token
    if (config.githubToken) {
        const masked = `${config.githubToken.substring(0, 4)}${"*".repeat(Math.max(0, config.githubToken.length - 8))}${config.githubToken.substring(config.githubToken.length - 4)}`;
        console.log(`     • GitHub Token: ${masked}`);
    }

    // OpenAI Token
    if (config.openaiToken) {
        const masked = `${config.openaiToken.substring(0, 4)}${"*".repeat(Math.max(0, config.openaiToken.length - 8))}${config.openaiToken.substring(config.openaiToken.length - 4)}`;
        console.log(`     • OpenAI Token: ${masked}`);
    }

    // OpenAI Model
    if (config.openaiModel) {
        console.log(`     • OpenAI Model: ${config.openaiModel}`);
    }

    // Editor Command
    if (config.editorCommand) {
        console.log(`     • Editor Command: ${config.editorCommand}`);
    }

    // Show any other unexpected keys
    const knownKeys = ["githubToken", "openaiToken", "openaiModel", "editorCommand"];
    const unknownKeys = keys.filter((key) => !knownKeys.includes(key));
    if (unknownKeys.length > 0) {
        unknownKeys.forEach((key) => {
            console.log(`     • ${key}: ${config[key]}`);
        });
    }
};
