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
