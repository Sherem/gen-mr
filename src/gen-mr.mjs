#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import { getConfig, generatePrompt } from "./common.mjs";

const argv = minimist(process.argv.slice(2));

// Extract positional arguments (non-option arguments)
const positionalArgs = argv._;

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

const showUsage = () => {
  console.log("\n📋 gen-mr - GitLab Merge Request Generator");
  console.log("=".repeat(45));
  console.log("Usage:");
  console.log("  gen-mr <sourceBranch> <targetBranch> [jiraTickets]");
  console.log("  gen-mr --help");
  console.log("");
  console.log("Arguments:");
  console.log("  sourceBranch           Source branch to merge from");
  console.log("  targetBranch           Target branch to merge into");
  console.log("  jiraTickets            Comma-separated JIRA ticket IDs (optional)");
  console.log("");
  console.log("Options:");
  console.log("  --help                 Show this help message");
  console.log("");
  console.log("Examples:");
  console.log("  gen-mr feature/new-ui main");
  console.log("  gen-mr feature/login develop PROJ-123,PROJ-456");
  console.log("");
};

const main = async () => {
  // Handle help
  if (argv.help) {
    showUsage();
    process.exit(0);
  }

  // Extract positional arguments
  const sourceBranch = positionalArgs[0];
  const targetBranch = positionalArgs[1];
  const jiraTickets = positionalArgs[2] || "";

  // Check for required arguments
  if (!sourceBranch || !targetBranch) {
    console.log("❌ Error: Missing required arguments");
    console.log("💡 You need to provide source and target branches");
    showUsage();
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
