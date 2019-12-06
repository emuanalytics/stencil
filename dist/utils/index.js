'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * Default style mode id
 */
const DEFAULT_STYLE_MODE = '$';
/**
 * Reusable empty obj/array
 * Don't add values to these!!
 */
const EMPTY_OBJ = {};
/**
 * Namespaces
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
/**
 * File names and value
 */
const BANNER = `Built with http://stenciljs.com`;
const COLLECTION_MANIFEST_FILE_NAME = 'collection-manifest.json';

const normalizePath = (str) => {
    // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
    // https://github.com/sindresorhus/slash MIT
    // By Sindre Sorhus
    if (typeof str !== 'string') {
        throw new Error(`invalid path to normalize`);
    }
    str = str.trim();
    if (EXTENDED_PATH_REGEX.test(str) || NON_ASCII_REGEX.test(str)) {
        return str;
    }
    str = str.replace(SLASH_REGEX, '/');
    // always remove the trailing /
    // this makes our file cache look ups consistent
    if (str.charAt(str.length - 1) === '/') {
        const colonIndex = str.indexOf(':');
        if (colonIndex > -1) {
            if (colonIndex < str.length - 2) {
                str = str.substring(0, str.length - 1);
            }
        }
        else if (str.length > 1) {
            str = str.substring(0, str.length - 1);
        }
    }
    return str;
};
const EXTENDED_PATH_REGEX = /^\\\\\?\\/;
const NON_ASCII_REGEX = /[^\x00-\x80]+/;
const SLASH_REGEX = /\\/g;

const isDef = (v) => v != null;
const toLowerCase = (str) => str.toLowerCase();
const toDashCase = (str) => toLowerCase(str.replace(/([A-Z0-9])/g, g => ' ' + g[0]).trim().replace(/ /g, '-'));
const dashToPascalCase = (str) => toLowerCase(str).split('-').map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
const toTitleCase = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const noop = () => { };
const isComplexType = (o) => {
    // https://jsperf.com/typeof-fn-object/5
    o = typeof o;
    return o === 'object' || o === 'function';
};
const sortBy = (array, prop) => {
    return array.slice().sort((a, b) => {
        const nameA = prop(a);
        const nameB = prop(b);
        if (nameA < nameB)
            return -1;
        if (nameA > nameB)
            return 1;
        return 0;
    });
};
const flatOne = (array) => {
    if (array.flat) {
        return array.flat(1);
    }
    return array.reduce((result, item) => {
        result.push(...item);
        return result;
    }, []);
};
const unique = (array, predicate = (i) => i) => {
    const set = new Set();
    return array.filter(item => {
        const key = predicate(item);
        if (key == null) {
            return true;
        }
        if (set.has(key)) {
            return false;
        }
        set.add(key);
        return true;
    });
};
const fromEntries = (entries) => {
    const object = {};
    for (const [key, value] of entries) {
        object[key] = value;
    }
    return object;
};
const relativeImport = (config, pathFrom, pathTo, ext, addPrefix = true) => {
    let relativePath = config.sys.path.relative(config.sys.path.dirname(pathFrom), config.sys.path.dirname(pathTo));
    if (addPrefix) {
        if (relativePath === '') {
            relativePath = '.';
        }
        else if (relativePath[0] !== '.') {
            relativePath = './' + relativePath;
        }
    }
    return normalizePath(`${relativePath}/${config.sys.path.basename(pathTo, ext)}`);
};
const pluck = (obj, keys) => {
    return keys.reduce((final, key) => {
        if (obj[key]) {
            final[key] = obj[key];
        }
        return final;
    }, {});
};
const isObject = (val) => {
    return val != null && typeof val === 'object' && Array.isArray(val) === false;
};

