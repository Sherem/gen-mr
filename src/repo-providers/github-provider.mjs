// github-provider.mjs
// GitHub repository provider implementation (previously github-utils.mjs)

/**
 * Create GitHub provider bound to provided configuration.
 * @param {object} cfg
 * @param {string} cfg.githubToken - GitHub token for authentication
 * @returns {{
 *   postToGithub: (url: string, data: object) => Promise<object>,
 *   getFromGithub: (url: string) => Promise<object>,
 *   patchToGithub: (url: string, data: object) => Promise<object>,
 *   findExistingPullRequest: (githubRepo: string, sourceBranch: string, targetBranch: string) => Promise<object|null>,
 *   createOrUpdatePullRequest: (opts: { githubRepo: string, sourceBranch: string, targetBranch: string, title: string, description: string, existingPR?: object|null }) => Promise<object>
 * }}
 */
export const createGithubProvider = ({ githubToken }) => {
    if (!githubToken) {
        throw new Error("Missing required githubToken for GitHub utils");
    }

    const commonHeaders = {
        "Content-Type": "application/json",
        Authorization: `token ${githubToken}`,
    };

    const postToGithub = async (url, data) => {
        const response = await fetch(url, {
            method: "POST",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const getFromGithub = async (url) => {
        const response = await fetch(url, {
            method: "GET",
            headers: commonHeaders,
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const patchToGithub = async (url, data) => {
        const response = await fetch(url, {
            method: "PATCH",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const findExistingPullRequest = async (githubRepo, sourceBranch, targetBranch) => {
        try {
            const pulls = await getFromGithub(
                `https://api.github.com/repos/${githubRepo}/pulls?state=open&head=${sourceBranch}&base=${targetBranch}`
            );
            return pulls.length > 0 ? pulls[0] : null;
        } catch (error) {
            console.warn("Warning: Could not check for existing pull requests:", error.message);
            return null;
        }
    };

    const createOrUpdatePullRequest = async ({
        githubRepo,
        sourceBranch,
        targetBranch,
        title,
        description,
        existingPR,
    }) => {
        try {
            if (existingPR) {
                const res = await patchToGithub(
                    `https://api.github.com/repos/${githubRepo}/pulls/${existingPR.number}`,
                    {
                        title,
                        body: description,
                    }
                );
                console.log("✅ Pull request updated:", res.html_url);
                return res;
            } else {
                const res = await postToGithub(`https://api.github.com/repos/${githubRepo}/pulls`, {
                    head: sourceBranch,
                    base: targetBranch,
                    title,
                    body: description,
                });
                console.log("✅ Pull request created:", res.html_url);
                return res;
            }
        } catch (err) {
            const actionText = existingPR ? "update" : "create";
            console.error(`❌ Failed to ${actionText} pull request:`, err.message);
            throw err;
        }
    };

    return {
        postToGithub,
        getFromGithub,
        patchToGithub,
        findExistingPullRequest,
        createOrUpdatePullRequest,
    };
};
