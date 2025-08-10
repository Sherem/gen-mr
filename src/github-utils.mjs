// github-utils.mjs
// GitHub API utilities for pull request operations

/**
 * POST request to GitHub API
 * @param {string} url - GitHub API endpoint URL
 * @param {object} data - Data to send in request body
 * @param {string} token - GitHub token for authentication
 * @returns {Promise<object>} Response JSON
 */
export const postToGithub = async (url, data, token) => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return response.json();
};

/**
 * GET request to GitHub API
 * @param {string} url - GitHub API endpoint URL
 * @param {string} token - GitHub token for authentication
 * @returns {Promise<object>} Response JSON
 */
export const getFromGithub = async (url, token) => {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
        },
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return response.json();
};

/**
 * PATCH request to GitHub API
 * @param {string} url - GitHub API endpoint URL
 * @param {object} data - Data to send in request body
 * @param {string} token - GitHub token for authentication
 * @returns {Promise<object>} Response JSON
 */
export const patchToGithub = async (url, data, token) => {
    const response = await fetch(url, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return response.json();
};

/**
 * Check if a pull request already exists for the given branches
 * @param {string} githubRepo - Repository in format "owner/repo"
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} githubToken - GitHub token
 * @returns {Promise<object|null>} Existing PR object or null if not found
 */
export const findExistingPullRequest = async (
    githubRepo,
    sourceBranch,
    targetBranch,
    githubToken
) => {
    try {
        const pulls = await getFromGithub(
            `https://api.github.com/repos/${githubRepo}/pulls?state=open&head=${sourceBranch}&base=${targetBranch}`,
            githubToken
        );
        return pulls.length > 0 ? pulls[0] : null;
    } catch (error) {
        console.warn("Warning: Could not check for existing pull requests:", error.message);
        return null;
    }
};

/**
 * Create or update a pull request on GitHub
 * @param {object} options - Options for creating/updating PR
 * @param {string} options.githubRepo - Repository in format "owner/repo"
 * @param {string} options.sourceBranch - Source branch name
 * @param {string} options.targetBranch - Target branch name
 * @param {string} options.title - PR title
 * @param {string} options.description - PR description/body
 * @param {string} options.githubToken - GitHub token
 * @param {object|null} options.existingPR - Existing PR object if updating
 * @returns {Promise<object>} Created or updated PR object
 */
export const createOrUpdatePullRequest = async ({
    githubRepo,
    sourceBranch,
    targetBranch,
    title,
    description,
    githubToken,
    existingPR,
}) => {
    try {
        if (existingPR) {
            // Update existing PR
            const res = await patchToGithub(
                `https://api.github.com/repos/${githubRepo}/pulls/${existingPR.number}`,
                {
                    title,
                    body: description,
                },
                githubToken
            );
            console.log("✅ Pull request updated:", res.html_url);
            return res;
        } else {
            // Create new PR
            const res = await postToGithub(
                `https://api.github.com/repos/${githubRepo}/pulls`,
                {
                    head: sourceBranch,
                    base: targetBranch,
                    title,
                    body: description,
                },
                githubToken
            );
            console.log("✅ Pull request created:", res.html_url);
            return res;
        }
    } catch (err) {
        const actionText = existingPR ? "update" : "create";
        console.error(`❌ Failed to ${actionText} pull request:`, err.message);
        throw err;
    }
};