class InMemoryFileSystem {
    constructor(disk, path) {
        this.disk = disk;
        this.path = path;
        this.items = new Map();
    }
    async accessData(filePath) {
        const item = this.getItem(filePath);
        if (typeof item.exists === 'boolean') {
            return {
                exists: item.exists,
                isDirectory: item.isDirectory,
                isFile: item.isFile
            };
        }
        const data = {
            exists: false,
            isDirectory: false,
            isFile: false
        };
        try {
            const s = await this.stat(filePath);
            item.exists = true;
            item.isDirectory = s.isDirectory;
            item.isFile = s.isFile;
            data.exists = item.exists;
            data.isDirectory = item.isDirectory;
            data.isFile = item.isFile;
        }
        catch (e) {
            item.exists = false;
        }
        return data;
    }
    async access(filePath) {
        const data = await this.accessData(filePath);
        return data.exists;
    }
    /**
     * Synchronous!!! Do not use!!!
     * (Only typescript transpiling is allowed to use)
     * @param filePath
     */
    accessSync(filePath) {
        const item = this.getItem(filePath);
        if (typeof item.exists === 'boolean') {
            return item.exists;
        }
        let hasAccess = false;
        try {
            const s = this.statSync(filePath);
            item.exists = true;
            item.isDirectory = s.isDirectory;
            item.isFile = s.isFile;
            hasAccess = true;
        }
        catch (e) {
            item.exists = false;
        }
        return hasAccess;
    }
    async copyFile(src, dest) {
        const item = this.getItem(src);
        item.queueCopyFileToDest = dest;
    }
    async emptyDir(dirPath) {
        const item = this.getItem(dirPath);
        await this.removeDir(dirPath);
        item.isFile = false;
        item.isDirectory = true;
        item.queueWriteToDisk = true;
        item.queueDeleteFromDisk = false;
    }
    async readdir(dirPath, opts = {}) {
        dirPath = normalizePath(dirPath);
        const collectedPaths = [];
        if (opts.inMemoryOnly === true) {
            let inMemoryDir = dirPath;
            if (!inMemoryDir.endsWith('/')) {
                inMemoryDir += '/';
            }
            const inMemoryDirs = dirPath.split('/');
            this.items.forEach((d, filePath) => {
                if (!filePath.startsWith(dirPath)) {
                    return;
                }
                const parts = filePath.split('/');
                if (parts.length === inMemoryDirs.length + 1 || (opts.recursive && parts.length > inMemoryDirs.length)) {
                    if (d.exists) {
                        const item = {
                            absPath: filePath,
                            relPath: parts[inMemoryDirs.length],
                            isDirectory: d.isDirectory,
                            isFile: d.isFile
                        };
                        collectedPaths.push(item);
                    }
                }
            });
        }
        else {
            // always a disk read
            await this.readDirectory(dirPath, dirPath, opts, collectedPaths);
        }
        return collectedPaths.sort((a, b) => {
            if (a.absPath < b.absPath)
                return -1;
            if (a.absPath > b.absPath)
                return 1;
            return 0;
        });
    }
    async readDirectory(initPath, dirPath, opts, collectedPaths) {
        // used internally only so we could easily recursively drill down
        // loop through this directory and sub directories
        // always a disk read!!
        const dirItems = await this.disk.readdir(dirPath);
        // cache some facts about this path
        const item = this.getItem(dirPath);
        item.exists = true;
        item.isFile = false;
        item.isDirectory = true;
        await Promise.all(dirItems.map(async (dirItem) => {
            // let's loop through each of the files we've found so far
            // create an absolute path of the item inside of this directory
            const absPath = normalizePath(this.path.join(dirPath, dirItem));
            const relPath = normalizePath(this.path.relative(initPath, absPath));
            // get the fs stats for the item, could be either a file or directory
            const stats = await this.stat(absPath);
            // cache some stats about this path
            const subItem = this.getItem(absPath);
            subItem.exists = true;
            subItem.isDirectory = stats.isDirectory;
            subItem.isFile = stats.isFile;
            collectedPaths.push({
                absPath: absPath,
                relPath: relPath,
                isDirectory: stats.isDirectory,
                isFile: stats.isFile
            });
            if (opts.recursive === true && stats.isDirectory === true) {
                // looks like it's yet another directory
                // let's keep drilling down
                await this.readDirectory(initPath, absPath, opts, collectedPaths);
            }
        }));
    }
    async readFile(filePath, opts) {
        if (opts == null || (opts.useCache === true || opts.useCache === undefined)) {
            const item = this.getItem(filePath);
            if (item.exists && typeof item.fileText === 'string') {
                return item.fileText;
            }
        }
        const fileContent = await this.disk.readFile(filePath);
        const item = this.getItem(filePath);
        if (fileContent.length < MAX_TEXT_CACHE) {
            item.exists = true;
            item.isFile = true;
            item.isDirectory = false;
            item.fileText = fileContent;
        }
        return fileContent;
    }
    /**
     * Synchronous!!! Do not use!!!
     * (Only typescript transpiling is allowed to use)
     * @param filePath
     */
    readFileSync(filePath, opts) {
        if (opts == null || (opts.useCache === true || opts.useCache === undefined)) {
            const item = this.getItem(filePath);
            if (item.exists && typeof item.fileText === 'string') {
                return item.fileText;
            }
        }
        const fileContent = this.disk.readFileSync(filePath);
        const item = this.getItem(filePath);
        if (fileContent.length < MAX_TEXT_CACHE) {
            item.exists = true;
            item.isFile = true;
            item.isDirectory = false;
            item.fileText = fileContent;
        }
        return fileContent;
    }
    async remove(itemPath) {
        const stats = await this.stat(itemPath);
        if (stats.isDirectory === true) {
            await this.removeDir(itemPath);
        }
        else if (stats.isFile === true) {
            await this.removeItem(itemPath);
        }
    }
    async removeDir(dirPath) {
        const item = this.getItem(dirPath);
        item.isFile = false;
        item.isDirectory = true;
        if (!item.queueWriteToDisk) {
            item.queueDeleteFromDisk = true;
        }
        try {
            const dirItems = await this.readdir(dirPath, { recursive: true });
            await Promise.all(dirItems.map(item => this.removeItem(item.absPath)));
        }
        catch (e) {
            // do not throw error if the directory never existed
        }
    }
    async removeItem(filePath) {
        const item = this.getItem(filePath);
        if (!item.queueWriteToDisk) {
            item.queueDeleteFromDisk = true;
        }
    }
    async stat(itemPath) {
        const item = this.getItem(itemPath);
        if (typeof item.isDirectory !== 'boolean' || typeof item.isFile !== 'boolean') {
            const s = await this.disk.stat(itemPath);
            item.exists = true;
            item.isDirectory = s.isDirectory();
            item.isFile = s.isFile();
            item.size = s.size;
        }
        return {
            exists: !!item.exists,
            isFile: !!item.isFile,
            isDirectory: !!item.isDirectory,
            size: typeof item.size === 'number' ? item.size : 0
        };
    }
    /**
     * Synchronous!!! Do not use!!!
     * (Only typescript transpiling is allowed to use)
     * @param itemPath
     */
    statSync(itemPath) {
        const item = this.getItem(itemPath);
        if (typeof item.isDirectory !== 'boolean' || typeof item.isFile !== 'boolean') {
            const s = this.disk.statSync(itemPath);
            item.exists = true;
            item.isDirectory = s.isDirectory();
            item.isFile = s.isFile();
        }
        return {
            isFile: item.isFile,
            isDirectory: item.isDirectory
        };
    }
    async writeFile(filePath, content, opts) {
        if (typeof filePath !== 'string') {
            throw new Error(`writeFile, invalid filePath: ${filePath}`);
        }
        if (typeof content !== 'string') {
            throw new Error(`writeFile, invalid content: ${filePath}`);
        }
        const results = {
            ignored: false,
            changedContent: false,
            queuedWrite: false
        };
        if (shouldIgnore(filePath) === true) {
            results.ignored = true;
            return results;
        }
        const item = this.getItem(filePath);
        item.exists = true;
        item.isFile = true;
        item.isDirectory = false;
        item.queueDeleteFromDisk = false;
        results.changedContent = (item.fileText !== content);
        results.queuedWrite = false;
        item.fileText = content;
        if (opts != null && opts.useCache === false) {
            item.useCache = false;
        }
        if (opts != null && opts.inMemoryOnly === true) {
            // we don't want to actually write this to disk
            // just keep it in memory
            if (item.queueWriteToDisk) {
                // we already queued this file to write to disk
                // in that case we still need to do it
                results.queuedWrite = true;
            }
            else {
                // we only want this in memory and
                // it wasn't already queued to be written
                item.queueWriteToDisk = false;
            }
        }
        else if (opts != null && opts.immediateWrite === true) {
            // If this is an immediate write then write the file
            // and do not add it to the queue
            await this.ensureDir(filePath);
            await this.disk.writeFile(filePath, item.fileText);
        }
        else {
            // we want to write this to disk (eventually)
            // but only if the content is different
            // from our existing cached content
            if (!item.queueWriteToDisk && results.changedContent === true) {
                // not already queued to be written
                // and the content is different
                item.queueWriteToDisk = true;
                results.queuedWrite = true;
            }
        }
        return results;
    }
    writeFiles(files, opts) {
        return Promise.all(Object.keys(files).map(filePath => {
            return this.writeFile(filePath, files[filePath], opts);
        }));
    }
    async commit() {
        const instructions = getCommitInstructions(this.path, this.items);
        // ensure directories we need exist
        const dirsAdded = await this.commitEnsureDirs(instructions.dirsToEnsure);
        // write all queued the files
        const filesWritten = await this.commitWriteFiles(instructions.filesToWrite);
        // write all queued the files to copy
        const filesCopied = await this.commitCopyFiles(instructions.filesToCopy);
        // remove all the queued files to be deleted
        const filesDeleted = await this.commitDeleteFiles(instructions.filesToDelete);
        // remove all the queued dirs to be deleted
        const dirsDeleted = await this.commitDeleteDirs(instructions.dirsToDelete);
        instructions.filesToDelete.forEach(fileToDelete => {
            this.clearFileCache(fileToDelete);
        });
        instructions.dirsToDelete.forEach(dirToDelete => {
            this.clearDirCache(dirToDelete);
        });
        // return only the files that were
        return {
            filesCopied,
            filesWritten,
            filesDeleted,
            dirsDeleted,
            dirsAdded
        };
    }
    async ensureDir(p) {
        const allDirs = [];
        while (true) {
            p = this.path.dirname(p);
            if (typeof p === 'string' && p.length > 0 && p !== '/' && p.endsWith(':/') === false && p.endsWith(':\\') === false) {
                allDirs.push(p);
            }
            else {
                break;
            }
        }
        allDirs.reverse();
        await this.commitEnsureDirs(allDirs);
    }
    async commitEnsureDirs(dirsToEnsure) {
        const dirsAdded = [];
        for (const dirPath of dirsToEnsure) {
            const item = this.getItem(dirPath);
            if (item.exists === true && item.isDirectory === true) {
                // already cached that this path is indeed an existing directory
                continue;
            }
            try {
                // cache that we know this is a directory on disk
                item.exists = true;
                item.isDirectory = true;
                item.isFile = false;
                await this.disk.mkdir(dirPath);
                dirsAdded.push(dirPath);
            }
            catch (e) { }
        }
        return dirsAdded;
    }
    commitCopyFiles(filesToCopy) {
        const copiedFiles = Promise.all(filesToCopy.map(async (data) => {
            const src = data[0];
            const dest = data[1];
            await this.disk.copyFile(src, dest);
            return [src, dest];
        }));
        return copiedFiles;
    }
    commitWriteFiles(filesToWrite) {
        const writtenFiles = Promise.all(filesToWrite.map(async (filePath) => {
            if (typeof filePath !== 'string') {
                throw new Error(`unable to writeFile without filePath`);
            }
            return this.commitWriteFile(filePath);
        }));
        return writtenFiles;
    }
    async commitWriteFile(filePath) {
        const item = this.getItem(filePath);
        if (item.fileText == null) {
            throw new Error(`unable to find item fileText to write: ${filePath}`);
        }
        await this.disk.writeFile(filePath, item.fileText);
        if (item.useCache === false) {
            this.clearFileCache(filePath);
        }
        return filePath;
    }
    async commitDeleteFiles(filesToDelete) {
        const deletedFiles = await Promise.all(filesToDelete.map(async (filePath) => {
            if (typeof filePath !== 'string') {
                throw new Error(`unable to unlink without filePath`);
            }
            await this.disk.unlink(filePath);
            return filePath;
        }));
        return deletedFiles;
    }
    async commitDeleteDirs(dirsToDelete) {
        const dirsDeleted = [];
        for (const dirPath of dirsToDelete) {
            try {
                await this.disk.rmdir(dirPath);
            }
            catch (e) { }
            dirsDeleted.push(dirPath);
        }
        return dirsDeleted;
    }
    clearDirCache(dirPath) {
        dirPath = normalizePath(dirPath);
        this.items.forEach((_, f) => {
            const filePath = this.path.relative(dirPath, f).split('/')[0];
            if (!filePath.startsWith('.') && !filePath.startsWith('/')) {
                this.clearFileCache(f);
            }
        });
    }
    clearFileCache(filePath) {
        filePath = normalizePath(filePath);
        const item = this.items.get(filePath);
        if (item != null && !item.queueWriteToDisk) {
            this.items.delete(filePath);
        }
    }
    cancelDeleteFilesFromDisk(filePaths) {
        filePaths.forEach(filePath => {
            const item = this.getItem(filePath);
            if (item.isFile === true && item.queueDeleteFromDisk === true) {
                item.queueDeleteFromDisk = false;
            }
        });
    }
    cancelDeleteDirectoriesFromDisk(dirPaths) {
        dirPaths.forEach(dirPath => {
            const item = this.getItem(dirPath);
            if (item.queueDeleteFromDisk === true) {
                item.queueDeleteFromDisk = false;
            }
        });
    }
    getItem(itemPath) {
        itemPath = normalizePath(itemPath);
        let item = this.items.get(itemPath);
        if (item != null) {
            return item;
        }
        this.items.set(itemPath, item = {
            exists: null,
            fileText: null,
            size: null,
            mtimeMs: null,
            isDirectory: null,
            isFile: null,
            queueCopyFileToDest: null,
            queueDeleteFromDisk: null,
            queueWriteToDisk: null,
            useCache: null
        });
        return item;
    }
    clearCache() {
        this.items.clear();
    }
    get keys() {
        return Array.from(this.items.keys()).sort();
    }
    getMemoryStats() {
        return `data length: ${this.items.size}`;
    }
}
const getCommitInstructions = (path, d) => {
    const instructions = {
        filesToDelete: [],
        filesToWrite: [],
        filesToCopy: [],
        dirsToDelete: [],
        dirsToEnsure: []
    };
    d.forEach((item, itemPath) => {
        if (item.queueWriteToDisk === true) {
            if (item.isFile === true) {
                instructions.filesToWrite.push(itemPath);
                const dir = normalizePath(path.dirname(itemPath));
                if (!instructions.dirsToEnsure.includes(dir)) {
                    instructions.dirsToEnsure.push(dir);
                }
                const dirDeleteIndex = instructions.dirsToDelete.indexOf(dir);
                if (dirDeleteIndex > -1) {
                    instructions.dirsToDelete.splice(dirDeleteIndex, 1);
                }
                const fileDeleteIndex = instructions.filesToDelete.indexOf(itemPath);
                if (fileDeleteIndex > -1) {
                    instructions.filesToDelete.splice(fileDeleteIndex, 1);
                }
            }
            else if (item.isDirectory === true) {
                if (!instructions.dirsToEnsure.includes(itemPath)) {
                    instructions.dirsToEnsure.push(itemPath);
                }
                const dirDeleteIndex = instructions.dirsToDelete.indexOf(itemPath);
                if (dirDeleteIndex > -1) {
                    instructions.dirsToDelete.splice(dirDeleteIndex, 1);
                }
            }
        }
        else if (item.queueDeleteFromDisk === true) {
            if (item.isDirectory && !instructions.dirsToEnsure.includes(itemPath)) {
                instructions.dirsToDelete.push(itemPath);
            }
            else if (item.isFile && !instructions.filesToWrite.includes(itemPath)) {
                instructions.filesToDelete.push(itemPath);
            }
        }
        else if (typeof item.queueCopyFileToDest === 'string') {
            const src = itemPath;
            const dest = item.queueCopyFileToDest;
            instructions.filesToCopy.push([src, dest]);
            const dir = normalizePath(path.dirname(dest));
            if (!instructions.dirsToEnsure.includes(dir)) {
                instructions.dirsToEnsure.push(dir);
            }
            const dirDeleteIndex = instructions.dirsToDelete.indexOf(dir);
            if (dirDeleteIndex > -1) {
                instructions.dirsToDelete.splice(dirDeleteIndex, 1);
            }
            const fileDeleteIndex = instructions.filesToDelete.indexOf(dest);
            if (fileDeleteIndex > -1) {
                instructions.filesToDelete.splice(fileDeleteIndex, 1);
            }
        }
        item.queueDeleteFromDisk = false;
        item.queueWriteToDisk = false;
    });
    // add all the ancestor directories for each directory too
    for (let i = 0, ilen = instructions.dirsToEnsure.length; i < ilen; i++) {
        const segments = instructions.dirsToEnsure[i].split('/');
        for (let j = 2; j < segments.length; j++) {
            const dir = segments.slice(0, j).join('/');
            if (instructions.dirsToEnsure.includes(dir) === false) {
                instructions.dirsToEnsure.push(dir);
            }
        }
    }
    // sort directories so shortest paths are ensured first
    instructions.dirsToEnsure.sort((a, b) => {
        const segmentsA = a.split('/').length;
        const segmentsB = b.split('/').length;
        if (segmentsA < segmentsB)
            return -1;
        if (segmentsA > segmentsB)
            return 1;
        if (a.length < b.length)
            return -1;
        if (a.length > b.length)
            return 1;
        return 0;
    });
    // sort directories so longest paths are removed first
    instructions.dirsToDelete.sort((a, b) => {
        const segmentsA = a.split('/').length;
        const segmentsB = b.split('/').length;
        if (segmentsA < segmentsB)
            return 1;
        if (segmentsA > segmentsB)
            return -1;
        if (a.length < b.length)
            return 1;
        if (a.length > b.length)
            return -1;
        return 0;
    });
    instructions.dirsToEnsure.forEach(dirToEnsure => {
        const i = instructions.dirsToDelete.indexOf(dirToEnsure);
        if (i > -1) {
            instructions.dirsToDelete.splice(i, 1);
        }
    });
    instructions.dirsToDelete = instructions.dirsToDelete.filter(dir => {
        if (dir === '/' || dir.endsWith(':/') === true) {
            return false;
        }
        return true;
    });
    instructions.dirsToEnsure = instructions.dirsToEnsure.filter(dir => {
        const item = d.get(dir);
        if (item != null && item.exists === true && item.isDirectory === true) {
            return false;
        }
        if (dir === '/' || dir.endsWith(':/')) {
            return false;
        }
        return true;
    });
    return instructions;
};
const shouldIgnore = (filePath) => {
    filePath = filePath.trim().toLowerCase();
    return IGNORE.some(ignoreFile => filePath.endsWith(ignoreFile));
};
const isTextFile = (filePath) => {
    filePath = filePath.toLowerCase().trim();
    return TXT_EXT.some(ext => filePath.endsWith(ext));
};
const TXT_EXT = [
    '.ts', '.tsx', '.js', '.jsx', '.svg',
    '.html', '.txt', '.md', '.markdown', '.json',
    '.css', '.scss', '.sass', '.less', '.styl'
];
const IGNORE = [
    '.ds_store',
    '.gitignore',
    'desktop.ini',
    'thumbs.db'
];
// only cache if it's less than 5MB-ish (using .length as a rough guess)
// why 5MB? idk, seems like a good number for source text
// it's pretty darn large to cover almost ALL legitimate source files
// and anything larger is probably a REALLY large file and a rare case
// which we don't need to eat up memory for
const MAX_TEXT_CACHE = 5242880;

