// utils/branch-format.mjs
// Helpers for displaying branch names consistently

/**
 * Format source branch for display. If remote differs, append " (remote/remoteBranch)".
 * @param {string} local - Local source branch name
 * @param {string|undefined} remoteName - Remote name (e.g., origin)
 * @param {string|undefined} remoteBranch - Remote-tracked branch name
 * @returns {string}
 */
export const formatSourceBranchDisplay = (local, remoteName, remoteBranch) => {
    if (remoteName && remoteBranch && remoteBranch !== local) {
        return `${local} (${remoteName}/${remoteBranch})`;
    }
    if (remoteName !== "origin") {
        return `${local} (${remoteName}/${local})`;
    }
    return String(local || "");
};
