// test-modules.mjs
// Quick test to verify our new modules load correctly

import { getGitDiff, validateGitContext } from "./src/git-utils.mjs";
import { generateMergeRequestWithChatGPT } from "./src/ai/chatgpt.mjs";
import { generateMergeRequest } from "./src/merge-request-generator.mjs";

console.log("✅ All modules loaded successfully!");
console.log("Git utils functions:", ["getGitDiff", "validateGitContext"]);
console.log("ChatGPT functions:", ["generateMergeRequestWithChatGPT"]);
console.log("Merge request generator functions:", ["generateMergeRequest"]);
console.log("\n🎉 The modular architecture is working correctly!");