const normalizeDiagnostics = (compilerCtx, diagnostics) => {
    const normalizedErrors = [];
    const normalizedOthers = [];
    const dups = new Set();
    for (let i = 0; i < diagnostics.length; i++) {
        const d = normalizeDiagnostic(compilerCtx, diagnostics[i]);
        const key = d.absFilePath + d.code + d.messageText + d.type;
        if (dups.has(key)) {
            continue;
        }
        dups.add(key);
        const total = normalizedErrors.length + normalizedOthers.length;
        if (d.level === 'error') {
            normalizedErrors.push(d);
        }
        else if (total < MAX_ERRORS) {
            normalizedOthers.push(d);
        }
    }
    return [
        ...normalizedErrors,
        ...normalizedOthers
    ];
};
const normalizeDiagnostic = (compilerCtx, diagnostic) => {
    if (diagnostic.messageText) {
        if (typeof diagnostic.messageText.message === 'string') {
            diagnostic.messageText = diagnostic.messageText.message;
        }
        else if (typeof diagnostic.messageText === 'string' && diagnostic.messageText.indexOf('Error: ') === 0) {
            diagnostic.messageText = diagnostic.messageText.substr(7);
        }
    }
    if (diagnostic.messageText) {
        if (diagnostic.messageText.includes(`Cannot find name 'h'`)) {
            diagnostic.header = `Missing "h" import for JSX types`;
            diagnostic.messageText = `In order to load accurate JSX types for components, the "h" function must be imported from "@stencil/core" by each component using JSX. For example: import { Component, h } from '@stencil/core';`;
            try {
                const sourceText = compilerCtx.fs.readFileSync(diagnostic.absFilePath);
                const srcLines = splitLineBreaks(sourceText);
                for (let i = 0; i < srcLines.length; i++) {
                    const srcLine = srcLines[i];
                    if (srcLine.includes('@stencil/core')) {
                        const msgLines = [];
                        const beforeLineIndex = i - 1;
                        if (beforeLineIndex > -1) {
                            const beforeLine = {
                                lineIndex: beforeLineIndex,
                                lineNumber: beforeLineIndex + 1,
                                text: srcLines[beforeLineIndex],
                                errorCharStart: -1,
                                errorLength: -1
                            };
                            msgLines.push(beforeLine);
                        }
                        const errorLine = {
                            lineIndex: i,
                            lineNumber: i + 1,
                            text: srcLine,
                            errorCharStart: 0,
                            errorLength: -1
                        };
                        msgLines.push(errorLine);
                        diagnostic.lineNumber = errorLine.lineNumber;
                        diagnostic.columnNumber = srcLine.indexOf('}');
                        const afterLineIndex = i + 1;
                        if (afterLineIndex < srcLines.length) {
                            const afterLine = {
                                lineIndex: afterLineIndex,
                                lineNumber: afterLineIndex + 1,
                                text: srcLines[afterLineIndex],
                                errorCharStart: -1,
                                errorLength: -1
                            };
                            msgLines.push(afterLine);
                        }
                        diagnostic.lines = msgLines;
                        break;
                    }
                }
            }
            catch (e) { }
        }
    }
    return diagnostic;
};
const splitLineBreaks = (sourceText) => {
    if (typeof sourceText !== 'string')
        return [];
    sourceText = sourceText.replace(/\\r/g, '\n');
    return sourceText.split('\n');
};
const escapeHtml = (unsafe) => {
    if (unsafe === undefined)
        return 'undefined';
    if (unsafe === null)
        return 'null';
    if (typeof unsafe !== 'string') {
        unsafe = unsafe.toString();
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};
const MAX_ERRORS = 25;

function loadMinifyJsDiagnostics(sourceText, result, diagnostics) {
    if (!result || !result.error) {
        return;
    }
    const d = {
        level: 'error',
        type: 'build',
        language: 'javascript',
        header: 'Minify JS',
        code: '',
        messageText: result.error.message,
        absFilePath: null,
        relFilePath: null,
        lines: []
    };
    if (typeof result.error.line === 'number' && result.error.line > -1) {
        const srcLines = splitLineBreaks(sourceText);
        const errorLine = {
            lineIndex: result.error.line - 1,
            lineNumber: result.error.line,
            text: srcLines[result.error.line - 1],
            errorCharStart: result.error.col,
            errorLength: 0
        };
        d.lineNumber = errorLine.lineNumber;
        d.columnNumber = errorLine.errorCharStart;
        const highlightLine = errorLine.text.substr(d.columnNumber);
        for (let i = 0; i < highlightLine.length; i++) {
            if (CHAR_BREAK.includes(highlightLine.charAt(i))) {
                break;
            }
            errorLine.errorLength++;
        }
        d.lines.push(errorLine);
        if (errorLine.errorLength === 0 && errorLine.errorCharStart > 0) {
            errorLine.errorLength = 1;
            errorLine.errorCharStart--;
        }
        if (errorLine.lineIndex > 0) {
            const previousLine = {
                lineIndex: errorLine.lineIndex - 1,
                lineNumber: errorLine.lineNumber - 1,
                text: srcLines[errorLine.lineIndex - 1],
                errorCharStart: -1,
                errorLength: -1
            };
            d.lines.unshift(previousLine);
        }
        if (errorLine.lineIndex + 1 < srcLines.length) {
            const nextLine = {
                lineIndex: errorLine.lineIndex + 1,
                lineNumber: errorLine.lineNumber + 1,
                text: srcLines[errorLine.lineIndex + 1],
                errorCharStart: -1,
                errorLength: -1
            };
            d.lines.push(nextLine);
        }
    }
    diagnostics.push(d);
}
const CHAR_BREAK = [' ', '=', '.', ',', '?', ':', ';', '(', ')', '{', '}', '[', ']', '|', `'`, `"`, '`'];

const buildError = (diagnostics) => {
    const diagnostic = {
        level: 'error',
        type: 'build',
        header: 'Build Error',
        messageText: 'build error',
        relFilePath: null,
        absFilePath: null,
        lines: []
    };
    diagnostics.push(diagnostic);
    return diagnostic;
};
const buildWarn = (diagnostics) => {
    const diagnostic = {
        level: 'warn',
        type: 'build',
        header: 'Build Warn',
        messageText: 'build warn',
        relFilePath: null,
        absFilePath: null,
        lines: []
    };
    diagnostics.push(diagnostic);
    return diagnostic;
};
const buildJsonFileError = (compilerCtx, diagnostics, jsonFilePath, msg, pkgKey) => {
    const err = buildError(diagnostics);
    err.messageText = msg;
    err.absFilePath = jsonFilePath;
    if (typeof pkgKey === 'string') {
        try {
            const jsonStr = compilerCtx.fs.readFileSync(jsonFilePath);
            const lines = jsonStr.replace(/\r/g, '\n').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const txtLine = lines[i];
                const txtIndex = txtLine.indexOf(pkgKey);
                if (txtIndex > -1) {
                    const warnLine = {
                        lineIndex: i,
                        lineNumber: i + 1,
                        text: txtLine,
                        errorCharStart: txtIndex,
                        errorLength: pkgKey.length
                    };
                    err.lineNumber = warnLine.lineNumber;
                    err.columnNumber = txtIndex + 1;
                    err.lines.push(warnLine);
                    if (i >= 0) {
                        const beforeWarnLine = {
                            lineIndex: warnLine.lineIndex - 1,
                            lineNumber: warnLine.lineNumber - 1,
                            text: lines[i - 1],
                            errorCharStart: -1,
                            errorLength: -1
                        };
                        err.lines.unshift(beforeWarnLine);
                    }
                    if (i < lines.length) {
                        const afterWarnLine = {
                            lineIndex: warnLine.lineIndex + 1,
                            lineNumber: warnLine.lineNumber + 1,
                            text: lines[i + 1],
                            errorCharStart: -1,
                            errorLength: -1
                        };
                        err.lines.push(afterWarnLine);
                    }
                    break;
                }
            }
        }
        catch (e) { }
    }
    return err;
};
const catchError = (diagnostics, err, msg) => {
    const diagnostic = {
        level: 'error',
        type: 'build',
        header: 'Build Error',
        messageText: 'build error',
        relFilePath: null,
        absFilePath: null,
        lines: []
    };
    if (typeof msg === 'string') {
        diagnostic.messageText = msg;
    }
    else if (err != null) {
        if (err.stack != null) {
            diagnostic.messageText = err.stack.toString();
        }
        else {
            if (err.message != null) {
                diagnostic.messageText = err.message.toString();
            }
            else {
                diagnostic.messageText = err.toString();
            }
        }
    }
    if (diagnostics != null && !shouldIgnoreError(diagnostic.messageText)) {
        diagnostics.push(diagnostic);
    }
    return diagnostic;
};
const hasError = (diagnostics) => {
    if (diagnostics == null || diagnostics.length === 0) {
        return false;
    }
    return diagnostics.some(d => d.level === 'error' && d.type !== 'runtime');
};
const hasWarning = (diagnostics) => {
    if (diagnostics == null || diagnostics.length === 0) {
        return false;
    }
    return diagnostics.some(d => d.level === 'warn');
};
const shouldIgnoreError = (msg) => {
    return (msg === TASK_CANCELED_MSG);
};
const TASK_CANCELED_MSG = `task canceled`;

