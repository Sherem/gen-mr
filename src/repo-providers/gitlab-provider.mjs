// gitlab-provider.mjs
// GitLab repository provider implementation

/**
 * Create GitLab provider bound to provided configuration.
 * @param {object} cfg
 * @param {string} cfg.gitlabToken - GitLab token for authentication
 * @param {string} cfg.gitlabHost - GitLab host (default: gitlab.com)
 * @returns {{
 *   postToRemoteRepo: (url: string, data: object) => Promise<object>,
 *   getFromRemoteRepo: (url: string) => Promise<object>,
 *   patchAtRemoteRepo: (url: string, data: object) => Promise<object>,
 *   findExistingMergeRequest: (gitlabRepo: string, sourceBranch: string, targetBranch: string) => Promise<object|null>,
 *   createOrUpdateMergeRequest: (opts: { gitlabRepo: string, sourceBranch: string, targetBranch: string, title: string, description: string, existingMR?: object|null }) => Promise<object>
 * }}
 */
export const createGitlabProvider = ({ gitlabToken, gitlabHost = "gitlab.com" }) => {
    if (!gitlabToken) {
        throw new Error("Missing required gitlabToken for GitLab utils");
    }

    const commonHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gitlabToken}`,
    };

    const baseUrl = `https://${gitlabHost}/api/v4`;

    const postToRemoteRepo = async (url, data) => {
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

    const getFromRemoteRepo = async (url) => {
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

    const patchAtRemoteRepo = async (url, data) => {
        const response = await fetch(url, {
            method: "PUT",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const findExistingMergeRequest = async (gitlabRepo, sourceBranch, targetBranch) => {
        try {
            // Encode the repository path for URL
            const encodedRepo = encodeURIComponent(gitlabRepo);
            const mergeRequests = await getFromRemoteRepo(
                `${baseUrl}/projects/${encodedRepo}/merge_requests?state=opened&source_branch=${sourceBranch}&target_branch=${targetBranch}`
            );
            return mergeRequests.length > 0 ? mergeRequests[0] : null;
        } catch (error) {
            console.warn("Warning: Could not check for existing merge requests:", error.message);
            return null;
        }
    };

    const createOrUpdateMergeRequest = async ({
        gitlabRepo,
        sourceBranch,
        targetBranch,
        title,
        description,
        existingMR,
    }) => {
        try {
            const encodedRepo = encodeURIComponent(gitlabRepo);

            if (existingMR) {
                const res = await patchAtRemoteRepo(
                    `${baseUrl}/projects/${encodedRepo}/merge_requests/${existingMR.iid}`,
                    {
                        title,
                        description,
                    }
                );
                console.log("✅ Merge request updated:", res.web_url);
                return res;
            } else {
                const res = await postToRemoteRepo(
                    `${baseUrl}/projects/${encodedRepo}/merge_requests`,
                    {
                        source_branch: sourceBranch,
                        target_branch: targetBranch,
                        title,
                        description,
                    }
                );
                console.log("✅ Merge request created:", res.web_url);
                return res;
            }
        } catch (err) {
            const actionText = existingMR ? "update" : "create";
            console.error(`❌ Failed to ${actionText} merge request:`, err.message);
            throw err;
        }
    };

    return {
        postToRemoteRepo,
        getFromRemoteRepo,
        patchAtRemoteRepo,
        findExistingMergeRequest,
        createOrUpdateMergeRequest,
    };
};
