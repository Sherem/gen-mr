#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import { getConfig, generatePrompt } from "./common.mjs";
const argv = minimist(process.argv.slice(2));

const postToGitlab = async (url, data, token) => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "PRIVATE-TOKEN": token,
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return response.json();
};

const main = async () => {
    // Check for required arguments
    const sourceBranch = argv.source;
    const targetBranch = argv.target;
    const jiraTickets = argv.jira || "";
    if (!sourceBranch || !targetBranch) {
        console.log(
            "Usage: gen-mr --source <sourceBranch> --target <targetBranch> [--jira <JIRA-123,JIRA-456>]"
        );
        process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const config = getConfig();
    const { gitlabToken, openaiToken, gitlabUrl } = config;
    const aiResult = await generatePrompt(openaiToken, sourceBranch, targetBranch, jiraTickets);
    const [title, ...descArr] = aiResult.split("\n");
    const description = descArr.join("\n");
    console.log("\nGenerated Title:", title);
    console.log("Generated Description:", description);
    rl.question("Do you want to edit the title/description? (y/N): ", async (edit) => {
        let finalTitle = title;
        let finalDescription = description;
        if (edit.toLowerCase() === "y") {
            finalTitle = await new Promise((res) => rl.question("New Title: ", res));
            finalDescription = await new Promise((res) => rl.question("New Description: ", res));
        }
        // Create MR via GitLab API using native fetch
        try {
            const res = await postToGitlab(
                `${gitlabUrl}/api/v4/projects/${config.gitlabProjectId}/merge_requests`,
                {
                    source_branch: sourceBranch,
                    target_branch: targetBranch,
                    title: finalTitle,
                    description: finalDescription,
                },
                gitlabToken
            );
            console.log("Merge request created:", res.web_url);
        } catch (err) {
            console.error("Failed to create merge request:", err.message);
        }
        rl.close();
    });
};

main();