const loadRollupDiagnostics = (compilerCtx, buildCtx, rollupError) => {
    const diagnostic = {
        level: 'error',
        type: 'bundling',
        language: 'javascript',
        code: rollupError.code,
        header: `Rollup: ${formatErrorCode(rollupError.code)}`,
        messageText: rollupError.message || '',
        relFilePath: null,
        absFilePath: null,
        lines: []
    };
    if (rollupError.plugin) {
        diagnostic.messageText += ` (plugin: ${rollupError.plugin}${rollupError.hook ? `, ${rollupError.hook}` : ''})`;
    }
    if (rollupError.loc != null && typeof rollupError.loc.file === 'string') {
        diagnostic.absFilePath = rollupError.loc.file;
        try {
            const sourceText = compilerCtx.fs.readFileSync(diagnostic.absFilePath);
            try {
                const srcLines = splitLineBreaks(sourceText);
                const errorLine = {
                    lineIndex: rollupError.loc.line - 1,
                    lineNumber: rollupError.loc.line,
                    text: srcLines[rollupError.loc.line - 1],
                    errorCharStart: rollupError.loc.column,
                    errorLength: 0
                };
                diagnostic.lineNumber = errorLine.lineNumber;
                diagnostic.columnNumber = errorLine.errorCharStart;
                const highlightLine = errorLine.text.substr(rollupError.loc.column);
                for (let i = 0; i < highlightLine.length; i++) {
                    if (charBreak.has(highlightLine.charAt(i))) {
                        break;
                    }
                    errorLine.errorLength++;
                }
                diagnostic.lines.push(errorLine);
                if (errorLine.errorLength === 0 && errorLine.errorCharStart > 0) {
                    errorLine.errorLength = 1;
                    errorLine.errorCharStart--;
                }
                if (errorLine.lineIndex > 0) {
                    const previousLine = {
                        lineIndex: errorLine.lineIndex - 1,
                        lineNumber: errorLine.lineNumber - 1,
                        text: srcLines[errorLine.lineIndex - 1],
                        errorCharStart: -1,
                        errorLength: -1
                    };
                    diagnostic.lines.unshift(previousLine);
                }
                if (errorLine.lineIndex + 1 < srcLines.length) {
                    const nextLine = {
                        lineIndex: errorLine.lineIndex + 1,
                        lineNumber: errorLine.lineNumber + 1,
                        text: srcLines[errorLine.lineIndex + 1],
                        errorCharStart: -1,
                        errorLength: -1
                    };
                    diagnostic.lines.push(nextLine);
                }
            }
            catch (e) {
                diagnostic.messageText = `Error parsing: ${diagnostic.absFilePath}, line: ${rollupError.loc.line}, column: ${rollupError.loc.column}`;
                diagnostic.debugText = sourceText;
            }
        }
        catch (e) { }
    }
    buildCtx.diagnostics.push(diagnostic);
};
const createOnWarnFn = (diagnostics, bundleModulesFiles) => {
    const previousWarns = new Set();
    return function onWarningMessage(warning) {
        if (warning == null || ignoreWarnCodes.has(warning.code) || previousWarns.has(warning.message)) {
            return;
        }
        previousWarns.add(warning.message);
        let label = '';
        if (bundleModulesFiles) {
            label = bundleModulesFiles.reduce((cmps, m) => {
                cmps.push(...m.cmps);
                return cmps;
            }, []).join(', ').trim();
            if (label.length) {
                label += ': ';
            }
        }
        const diagnostic = buildWarn(diagnostics);
        diagnostic.header = `Bundling Warning ${warning.code}`;
        diagnostic.messageText = label + (warning.message || warning);
    };
};
const ignoreWarnCodes = new Set([
    'THIS_IS_UNDEFINED',
    'NON_EXISTENT_EXPORT',
    'CIRCULAR_DEPENDENCY',
    'EMPTY_BUNDLE',
    'UNUSED_EXTERNAL_IMPORT'
]);
const charBreak = new Set([' ', '=', '.', ',', '?', ':', ';', '(', ')', '{', '}', '[', ']', '|', `'`, `"`, '`']);
const formatErrorCode = (errorCode) => {
    if (typeof errorCode === 'string') {
        return errorCode.split('_').map(c => {
            return toTitleCase(c.toLowerCase());
        }).join(' ');
    }
    return errorCode || '';
};

