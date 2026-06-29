const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');

const ignoredDirs = new Set([
    '.git',
    'dist',
    'node_modules',
]);

const ignoredFiles = new Set([
    path.join(root, '.env'),
]);

const tokenPatterns = [
    /github_pat_[A-Za-z0-9_]+/g,
    /ghp_[A-Za-z0-9_]+/g,
    /gho_[A-Za-z0-9_]+/g,
    /ghu_[A-Za-z0-9_]+/g,
    /ghs_[A-Za-z0-9_]+/g,
    /ghr_[A-Za-z0-9_]+/g,
];

const shouldRead = (filePath) => {
    if (ignoredFiles.has(filePath)) {
        return false;
    }

    const ext = path.extname(filePath);
    return [
        '',
        '.env',
        '.example',
        '.js',
        '.json',
        '.md',
        '.sql',
        '.ts',
        '.tsx',
        '.yml',
        '.yaml',
    ].includes(ext) || path.basename(filePath).startsWith('.env');
};

const walk = (dir, files = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoredDirs.has(entry.name)) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, files);
        } else if (entry.isFile() && shouldRead(fullPath)) {
            files.push(fullPath);
        }
    }

    return files;
};

const findings = [];

for (const filePath of walk(repoRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(repoRoot, filePath);

    for (const pattern of tokenPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
            findings.push(`${relPath}: contains a GitHub token-looking value`);
        }
    }

    if (path.basename(filePath) === '.env.example') {
        const tokenLine = content.split(/\r?\n/).find((line) => line.startsWith('GITHUB_STORAGE_TOKEN='));
        const value = tokenLine?.slice('GITHUB_STORAGE_TOKEN='.length).trim();
        if (value) {
            findings.push(`${relPath}: GITHUB_STORAGE_TOKEN must stay empty in examples`);
        }
    }
}

if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exit(1);
}

console.log('No GitHub token-looking values found outside ignored local env files.');
