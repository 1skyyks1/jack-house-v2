const fs = require('fs/promises');

const cleanupFiles = async (files) => {
    await Promise.all(files.map(async (file) => {
        if (!file?.path) return;
        try {
            await fs.unlink(file.path);
        } catch (error) {
            if (error?.code !== 'ENOENT') console.error(`Failed to remove AI image temp file ${file.path}:`, error);
        }
    }));
};

const cleanupStaleFiles = async (directory, maxAgeMs = 60 * 60 * 1000) => {
    let names;
    try {
        names = await fs.readdir(directory);
    } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
    }

    const cutoff = Date.now() - maxAgeMs;
    await Promise.all(names.map(async (name) => {
        const path = `${directory}/${name}`;
        try {
            const stat = await fs.stat(path);
            if (stat.isFile() && stat.mtimeMs < cutoff) await fs.unlink(path);
        } catch (error) {
            if (error?.code !== 'ENOENT') console.error(`Failed to clean stale AI image temp file ${path}:`, error);
        }
    }));
};

module.exports = {
    cleanupFiles,
    cleanupStaleFiles,
};