const augmentDiagnosticWithNode = (config, d, node) => {
    if (!node) {
        return d;
    }
    const sourceFile = node.getSourceFile();
    if (!sourceFile) {
        return d;
    }
    d.absFilePath = normalizePath(sourceFile.fileName);
    d.relFilePath = normalizePath(config.sys.path.relative(config.rootDir, sourceFile.fileName));
    const sourceText = sourceFile.text;
    const srcLines = splitLineBreaks(sourceText);
    const start = node.getStart();
    const end = node.getEnd();
    const posStart = sourceFile.getLineAndCharacterOfPosition(start);
    const errorLine = {
        lineIndex: posStart.line,
        lineNumber: posStart.line + 1,
        text: srcLines[posStart.line],
        errorCharStart: posStart.character,
        errorLength: Math.max(end - start, 1)
    };
    d.lineNumber = errorLine.lineNumber;
    d.columnNumber = errorLine.errorCharStart + 1;
    d.lines.push(errorLine);
    if (errorLine.errorLength === 0 && errorLine.errorCharStart > 0) {
        errorLine.errorLength = 1;
        errorLine.errorCharStart--;
    }
    if (errorLine.lineIndex > 0) {
        const previousLine = {
            lineIndex: errorLine.lineIndex - 1,
            lineNumber: errorLine.lineNumber - 1,
            text: srcLines[errorLine.lineIndex - 1],
            errorCharStart: -1,
            errorLength: -1
        };
        d.lines.unshift(previousLine);
    }
    if (errorLine.lineIndex + 1 < srcLines.length) {
        const nextLine = {
            lineIndex: errorLine.lineIndex + 1,
            lineNumber: errorLine.lineNumber + 1,
            text: srcLines[errorLine.lineIndex + 1],
            errorCharStart: -1,
            errorLength: -1
        };
        d.lines.push(nextLine);
    }
    return d;
};
/**
 * Ok, so formatting overkill, we know. But whatever, it makes for great
 * error reporting within a terminal. So, yeah, let's code it up, shall we?
 */
