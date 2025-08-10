// editor-config.mjs
// Handles editor command configuration and storage

import fs from "fs/promises";
import path from "path";
import os from "os";
import readline from "readline";

export const configureEditor = async (isGlobal = false) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log("\n📝 Editor Command Configuration");
    console.log("=".repeat(40));
    console.log("Configure the command to open your preferred editor for editing PR/MR content.");
    console.log("\n💡 Examples:");
    console.log("  code         - Opens VS Code");
    console.log("  vim          - Opens Vim");
    console.log("  nano         - Opens Nano");
    console.log("  subl         - Opens Sublime Text");
    console.log("  atom         - Opens Atom");
    console.log("  code -w      - Opens VS Code and waits for file to be closed");
    console.log("  vim +{line}  - Opens Vim and positions cursor at line");
    console.log("\n🔧 The command will be used to open a temporary file for editing.");
    console.log("⚠️  Make sure the command is available in your PATH.\n");

    return new Promise((resolve, reject) => {
        rl.question("📋 Enter editor command: ", async (editorCommand) => {
            if (!editorCommand || editorCommand.trim().length === 0) {
                console.log("❌ No editor command provided. Exiting...");
                rl.close();
                reject(new Error("No editor command provided"));
                return;
            }

            try {
                // Basic validation - check if the base command exists
                const baseCommand = editorCommand.trim().split(/\s+/)[0];
                console.log(`🔍 Validating command '${baseCommand}'...`);

                // Try to check if command exists (this is a basic check)
                try {
                    const { execSync } = await import("child_process");
                    execSync(`which ${baseCommand}`, { stdio: "ignore" });
                    console.log(`✅ Command '${baseCommand}' found in PATH!`);
                } catch {
                    console.log(`⚠️  Warning: Command '${baseCommand}' not found in PATH.`);
                    console.log("   Make sure it's installed and available before using it.");
                }

                // Save editor command to config
                await saveEditorToConfig(editorCommand.trim(), isGlobal);

                console.log(`💾 Editor command saved ${isGlobal ? "globally" : "locally"}!`);
                console.log("🎉 You can now use advanced editing features with gen-pr/gen-mr.\n");

                rl.close();
                resolve();
            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
                rl.close();
                reject(error);
            }
        });
    });
};

const saveEditorToConfig = async (editorCommand, isGlobal) => {
    const configDir = isGlobal
        ? path.resolve(os.homedir(), ".gen-mr")
        : path.resolve(process.cwd(), ".gen-mr");

    const configPath = path.join(configDir, "config.json");

    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });

    let config = {};
    try {
        // Try to read existing config
        const existingConfig = await fs.readFile(configPath, "utf8");
        config = JSON.parse(existingConfig);
    } catch {
        // File doesn't exist or is invalid, start with empty config
    }

    // Update config with new editor command
    config.editorCommand = editorCommand;

    // Write config back
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    console.log(`📁 Config saved to: ${configPath}`);
};

export const showEditorConfigHelp = () => {
    console.log("\n📝 Editor Configuration");
    console.log("=".repeat(40));
    console.log("Use --configure-editor to set up your preferred editor command:");
    console.log("");
    console.log(
        "  gen-pr --configure-editor              Save editor command locally (./.gen-mr/config.json)"
    );
    console.log(
        "  gen-pr --configure-editor --global     Save editor command globally (~/.gen-mr/config.json)"
    );
    console.log(
        "  gen-pr --configure-editor -g           Save editor command globally (short form)"
    );
    console.log("");
    console.log("The editor command is used for advanced editing of PR/MR title and description.");
    console.log("You only need to do this once per project (local) or once per machine (global).");
    console.log("");
};
