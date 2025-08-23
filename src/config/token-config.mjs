// token-config.mjs
// Handles GitHub token configuration and storage

import fs from "fs/promises";
import path from "path";
import os from "os";
import readline from "readline";

const GITHUB_TOKEN_URL =
    "https://github.com/settings/tokens/new?scopes=repo&description=gen-pr-cli-tool";

const getGitlabTokenUrl = (host) =>
    `https://${host}/-/user_settings/personal_access_tokens?name=gen-mr-cli-tool&scopes=api`;

export const configureGithubToken = async (isGlobal = false) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log("\n🔗 GitHub Personal Access Token Setup");
    console.log("=".repeat(40));
    console.log("To use this tool, you need a GitHub Personal Access Token.");
    console.log(`\n📋 Please visit: ${GITHUB_TOKEN_URL}`);
    console.log("\n📝 Required scopes: repo (should be pre-selected)");
    console.log("💡 Give your token a descriptive name like gen-pr-cli-tool");
    console.log("\n🔒 After creating the token, copy it and paste it below.");
    console.log("⚠️  Note: The token will only be shown once on GitHub!\n");

    return new Promise((resolve, reject) => {
        rl.question("📋 Paste your GitHub token here: ", async (token) => {
            if (!token || token.trim().length === 0) {
                console.log("❌ No token provided. Exiting...");
                rl.close();
                reject(new Error("No token provided"));
                return;
            }

            try {
                // Validate token by making a simple API call
                console.log("🔍 Validating token...");
                const response = await fetch("https://api.github.com/user", {
                    headers: {
                        Authorization: `token ${token.trim()}`,
                        "User-Agent": "gen-pr-cli",
                    },
                });

                if (!response.ok) {
                    throw new Error(`Invalid token: ${response.status} ${response.statusText}`);
                }

                const user = await response.json();
                console.log(`✅ Token validated! Hello, ${user.login}!`);

                // Save token to config
                await saveTokenToConfig(token.trim(), isGlobal);

                console.log(`💾 Token saved ${isGlobal ? "globally" : "locally"}!`);
                console.log("🎉 You're all set! You can now use gen-pr to create pull requests.\n");

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

export const configureGitlabToken = async (isGlobal = false) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log("\n🦊 GitLab Personal Access Token Setup");
    console.log("=".repeat(40));
    console.log("To use this tool with GitLab, you need a GitLab Personal Access Token.");

    // Ask for GitLab host
    const gitlabHost = await new Promise((resolve) => {
        rl.question("🌐 GitLab host (press Enter for gitlab.com): ", (host) => {
            const trimmedHost = host.trim();
            resolve(trimmedHost || "gitlab.com");
        });
    });

    const tokenUrl = getGitlabTokenUrl(gitlabHost);
    console.log(`\n📋 Please visit: ${tokenUrl}`);
    console.log("\n📝 Required scopes: api (should be pre-selected)");
    console.log("💡 Give your token a descriptive name like gen-mr-cli-tool");
    console.log("\n🔒 After creating the token, copy it and paste it below.");
    console.log("⚠️  Note: The token will only be shown once on GitLab!\n");

    return new Promise((resolve, reject) => {
        rl.question("📋 Paste your GitLab token here: ", async (token) => {
            if (!token || token.trim().length === 0) {
                console.log("❌ No token provided. Exiting...");
                rl.close();
                reject(new Error("No token provided"));
                return;
            }

            try {
                // Validate token by making a simple API call
                console.log("🔍 Validating token...");
                const response = await fetch(`https://${gitlabHost}/api/v4/user`, {
                    headers: {
                        Authorization: `Bearer ${token.trim()}`,
                        "User-Agent": "gen-mr-cli",
                    },
                });

                if (!response.ok) {
                    throw new Error(`Invalid token: ${response.status} ${response.statusText}`);
                }

                const user = await response.json();
                console.log(`✅ Token validated! Hello, ${user.username}!`);

                // Save token and host to config
                await saveGitlabTokenToConfig(token.trim(), gitlabHost, isGlobal);

                console.log(`💾 Token saved ${isGlobal ? "globally" : "locally"}!`);
                console.log(
                    "🎉 You're all set! You can now use gen-mr to create merge requests.\n"
                );

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

const saveTokenToConfig = async (token, isGlobal) => {
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

    // Update config with new GitHub token
    config.githubToken = token;

    // Write config back
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    console.log(`📁 Config saved to: ${configPath}`);
};

const saveGitlabTokenToConfig = async (token, host, isGlobal) => {
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

    // Update config with GitLab token and host
    config.gitlabToken = token;
    config.gitlabHost = host;

    // Write config back
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    console.log(`📁 Config saved to: ${configPath}`);
};

export const showTokenConfigHelp = () => {
    console.log("\n🔑 GitHub Token Configuration");
    console.log("=".repeat(40));
    console.log("Use --create-token to set up your GitHub Personal Access Token:");
    console.log("");
    console.log("  gen-pr --create-token              Save token locally (./.gen-mr/config.json)");
    console.log("  gen-pr --create-token --global     Save token globally (~/.gen-mr/config.json)");
    console.log("  gen-pr --create-token -g           Save token globally (short form)");
    console.log("");
    console.log("The token is used to authenticate with GitHub API for creating pull requests.");
    console.log("You only need to do this once per project (local) or once per machine (global).");
    console.log("");
};