const loadTypeScriptDiagnostics = (tsDiagnostics) => {
    const diagnostics = [];
    const maxErrors = Math.min(tsDiagnostics.length, 50);
    for (let i = 0; i < maxErrors; i++) {
        diagnostics.push(loadTypeScriptDiagnostic(tsDiagnostics[i]));
    }
    return diagnostics;
};
const loadTypeScriptDiagnostic = (tsDiagnostic) => {
    const d = {
        level: 'warn',
        type: 'typescript',
        language: 'typescript',
        header: 'TypeScript',
        code: tsDiagnostic.code.toString(),
        messageText: flattenDiagnosticMessageText(tsDiagnostic, tsDiagnostic.messageText),
        relFilePath: null,
        absFilePath: null,
        lines: []
    };
    if (tsDiagnostic.category === 1) {
        d.level = 'error';
    }
    if (tsDiagnostic.file) {
        d.absFilePath = tsDiagnostic.file.fileName;
        const sourceText = tsDiagnostic.file.text;
        const srcLines = splitLineBreaks(sourceText);
        const posData = tsDiagnostic.file.getLineAndCharacterOfPosition(tsDiagnostic.start);
        const errorLine = {
            lineIndex: posData.line,
            lineNumber: posData.line + 1,
            text: srcLines[posData.line],
            errorCharStart: posData.character,
            errorLength: Math.max(tsDiagnostic.length, 1)
        };
        d.lineNumber = errorLine.lineNumber;
        d.columnNumber = errorLine.errorCharStart + 1;
        d.lines.push(errorLine);
        if (errorLine.errorLength === 0 && errorLine.errorCharStart > 0) {
            errorLine.errorLength = 1;
            errorLine.errorCharStart--;
        }
        if (errorLine.lineIndex > 0) {
            const previousLine = {
                lineIndex: errorLine.lineIndex - 1,
                lineNumber: errorLine.lineNumber - 1,
                text: srcLines[errorLine.lineIndex - 1],
                errorCharStart: -1,
                errorLength: -1
            };
            d.lines.unshift(previousLine);
        }
        if (errorLine.lineIndex + 1 < srcLines.length) {
            const nextLine = {
                lineIndex: errorLine.lineIndex + 1,
                lineNumber: errorLine.lineNumber + 1,
                text: srcLines[errorLine.lineIndex + 1],
                errorCharStart: -1,
                errorLength: -1
            };
            d.lines.push(nextLine);
        }
    }
    return d;
};
const flattenDiagnosticMessageText = (tsDiagnostic, diag) => {
    if (typeof diag === 'string') {
        return diag;
    }
    else if (diag === undefined) {
        return '';
    }
    const ignoreCodes = [];
    const isStencilConfig = tsDiagnostic.file.fileName.includes('stencil.config');
    if (isStencilConfig) {
        ignoreCodes.push(2322);
    }
    let result = '';
    if (!ignoreCodes.includes(diag.code)) {
        result = diag.messageText;
        if (diag.next) {
            for (const kid of diag.next) {
                result += flattenDiagnosticMessageText(tsDiagnostic, kid);
            }
        }
    }
    if (isStencilConfig) {
        result = result.replace(`type 'StencilConfig'`, `Stencil Config`);
        result = result.replace(`Object literal may only specify known properties, but `, ``);
        result = result.replace(`Object literal may only specify known properties, and `, ``);
    }
    return result.trim();
};

