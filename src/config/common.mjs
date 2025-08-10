// common.js
// Handles config/token management

import fs from "fs/promises";
import path from "path";
import os from "os";

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
 * Open content in the configured editor
 * @param {string} content - The content to edit
 * @param {string} fileExtension - File extension for syntax highlighting (e.g., '.md', '.txt')
 * @returns {Promise<string>} The edited content
 */
export const openInEditor = async (content, fileExtension = ".md") => {
    const editorCommand = await getEditorCommand();

    if (!editorCommand) {
        throw new Error(
            "No editor configured. Run 'gen-pr --configure-editor' or 'gen-mr --configure-editor' to set up an editor."
        );
    }

    const tempDir = os.tmpdir();
    const tempFileName = `gen-mr-edit-${Date.now()}${fileExtension}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    try {
        // Write content to temporary file
        await fs.writeFile(tempFilePath, content, "utf8");

        // Execute editor command
        const { spawn } = await import("child_process");
        const command = editorCommand.replace(/\{line\}/g, "1").replace(/\{file\}/g, tempFilePath);
        const commandParts = command.split(/\s+/);
        const executable = commandParts[0];
        const args = commandParts.slice(1).concat([tempFilePath]);

        await new Promise((resolve, reject) => {
            const child = spawn(executable, args, {
                stdio: "inherit",
                shell: true,
            });

            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Editor exited with code ${code}`));
                }
            });

            child.on("error", (error) => {
                reject(new Error(`Failed to start editor: ${error.message}`));
            });
        });

        // Read the edited content
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