const getFileExt = (fileName) => {
    if (typeof fileName === 'string') {
        const parts = fileName.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 1].toLowerCase();
        }
    }
    return null;
};
/**
 * Test if a file is a typescript source file, such as .ts or .tsx.
 * However, d.ts files and spec.ts files return false.
 * @param filePath
 */
const isTsFile = (filePath) => {
    const parts = filePath.toLowerCase().split('.');
    if (parts.length > 1) {
        if (parts[parts.length - 1] === 'ts' || parts[parts.length - 1] === 'tsx') {
            if (parts.length > 2 && (parts[parts.length - 2] === 'd' || parts[parts.length - 2] === 'spec')) {
                return false;
            }
            return true;
        }
    }
    return false;
};
const isDtsFile = (filePath) => {
    const parts = filePath.toLowerCase().split('.');
    if (parts.length > 2) {
        return (parts[parts.length - 2] === 'd' && parts[parts.length - 1] === 'ts');
    }
    return false;
};
const isJsFile = (filePath) => {
    const parts = filePath.toLowerCase().split('.');
    if (parts.length > 1) {
        if (parts[parts.length - 1] === 'js') {
            if (parts.length > 2 && parts[parts.length - 2] === 'spec') {
                return false;
            }
            return true;
        }
    }
    return false;
};
const hasFileExtension = (filePath, extensions) => {
    filePath = filePath.toLowerCase();
    return extensions.some(ext => filePath.endsWith('.' + ext));
};
const isCssFile = (filePath) => {
    return hasFileExtension(filePath, ['css']);
};
const isHtmlFile = (filePath) => {
    return hasFileExtension(filePath, ['html', 'htm']);
};
/**
 * Only web development text files, like ts, tsx,
 * js, html, css, scss, etc.
 * @param filePath
 */
const isWebDevFile = (filePath) => {
    return (hasFileExtension(filePath, WEB_DEV_EXT) || isTsFile(filePath));
};
const WEB_DEV_EXT = ['js', 'jsx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl', 'pcss'];
const generatePreamble = (config, opts = {}) => {
    let preamble = [];
    if (config.preamble) {
        preamble = config.preamble.split('\n');
    }
    if (typeof opts.prefix === 'string') {
        opts.prefix.split('\n').forEach(c => {
            preamble.push(c);
        });
    }
    if (opts.defaultBanner === true) {
        preamble.push(BANNER);
    }
    if (typeof opts.suffix === 'string') {
        opts.suffix.split('\n').forEach(c => {
            preamble.push(c);
        });
    }
    if (preamble.length > 1) {
        preamble = preamble.map(l => ` * ${l}`);
        preamble.unshift(`/*!`);
        preamble.push(` */`);
        return preamble.join('\n');
    }
    if (opts.defaultBanner === true) {
        return `/*! ${BANNER} */`;
    }
    return '';
};
const isDocsPublic = (jsDocs) => {
    return !(jsDocs && jsDocs.tags.some((s) => s.name === 'internal'));
};
const lineBreakRegex = /\r?\n|\r/g;
function getTextDocs(docs) {
    if (docs == null) {
        return '';
    }
    return `${docs.text.replace(lineBreakRegex, ' ')}
${docs.tags
        .filter(tag => tag.name !== 'internal')
        .map(tag => `@${tag.name} ${(tag.text || '').replace(lineBreakRegex, ' ')}`)
        .join('\n')}`.trim();
}
const getDependencies = (buildCtx) => {
    if (buildCtx.packageJson != null && buildCtx.packageJson.dependencies != null) {
        return Object.keys(buildCtx.packageJson.dependencies)
            .filter(pkgName => !SKIP_DEPS.includes(pkgName));
    }
    return [];
};
const hasDependency = (buildCtx, depName) => {
    return getDependencies(buildCtx).includes(depName);
};
const getDynamicImportFunction = (namespace) => {
    return `__sc_import_${namespace.replace(/\s|-/g, '_')}`;
};
const readPackageJson = async (config, compilerCtx, buildCtx) => {
    const pkgJsonPath = config.sys.path.join(config.rootDir, 'package.json');
    let pkgJson;
    try {
        pkgJson = await compilerCtx.fs.readFile(pkgJsonPath);
    }
    catch (e) {
        if (!config.outputTargets.some(o => o.type.includes('dist'))) {
            const diagnostic = buildError(buildCtx.diagnostics);
            diagnostic.header = `Missing "package.json"`;
            diagnostic.messageText = `Valid "package.json" file is required for distribution: ${pkgJsonPath}`;
        }
        return null;
    }
    let pkgData;
    try {
        pkgData = JSON.parse(pkgJson);
    }
    catch (e) {
        const diagnostic = buildError(buildCtx.diagnostics);
        diagnostic.header = `Error parsing "package.json"`;
        diagnostic.messageText = `${pkgJsonPath}, ${e}`;
        diagnostic.absFilePath = pkgJsonPath;
        return null;
    }
    buildCtx.packageJsonFilePath = pkgJsonPath;
    return pkgData;
};
const SKIP_DEPS = ['@stencil/core'];

const validateComponentTag = (tag) => {
    if (tag !== tag.trim()) {
        return `Tag can not contain white spaces`;
    }
    if (tag !== tag.toLowerCase()) {
        return `Tag can not contain upper case characters`;
    }
    if (typeof tag !== 'string') {
        return `Tag "${tag}" must be a string type`;
    }
    if (tag.length === 0) {
        return `Received empty tag value`;
    }
    if (tag.indexOf(' ') > -1) {
        return `"${tag}" tag cannot contain a space`;
    }
    if (tag.indexOf(',') > -1) {
        return `"${tag}" tag cannot be used for multiple tags`;
    }
    const invalidChars = tag.replace(/\w|-/g, '');
    if (invalidChars !== '') {
        return `"${tag}" tag contains invalid characters: ${invalidChars}`;
    }
    if (tag.indexOf('-') === -1) {
        return `"${tag}" tag must contain a dash (-) to work as a valid web component`;
    }
    if (tag.indexOf('--') > -1) {
        return `"${tag}" tag cannot contain multiple dashes (--) next to each other`;
    }
    if (tag.indexOf('-') === 0) {
        return `"${tag}" tag cannot start with a dash (-)`;
    }
    if (tag.lastIndexOf('-') === tag.length - 1) {
        return `"${tag}" tag cannot end with a dash (-)`;
    }
    return undefined;
};

exports.BANNER = BANNER;
exports.COLLECTION_MANIFEST_FILE_NAME = COLLECTION_MANIFEST_FILE_NAME;
exports.DEFAULT_STYLE_MODE = DEFAULT_STYLE_MODE;
exports.EMPTY_OBJ = EMPTY_OBJ;
exports.HTML_NS = HTML_NS;
exports.InMemoryFileSystem = InMemoryFileSystem;
exports.MAX_ERRORS = MAX_ERRORS;
exports.SVG_NS = SVG_NS;
exports.TASK_CANCELED_MSG = TASK_CANCELED_MSG;
exports.XLINK_NS = XLINK_NS;
exports.XML_NS = XML_NS;
exports.augmentDiagnosticWithNode = augmentDiagnosticWithNode;
exports.buildError = buildError;
exports.buildJsonFileError = buildJsonFileError;
exports.buildWarn = buildWarn;
exports.catchError = catchError;
exports.createOnWarnFn = createOnWarnFn;
exports.dashToPascalCase = dashToPascalCase;
exports.escapeHtml = escapeHtml;
exports.flatOne = flatOne;
exports.fromEntries = fromEntries;
exports.generatePreamble = generatePreamble;
exports.getCommitInstructions = getCommitInstructions;
exports.getDependencies = getDependencies;
exports.getDynamicImportFunction = getDynamicImportFunction;
exports.getFileExt = getFileExt;
exports.getTextDocs = getTextDocs;
exports.hasDependency = hasDependency;
exports.hasError = hasError;
exports.hasFileExtension = hasFileExtension;
exports.hasWarning = hasWarning;
exports.isComplexType = isComplexType;
exports.isCssFile = isCssFile;
exports.isDef = isDef;
exports.isDocsPublic = isDocsPublic;
exports.isDtsFile = isDtsFile;
exports.isHtmlFile = isHtmlFile;
exports.isJsFile = isJsFile;
exports.isObject = isObject;
exports.isTextFile = isTextFile;
exports.isTsFile = isTsFile;
exports.isWebDevFile = isWebDevFile;
exports.loadMinifyJsDiagnostics = loadMinifyJsDiagnostics;
exports.loadRollupDiagnostics = loadRollupDiagnostics;
exports.loadTypeScriptDiagnostic = loadTypeScriptDiagnostic;
exports.loadTypeScriptDiagnostics = loadTypeScriptDiagnostics;
exports.noop = noop;
exports.normalizeDiagnostics = normalizeDiagnostics;
exports.normalizePath = normalizePath;
exports.pluck = pluck;
exports.readPackageJson = readPackageJson;
exports.relativeImport = relativeImport;
exports.shouldIgnore = shouldIgnore;
exports.shouldIgnoreError = shouldIgnoreError;
exports.sortBy = sortBy;
exports.splitLineBreaks = splitLineBreaks;
exports.toDashCase = toDashCase;
exports.toLowerCase = toLowerCase;
exports.toTitleCase = toTitleCase;
exports.unique = unique;
exports.validateComponentTag = validateComponentTag;
