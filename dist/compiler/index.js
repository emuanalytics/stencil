'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var ts$1 = require('typescript');
var ts$1__default = _interopDefault(ts$1);
var readline = _interopDefault(require('readline'));

/* tslint:disable */
/*!
Object.entries
*/
// @ts-ignore
Object.entries || (Object.entries = function (c) { for (var b = Object.keys(c), a = b.length, d = Array(a); a--;)
    d[a] = [b[a], c[b[a]]]; return d; });
/*!
Object.values
*/
// @ts-ignore
Object.values || (Object.values = function (n) { return Object.keys(n).map(function (r) { return n[r]; }); });

/**
 * Default style mode id
 */
const DEFAULT_STYLE_MODE = '$';
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

const toLowerCase = (str) => str.toLowerCase();
const toDashCase = (str) => toLowerCase(str.replace(/([A-Z0-9])/g, g => ' ' + g[0]).trim().replace(/ /g, '-'));
const dashToPascalCase = (str) => toLowerCase(str).split('-').map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
const toTitleCase = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const noop = () => { };
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
const isDtsFile = (filePath) => {
    const parts = filePath.toLowerCase().split('.');
    if (parts.length > 2) {
        return (parts[parts.length - 2] === 'd' && parts[parts.length - 1] === 'ts');
    }
    return false;
};
const hasFileExtension = (filePath, extensions) => {
    filePath = filePath.toLowerCase();
    return extensions.some(ext => filePath.endsWith('.' + ext));
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

/**
 * A new BuildCtx object is created for every build
 * and rebuild.
 */
class BuildContext {
    constructor(config, compilerCtx) {
        this.buildId = -1;
        this.buildMessages = [];
        this.buildResults = null;
        this.bundleBuildCount = 0;
        this.collections = [];
        this.completedTasks = [];
        this.components = [];
        this.componentGraph = new Map();
        this.data = {};
        this.diagnostics = [];
        this.dirsAdded = [];
        this.dirsDeleted = [];
        this.entryModules = [];
        this.filesAdded = [];
        this.filesChanged = [];
        this.filesDeleted = [];
        this.filesUpdated = [];
        this.filesWritten = [];
        this.globalStyle = undefined;
        this.hasConfigChanges = false;
        this.hasFinished = false;
        this.hasHtmlChanges = false;
        this.hasPrintedResults = false;
        this.hasServiceWorkerChanges = false;
        this.hasScriptChanges = true;
        this.hasStyleChanges = true;
        this.hydrateAppFilePath = null;
        this.indexBuildCount = 0;
        this.indexDoc = undefined;
        this.isRebuild = false;
        this.moduleFiles = [];
        this.packageJson = {};
        this.packageJsonFilePath = null;
        this.pendingCopyTasks = [];
        this.requiresFullBuild = true;
        this.scriptsAdded = [];
        this.scriptsDeleted = [];
        this.startTime = Date.now();
        this.styleBuildCount = 0;
        this.stylesPromise = null;
        this.stylesUpdated = [];
        this.timeSpan = null;
        this.transpileBuildCount = 0;
        this.config = config;
        this.compilerCtx = compilerCtx;
        this.buildId = ++this.compilerCtx.activeBuildId;
    }
    start() {
        // get the build id from the incremented activeBuildId
        // print out a good message
        const msg = `${this.isRebuild ? 'rebuild' : 'build'}, ${this.config.fsNamespace}, ${this.config.devMode ? 'dev' : 'prod'} mode, started`;
        const buildLog = {
            buildId: this.buildId,
            messages: [],
            progress: 0
        };
        this.compilerCtx.events.emit('buildLog', buildLog);
        // create a timespan for this build
        this.timeSpan = this.createTimeSpan(msg);
        // create a build timestamp for this build
        this.timestamp = getBuildTimestamp();
        // debug log our new build
        this.debug(`start build, ${this.timestamp}`);
    }
    createTimeSpan(msg, debug) {
        if (!this.hasFinished || debug) {
            if (debug) {
                if (this.config.watch) {
                    msg = `${this.config.logger.cyan('[' + this.buildId + ']')} ${msg}`;
                }
            }
            const timeSpan = this.config.logger.createTimeSpan(msg, debug, this.buildMessages);
            if (!debug && this.compilerCtx.events) {
                const buildLog = {
                    buildId: this.buildId,
                    messages: this.buildMessages,
                    progress: getProgress(this.completedTasks)
                };
                this.compilerCtx.events.emit('buildLog', buildLog);
            }
            return {
                duration: () => {
                    return timeSpan.duration();
                },
                finish: (finishedMsg, color, bold, newLineSuffix) => {
                    if (!this.hasFinished || debug) {
                        if (debug) {
                            if (this.config.watch) {
                                finishedMsg = `${this.config.logger.cyan('[' + this.buildId + ']')} ${finishedMsg}`;
                            }
                        }
                        timeSpan.finish(finishedMsg, color, bold, newLineSuffix);
                        if (!debug) {
                            const buildLog = {
                                buildId: this.buildId,
                                messages: this.buildMessages.slice(),
                                progress: getProgress(this.completedTasks)
                            };
                            this.compilerCtx.events.emit('buildLog', buildLog);
                        }
                    }
                    return timeSpan.duration();
                }
            };
        }
        return {
            duration() { return 0; },
            finish() { return 0; }
        };
    }
    debug(msg) {
        if (this.config.watch) {
            this.config.logger.debug(`${this.config.logger.cyan('[' + this.buildId + ']')} ${msg}`);
        }
        else {
            this.config.logger.debug(msg);
        }
    }
    get hasError() {
        return hasError(this.diagnostics);
    }
    get hasWarning() {
        return hasWarning(this.diagnostics);
    }
    progress(t) {
        this.completedTasks.push(t);
    }
    async validateTypesBuild() {
        if (this.hasError) {
            // no need to wait on this one since
            // we already aborted this build
            return;
        }
        if (!this.validateTypesPromise) {
            // there is no pending validate types promise
            // so it probably already finished
            // so no need to wait on anything
            return;
        }
        if (!this.config.watch) {
            // this is not a watch build, so we need to make
            // sure that the type validation has finished
            this.debug(`build, non-watch, waiting on validateTypes`);
            await this.validateTypesPromise;
            this.debug(`build, non-watch, finished waiting on validateTypes`);
        }
    }
}
const getBuildTimestamp = () => {
    const d = new Date();
    // YYYY-MM-DDThh:mm:ss
    let timestamp = d.getUTCFullYear() + '-';
    timestamp += ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-';
    timestamp += ('0' + d.getUTCDate()).slice(-2) + 'T';
    timestamp += ('0' + d.getUTCHours()).slice(-2) + ':';
    timestamp += ('0' + d.getUTCMinutes()).slice(-2) + ':';
    timestamp += ('0' + d.getUTCSeconds()).slice(-2);
    return timestamp;
};
const getProgress = (completedTasks) => {
    let progressIndex = 0;
    const taskKeys = Object.keys(ProgressTask);
    taskKeys.forEach((taskKey, index) => {
        if (completedTasks.includes(ProgressTask[taskKey])) {
            progressIndex = index;
        }
    });
    return (progressIndex + 1) / taskKeys.length;
};
const ProgressTask = {
    emptyOutputTargets: {},
    transpileApp: {},
    generateStyles: {},
    generateOutputTargets: {},
    validateTypesBuild: {},
    writeBuildFiles: {},
};

class Cache {
    constructor(config, cacheFs) {
        this.config = config;
        this.cacheFs = cacheFs;
        this.failed = 0;
        this.skip = false;
        this.sys = config.sys;
        this.path = config.sys.path;
        this.logger = config.logger;
    }
    async initCacheDir() {
        if (this.config._isTesting) {
            return;
        }
        if (!this.config.enableCache) {
            this.config.logger.info(`cache optimizations disabled`);
            this.clearDiskCache();
            return;
        }
        this.config.logger.debug(`cache enabled, cacheDir: ${this.config.cacheDir}`);
        try {
            const readmeFilePath = this.path.join(this.config.cacheDir, '_README.log');
            await this.cacheFs.writeFile(readmeFilePath, CACHE_DIR_README);
        }
        catch (e) {
            this.logger.error(`Cache, initCacheDir: ${e}`);
            this.config.enableCache = false;
        }
    }
    async get(key) {
        if (!this.config.enableCache || this.skip) {
            return null;
        }
        if (this.failed >= MAX_FAILED) {
            if (!this.skip) {
                this.skip = true;
                this.logger.debug(`cache had ${this.failed} failed ops, skip disk ops for remander of build`);
            }
            return null;
        }
        let result;
        try {
            result = await this.cacheFs.readFile(this.getCacheFilePath(key));
            this.failed = 0;
            this.skip = false;
        }
        catch (e) {
            this.failed++;
            result = null;
        }
        return result;
    }
    async put(key, value) {
        if (!this.config.enableCache) {
            return false;
        }
        let result;
        try {
            await this.cacheFs.writeFile(this.getCacheFilePath(key), value);
            result = true;
        }
        catch (e) {
            this.failed++;
            result = false;
        }
        return result;
    }
    async has(key) {
        const val = await this.get(key);
        return (typeof val === 'string');
    }
    async createKey(domain, ...args) {
        if (!this.config.enableCache) {
            return domain + (Math.random() * 9999999);
        }
        const hash = await this.sys.generateContentHash(JSON.stringify(args), 32);
        return domain + '_' + hash;
    }
    async commit() {
        if (this.config.enableCache) {
            this.skip = false;
            this.failed = 0;
            await this.cacheFs.commit();
            await this.clearExpiredCache();
        }
    }
    clear() {
        if (this.cacheFs != null) {
            this.cacheFs.clearCache();
        }
    }
    async clearExpiredCache() {
        if (this.cacheFs == null || this.sys.storage == null) {
            return;
        }
        const now = Date.now();
        const lastClear = await this.sys.storage.get(EXP_STORAGE_KEY);
        if (lastClear != null) {
            const diff = now - lastClear;
            if (diff < ONE_DAY) {
                return;
            }
            const fs = this.cacheFs.disk;
            const cachedFileNames = await fs.readdir(this.config.cacheDir);
            const cachedFilePaths = cachedFileNames.map(f => this.path.join(this.config.cacheDir, f));
            let totalCleared = 0;
            const promises = cachedFilePaths.map(async (filePath) => {
                const stat = await fs.stat(filePath);
                const lastModified = stat.mtime.getTime();
                const diff = now - lastModified;
                if (diff > ONE_WEEK) {
                    await fs.unlink(filePath);
                    totalCleared++;
                }
            });
            await Promise.all(promises);
            this.logger.debug(`clearExpiredCache, cachedFileNames: ${cachedFileNames.length}, totalCleared: ${totalCleared}`);
        }
        this.logger.debug(`clearExpiredCache, set last clear`);
        await this.sys.storage.set(EXP_STORAGE_KEY, now);
    }
    async clearDiskCache() {
        if (this.cacheFs != null) {
            const hasAccess = await this.cacheFs.access(this.config.cacheDir);
            if (hasAccess) {
                await this.cacheFs.remove(this.config.cacheDir);
                await this.cacheFs.commit();
            }
        }
    }
    getCacheFilePath(key) {
        return this.path.join(this.config.cacheDir, key) + '.log';
    }
    getMemoryStats() {
        if (this.cacheFs != null) {
            return this.cacheFs.getMemoryStats();
        }
        return null;
    }
}
const MAX_FAILED = 100;
const ONE_DAY = 1000 * 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const EXP_STORAGE_KEY = `last_clear_expired_cache`;
const CACHE_DIR_README = `# Stencil Cache Directory

This directory contains files which the compiler has
cached for faster builds. To disable caching, please set
"enableCache: false" within the stencil config.

To change the cache directory, please update the
"cacheDir" property within the stencil config.
`;

/*!
 * is-extglob <https://github.com/jonschlinkert/is-extglob>
 *
 * Copyright (c) 2014-2016, Jon Schlinkert.
 * Licensed under the MIT License.
 */

var isExtglob = function isExtglob(str) {
  if (typeof str !== 'string' || str === '') {
    return false;
  }

  var match;
  while ((match = /(\\).|([@?!+*]\(.*\))/g.exec(str))) {
    if (match[2]) return true;
    str = str.slice(match.index + match[0].length);
  }

  return false;
};

/*!
 * is-glob <https://github.com/jonschlinkert/is-glob>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */


var chars = { '{': '}', '(': ')', '[': ']'};
var strictRegex = /\\(.)|(^!|\*|[\].+)]\?|\[[^\\\]]+\]|\{[^\\}]+\}|\(\?[:!=][^\\)]+\)|\([^|]+\|[^\\)]+\))/;
var relaxedRegex = /\\(.)|(^!|[*?{}()[\]]|\(\?)/;

var isGlob = function isGlob(str, options) {
  if (typeof str !== 'string' || str === '') {
    return false;
  }

  if (isExtglob(str)) {
    return true;
  }

  var regex = strictRegex;
  var match;

  // optionally relax regex
  if (options && options.strict === false) {
    regex = relaxedRegex;
  }

  while ((match = regex.exec(str))) {
    if (match[2]) return true;
    var idx = match.index + match[0].length;

    // if an open bracket/brace/paren is escaped,
    // set the index to the next closing character
    var open = match[1];
    var close = open ? chars[open] : null;
    if (open && close) {
      var n = str.indexOf(close, idx);
      if (n !== -1) {
        idx = n + 1;
      }
    }

    str = str.slice(idx);
  }
  return false;
};

var concatMap = function (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        var x = fn(xs[i], i);
        if (isArray(x)) res.push.apply(res, x);
        else res.push(x);
    }
    return res;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var balancedMatch = balanced;
function balanced(a, b, str) {
  if (a instanceof RegExp) a = maybeMatch(a, str);
  if (b instanceof RegExp) b = maybeMatch(b, str);

  var r = range(a, b, str);

  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + a.length, r[1]),
    post: str.slice(r[1] + b.length)
  };
}

function maybeMatch(reg, str) {
  var m = str.match(reg);
  return m ? m[0] : null;
}

balanced.range = range;
function range(a, b, str) {
  var begs, beg, left, right, result;
  var ai = str.indexOf(a);
  var bi = str.indexOf(b, ai + 1);
  var i = ai;

  if (ai >= 0 && bi > 0) {
    begs = [];
    left = str.length;

    while (i >= 0 && !result) {
      if (i == ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length == 1) {
        result = [ begs.pop(), bi ];
      } else {
        beg = begs.pop();
        if (beg < left) {
          left = beg;
          right = bi;
        }

        bi = str.indexOf(b, i + 1);
      }

      i = ai < bi && ai >= 0 ? ai : bi;
    }

    if (begs.length) {
      result = [ left, right ];
    }
  }

  return result;
}

var braceExpansion = expandTop;

var escSlash = '\0SLASH'+Math.random()+'\0';
var escOpen = '\0OPEN'+Math.random()+'\0';
var escClose = '\0CLOSE'+Math.random()+'\0';
var escComma = '\0COMMA'+Math.random()+'\0';
var escPeriod = '\0PERIOD'+Math.random()+'\0';

function numeric(str) {
  return parseInt(str, 10) == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

function escapeBraces(str) {
  return str.split('\\\\').join(escSlash)
            .split('\\{').join(escOpen)
            .split('\\}').join(escClose)
            .split('\\,').join(escComma)
            .split('\\.').join(escPeriod);
}

function unescapeBraces(str) {
  return str.split(escSlash).join('\\')
            .split(escOpen).join('{')
            .split(escClose).join('}')
            .split(escComma).join(',')
            .split(escPeriod).join('.');
}


// Basically just str.split(","), but handling cases
// where we have nested braced sections, which should be
// treated as individual members, like {a,{b,c},d}
function parseCommaParts(str) {
  if (!str)
    return [''];

  var parts = [];
  var m = balancedMatch('{', '}', str);

  if (!m)
    return str.split(',');

  var pre = m.pre;
  var body = m.body;
  var post = m.post;
  var p = pre.split(',');

  p[p.length-1] += '{' + body + '}';
  var postParts = parseCommaParts(post);
  if (post.length) {
    p[p.length-1] += postParts.shift();
    p.push.apply(p, postParts);
  }

  parts.push.apply(parts, p);

  return parts;
}

function expandTop(str) {
  if (!str)
    return [];

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.substr(0, 2) === '{}') {
    str = '\\{\\}' + str.substr(2);
  }

  return expand(escapeBraces(str), true).map(unescapeBraces);
}

function embrace(str) {
  return '{' + str + '}';
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}

function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}

function expand(str, isTop) {
  var expansions = [];

  var m = balancedMatch('{', '}', str);
  if (!m || /\$$/.test(m.pre)) return [str];

  var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
  var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
  var isSequence = isNumericSequence || isAlphaSequence;
  var isOptions = m.body.indexOf(',') >= 0;
  if (!isSequence && !isOptions) {
    // {a},b}
    if (m.post.match(/,.*\}/)) {
      str = m.pre + '{' + m.body + escClose + m.post;
      return expand(str);
    }
    return [str];
  }

  var n;
  if (isSequence) {
    n = m.body.split(/\.\./);
  } else {
    n = parseCommaParts(m.body);
    if (n.length === 1) {
      // x{{a,b}}y ==> x{a}y x{b}y
      n = expand(n[0], false).map(embrace);
      if (n.length === 1) {
        var post = m.post.length
          ? expand(m.post, false)
          : [''];
        return post.map(function(p) {
          return m.pre + n[0] + p;
        });
      }
    }
  }

  // at this point, n is the parts, and we know it's not a comma set
  // with a single entry.

  // no need to expand pre, since it is guaranteed to be free of brace-sets
  var pre = m.pre;
  var post = m.post.length
    ? expand(m.post, false)
    : [''];

  var N;

  if (isSequence) {
    var x = numeric(n[0]);
    var y = numeric(n[1]);
    var width = Math.max(n[0].length, n[1].length);
    var incr = n.length == 3
      ? Math.abs(numeric(n[2]))
      : 1;
    var test = lte;
    var reverse = y < x;
    if (reverse) {
      incr *= -1;
      test = gte;
    }
    var pad = n.some(isPadded);

    N = [];

    for (var i = x; test(i, y); i += incr) {
      var c;
      if (isAlphaSequence) {
        c = String.fromCharCode(i);
        if (c === '\\')
          c = '';
      } else {
        c = String(i);
        if (pad) {
          var need = width - c.length;
          if (need > 0) {
            var z = new Array(need + 1).join('0');
            if (i < 0)
              c = '-' + z + c.slice(1);
            else
              c = z + c;
          }
        }
      }
      N.push(c);
    }
  } else {
    N = concatMap(n, function(el) { return expand(el, false) });
  }

  for (var j = 0; j < N.length; j++) {
    for (var k = 0; k < post.length; k++) {
      var expansion = pre + N[j] + post[k];
      if (!isTop || isSequence || expansion)
        expansions.push(expansion);
    }
  }

  return expansions;
}

var minimatch_1 = minimatch;
minimatch.Minimatch = Minimatch;

var path = { sep: '/' };
try {
  path = require('path');
} catch (er) {}

var GLOBSTAR = minimatch.GLOBSTAR = Minimatch.GLOBSTAR = {};


var plTypes = {
  '!': { open: '(?:(?!(?:', close: '))[^/]*?)'},
  '?': { open: '(?:', close: ')?' },
  '+': { open: '(?:', close: ')+' },
  '*': { open: '(?:', close: ')*' },
  '@': { open: '(?:', close: ')' }
};

// any single thing other than /
// don't need to escape / when using new RegExp()
var qmark = '[^/]';

// * => any number of characters
var star = qmark + '*?';

// ** when dots are allowed.  Anything goes, except .. and .
// not (^ or / followed by one or two dots followed by $ or /),
// followed by anything, any number of times.
var twoStarDot = '(?:(?!(?:\\\/|^)(?:\\.{1,2})($|\\\/)).)*?';

// not a ^ or / followed by a dot,
// followed by anything, any number of times.
var twoStarNoDot = '(?:(?!(?:\\\/|^)\\.).)*?';

// characters that need to be escaped in RegExp.
var reSpecials = charSet('().*{}+?[]^$\\!');

// "abc" -> { a:true, b:true, c:true }
function charSet (s) {
  return s.split('').reduce(function (set, c) {
    set[c] = true;
    return set
  }, {})
}

// normalizes slashes.
var slashSplit = /\/+/;

minimatch.filter = filter;
function filter (pattern, options) {
  options = options || {};
  return function (p, i, list) {
    return minimatch(p, pattern, options)
  }
}

function ext (a, b) {
  a = a || {};
  b = b || {};
  var t = {};
  Object.keys(b).forEach(function (k) {
    t[k] = b[k];
  });
  Object.keys(a).forEach(function (k) {
    t[k] = a[k];
  });
  return t
}

minimatch.defaults = function (def) {
  if (!def || !Object.keys(def).length) return minimatch

  var orig = minimatch;

  var m = function minimatch (p, pattern, options) {
    return orig.minimatch(p, pattern, ext(def, options))
  };

  m.Minimatch = function Minimatch (pattern, options) {
    return new orig.Minimatch(pattern, ext(def, options))
  };

  return m
};

Minimatch.defaults = function (def) {
  if (!def || !Object.keys(def).length) return Minimatch
  return minimatch.defaults(def).Minimatch
};

function minimatch (p, pattern, options) {
  if (typeof pattern !== 'string') {
    throw new TypeError('glob pattern string required')
  }

  if (!options) options = {};

  // shortcut: comments match nothing.
  if (!options.nocomment && pattern.charAt(0) === '#') {
    return false
  }

  // "" only matches ""
  if (pattern.trim() === '') return p === ''

  return new Minimatch(pattern, options).match(p)
}

function Minimatch (pattern, options) {
  if (!(this instanceof Minimatch)) {
    return new Minimatch(pattern, options)
  }

  if (typeof pattern !== 'string') {
    throw new TypeError('glob pattern string required')
  }

  if (!options) options = {};
  pattern = pattern.trim();

  // windows support: need to use /, not \
  if (path.sep !== '/') {
    pattern = pattern.split(path.sep).join('/');
  }

  this.options = options;
  this.set = [];
  this.pattern = pattern;
  this.regexp = null;
  this.negate = false;
  this.comment = false;
  this.empty = false;

  // make the set of regexps etc.
  this.make();
}

Minimatch.prototype.debug = function () {};

Minimatch.prototype.make = make;
function make () {
  // don't do it more than once.
  if (this._made) return

  var pattern = this.pattern;
  var options = this.options;

  // empty patterns and comments match nothing.
  if (!options.nocomment && pattern.charAt(0) === '#') {
    this.comment = true;
    return
  }
  if (!pattern) {
    this.empty = true;
    return
  }

  // step 1: figure out negation, etc.
  this.parseNegate();

  // step 2: expand braces
  var set = this.globSet = this.braceExpand();

  if (options.debug) this.debug = console.error;

  this.debug(this.pattern, set);

  // step 3: now we have a set, so turn each one into a series of path-portion
  // matching patterns.
  // These will be regexps, except in the case of "**", which is
  // set to the GLOBSTAR object for globstar behavior,
  // and will not contain any / characters
  set = this.globParts = set.map(function (s) {
    return s.split(slashSplit)
  });

  this.debug(this.pattern, set);

  // glob --> regexps
  set = set.map(function (s, si, set) {
    return s.map(this.parse, this)
  }, this);

  this.debug(this.pattern, set);

  // filter out everything that didn't compile properly.
  set = set.filter(function (s) {
    return s.indexOf(false) === -1
  });

  this.debug(this.pattern, set);

  this.set = set;
}

Minimatch.prototype.parseNegate = parseNegate;
function parseNegate () {
  var pattern = this.pattern;
  var negate = false;
  var options = this.options;
  var negateOffset = 0;

  if (options.nonegate) return

  for (var i = 0, l = pattern.length
    ; i < l && pattern.charAt(i) === '!'
    ; i++) {
    negate = !negate;
    negateOffset++;
  }

  if (negateOffset) this.pattern = pattern.substr(negateOffset);
  this.negate = negate;
}

// Brace expansion:
// a{b,c}d -> abd acd
// a{b,}c -> abc ac
// a{0..3}d -> a0d a1d a2d a3d
// a{b,c{d,e}f}g -> abg acdfg acefg
// a{b,c}d{e,f}g -> abdeg acdeg abdeg abdfg
//
// Invalid sets are not expanded.
// a{2..}b -> a{2..}b
// a{b}c -> a{b}c
minimatch.braceExpand = function (pattern, options) {
  return braceExpand(pattern, options)
};

Minimatch.prototype.braceExpand = braceExpand;

function braceExpand (pattern, options) {
  if (!options) {
    if (this instanceof Minimatch) {
      options = this.options;
    } else {
      options = {};
    }
  }

  pattern = typeof pattern === 'undefined'
    ? this.pattern : pattern;

  if (typeof pattern === 'undefined') {
    throw new TypeError('undefined pattern')
  }

  if (options.nobrace ||
    !pattern.match(/\{.*\}/)) {
    // shortcut. no need to expand.
    return [pattern]
  }

  return braceExpansion(pattern)
}

// parse a component of the expanded set.
// At this point, no pattern may contain "/" in it
// so we're going to return a 2d array, where each entry is the full
// pattern, split on '/', and then turned into a regular expression.
// A regexp is made at the end which joins each array with an
// escaped /, and another full one which joins each regexp with |.
//
// Following the lead of Bash 4.1, note that "**" only has special meaning
// when it is the *only* thing in a path portion.  Otherwise, any series
// of * is equivalent to a single *.  Globstar behavior is enabled by
// default, and can be disabled by setting options.noglobstar.
Minimatch.prototype.parse = parse;
var SUBPARSE = {};
function parse (pattern, isSub) {
  if (pattern.length > 1024 * 64) {
    throw new TypeError('pattern is too long')
  }

  var options = this.options;

  // shortcuts
  if (!options.noglobstar && pattern === '**') return GLOBSTAR
  if (pattern === '') return ''

  var re = '';
  var hasMagic = !!options.nocase;
  var escaping = false;
  // ? => one single character
  var patternListStack = [];
  var negativeLists = [];
  var stateChar;
  var inClass = false;
  var reClassStart = -1;
  var classStart = -1;
  // . and .. never match anything that doesn't start with .,
  // even when options.dot is set.
  var patternStart = pattern.charAt(0) === '.' ? '' // anything
  // not (start or / followed by . or .. followed by / or end)
  : options.dot ? '(?!(?:^|\\\/)\\.{1,2}(?:$|\\\/))'
  : '(?!\\.)';
  var self = this;

  function clearStateChar () {
    if (stateChar) {
      // we had some state-tracking character
      // that wasn't consumed by this pass.
      switch (stateChar) {
        case '*':
          re += star;
          hasMagic = true;
        break
        case '?':
          re += qmark;
          hasMagic = true;
        break
        default:
          re += '\\' + stateChar;
        break
      }
      self.debug('clearStateChar %j %j', stateChar, re);
      stateChar = false;
    }
  }

  for (var i = 0, len = pattern.length, c
    ; (i < len) && (c = pattern.charAt(i))
    ; i++) {
    this.debug('%s\t%s %s %j', pattern, i, re, c);

    // skip over any that are escaped.
    if (escaping && reSpecials[c]) {
      re += '\\' + c;
      escaping = false;
      continue
    }

    switch (c) {
      case '/':
        // completely not allowed, even escaped.
        // Should already be path-split by now.
        return false

      case '\\':
        clearStateChar();
        escaping = true;
      continue

      // the various stateChar values
      // for the "extglob" stuff.
      case '?':
      case '*':
      case '+':
      case '@':
      case '!':
        this.debug('%s\t%s %s %j <-- stateChar', pattern, i, re, c);

        // all of those are literals inside a class, except that
        // the glob [!a] means [^a] in regexp
        if (inClass) {
          this.debug('  in class');
          if (c === '!' && i === classStart + 1) c = '^';
          re += c;
          continue
        }

        // if we already have a stateChar, then it means
        // that there was something like ** or +? in there.
        // Handle the stateChar, then proceed with this one.
        self.debug('call clearStateChar %j', stateChar);
        clearStateChar();
        stateChar = c;
        // if extglob is disabled, then +(asdf|foo) isn't a thing.
        // just clear the statechar *now*, rather than even diving into
        // the patternList stuff.
        if (options.noext) clearStateChar();
      continue

      case '(':
        if (inClass) {
          re += '(';
          continue
        }

        if (!stateChar) {
          re += '\\(';
          continue
        }

        patternListStack.push({
          type: stateChar,
          start: i - 1,
          reStart: re.length,
          open: plTypes[stateChar].open,
          close: plTypes[stateChar].close
        });
        // negation is (?:(?!js)[^/]*)
        re += stateChar === '!' ? '(?:(?!(?:' : '(?:';
        this.debug('plType %j %j', stateChar, re);
        stateChar = false;
      continue

      case ')':
        if (inClass || !patternListStack.length) {
          re += '\\)';
          continue
        }

        clearStateChar();
        hasMagic = true;
        var pl = patternListStack.pop();
        // negation is (?:(?!js)[^/]*)
        // The others are (?:<pattern>)<type>
        re += pl.close;
        if (pl.type === '!') {
          negativeLists.push(pl);
        }
        pl.reEnd = re.length;
      continue

      case '|':
        if (inClass || !patternListStack.length || escaping) {
          re += '\\|';
          escaping = false;
          continue
        }

        clearStateChar();
        re += '|';
      continue

      // these are mostly the same in regexp and glob
      case '[':
        // swallow any state-tracking char before the [
        clearStateChar();

        if (inClass) {
          re += '\\' + c;
          continue
        }

        inClass = true;
        classStart = i;
        reClassStart = re.length;
        re += c;
      continue

      case ']':
        //  a right bracket shall lose its special
        //  meaning and represent itself in
        //  a bracket expression if it occurs
        //  first in the list.  -- POSIX.2 2.8.3.2
        if (i === classStart + 1 || !inClass) {
          re += '\\' + c;
          escaping = false;
          continue
        }

        // handle the case where we left a class open.
        // "[z-a]" is valid, equivalent to "\[z-a\]"
        if (inClass) {
          // split where the last [ was, make sure we don't have
          // an invalid re. if so, re-walk the contents of the
          // would-be class to re-translate any characters that
          // were passed through as-is
          // TODO: It would probably be faster to determine this
          // without a try/catch and a new RegExp, but it's tricky
          // to do safely.  For now, this is safe and works.
          var cs = pattern.substring(classStart + 1, i);
          try {
            RegExp('[' + cs + ']');
          } catch (er) {
            // not a valid class!
            var sp = this.parse(cs, SUBPARSE);
            re = re.substr(0, reClassStart) + '\\[' + sp[0] + '\\]';
            hasMagic = hasMagic || sp[1];
            inClass = false;
            continue
          }
        }

        // finish up the class.
        hasMagic = true;
        inClass = false;
        re += c;
      continue

      default:
        // swallow any state char that wasn't consumed
        clearStateChar();

        if (escaping) {
          // no need
          escaping = false;
        } else if (reSpecials[c]
          && !(c === '^' && inClass)) {
          re += '\\';
        }

        re += c;

    } // switch
  } // for

  // handle the case where we left a class open.
  // "[abc" is valid, equivalent to "\[abc"
  if (inClass) {
    // split where the last [ was, and escape it
    // this is a huge pita.  We now have to re-walk
    // the contents of the would-be class to re-translate
    // any characters that were passed through as-is
    cs = pattern.substr(classStart + 1);
    sp = this.parse(cs, SUBPARSE);
    re = re.substr(0, reClassStart) + '\\[' + sp[0];
    hasMagic = hasMagic || sp[1];
  }

  // handle the case where we had a +( thing at the *end*
  // of the pattern.
  // each pattern list stack adds 3 chars, and we need to go through
  // and escape any | chars that were passed through as-is for the regexp.
  // Go through and escape them, taking care not to double-escape any
  // | chars that were already escaped.
  for (pl = patternListStack.pop(); pl; pl = patternListStack.pop()) {
    var tail = re.slice(pl.reStart + pl.open.length);
    this.debug('setting tail', re, pl);
    // maybe some even number of \, then maybe 1 \, followed by a |
    tail = tail.replace(/((?:\\{2}){0,64})(\\?)\|/g, function (_, $1, $2) {
      if (!$2) {
        // the | isn't already escaped, so escape it.
        $2 = '\\';
      }

      // need to escape all those slashes *again*, without escaping the
      // one that we need for escaping the | character.  As it works out,
      // escaping an even number of slashes can be done by simply repeating
      // it exactly after itself.  That's why this trick works.
      //
      // I am sorry that you have to see this.
      return $1 + $1 + $2 + '|'
    });

    this.debug('tail=%j\n   %s', tail, tail, pl, re);
    var t = pl.type === '*' ? star
      : pl.type === '?' ? qmark
      : '\\' + pl.type;

    hasMagic = true;
    re = re.slice(0, pl.reStart) + t + '\\(' + tail;
  }

  // handle trailing things that only matter at the very end.
  clearStateChar();
  if (escaping) {
    // trailing \\
    re += '\\\\';
  }

  // only need to apply the nodot start if the re starts with
  // something that could conceivably capture a dot
  var addPatternStart = false;
  switch (re.charAt(0)) {
    case '.':
    case '[':
    case '(': addPatternStart = true;
  }

  // Hack to work around lack of negative lookbehind in JS
  // A pattern like: *.!(x).!(y|z) needs to ensure that a name
  // like 'a.xyz.yz' doesn't match.  So, the first negative
  // lookahead, has to look ALL the way ahead, to the end of
  // the pattern.
  for (var n = negativeLists.length - 1; n > -1; n--) {
    var nl = negativeLists[n];

    var nlBefore = re.slice(0, nl.reStart);
    var nlFirst = re.slice(nl.reStart, nl.reEnd - 8);
    var nlLast = re.slice(nl.reEnd - 8, nl.reEnd);
    var nlAfter = re.slice(nl.reEnd);

    nlLast += nlAfter;

    // Handle nested stuff like *(*.js|!(*.json)), where open parens
    // mean that we should *not* include the ) in the bit that is considered
    // "after" the negated section.
    var openParensBefore = nlBefore.split('(').length - 1;
    var cleanAfter = nlAfter;
    for (i = 0; i < openParensBefore; i++) {
      cleanAfter = cleanAfter.replace(/\)[+*?]?/, '');
    }
    nlAfter = cleanAfter;

    var dollar = '';
    if (nlAfter === '' && isSub !== SUBPARSE) {
      dollar = '$';
    }
    var newRe = nlBefore + nlFirst + nlAfter + dollar + nlLast;
    re = newRe;
  }

  // if the re is not "" at this point, then we need to make sure
  // it doesn't match against an empty path part.
  // Otherwise a/* will match a/, which it should not.
  if (re !== '' && hasMagic) {
    re = '(?=.)' + re;
  }

  if (addPatternStart) {
    re = patternStart + re;
  }

  // parsing just a piece of a larger pattern.
  if (isSub === SUBPARSE) {
    return [re, hasMagic]
  }

  // skip the regexp for non-magical patterns
  // unescape anything in it, though, so that it'll be
  // an exact match against a file etc.
  if (!hasMagic) {
    return globUnescape(pattern)
  }

  var flags = options.nocase ? 'i' : '';
  try {
    var regExp = new RegExp('^' + re + '$', flags);
  } catch (er) {
    // If it was an invalid regular expression, then it can't match
    // anything.  This trick looks for a character after the end of
    // the string, which is of course impossible, except in multi-line
    // mode, but it's not a /m regex.
    return new RegExp('$.')
  }

  regExp._glob = pattern;
  regExp._src = re;

  return regExp
}

minimatch.makeRe = function (pattern, options) {
  return new Minimatch(pattern, options || {}).makeRe()
};

Minimatch.prototype.makeRe = makeRe;
function makeRe () {
  if (this.regexp || this.regexp === false) return this.regexp

  // at this point, this.set is a 2d array of partial
  // pattern strings, or "**".
  //
  // It's better to use .match().  This function shouldn't
  // be used, really, but it's pretty convenient sometimes,
  // when you just want to work with a regex.
  var set = this.set;

  if (!set.length) {
    this.regexp = false;
    return this.regexp
  }
  var options = this.options;

  var twoStar = options.noglobstar ? star
    : options.dot ? twoStarDot
    : twoStarNoDot;
  var flags = options.nocase ? 'i' : '';

  var re = set.map(function (pattern) {
    return pattern.map(function (p) {
      return (p === GLOBSTAR) ? twoStar
      : (typeof p === 'string') ? regExpEscape(p)
      : p._src
    }).join('\\\/')
  }).join('|');

  // must match entire pattern
  // ending in a * or ** will make it less strict.
  re = '^(?:' + re + ')$';

  // can match anything, as long as it's not this.
  if (this.negate) re = '^(?!' + re + ').*$';

  try {
    this.regexp = new RegExp(re, flags);
  } catch (ex) {
    this.regexp = false;
  }
  return this.regexp
}

minimatch.match = function (list, pattern, options) {
  options = options || {};
  var mm = new Minimatch(pattern, options);
  list = list.filter(function (f) {
    return mm.match(f)
  });
  if (mm.options.nonull && !list.length) {
    list.push(pattern);
  }
  return list
};

Minimatch.prototype.match = match;
function match (f, partial) {
  this.debug('match', f, this.pattern);
  // short-circuit in the case of busted things.
  // comments, etc.
  if (this.comment) return false
  if (this.empty) return f === ''

  if (f === '/' && partial) return true

  var options = this.options;

  // windows: need to use /, not \
  if (path.sep !== '/') {
    f = f.split(path.sep).join('/');
  }

  // treat the test path as a set of pathparts.
  f = f.split(slashSplit);
  this.debug(this.pattern, 'split', f);

  // just ONE of the pattern sets in this.set needs to match
  // in order for it to be valid.  If negating, then just one
  // match means that we have failed.
  // Either way, return on the first hit.

  var set = this.set;
  this.debug(this.pattern, 'set', set);

  // Find the basename of the path by looking for the last non-empty segment
  var filename;
  var i;
  for (i = f.length - 1; i >= 0; i--) {
    filename = f[i];
    if (filename) break
  }

  for (i = 0; i < set.length; i++) {
    var pattern = set[i];
    var file = f;
    if (options.matchBase && pattern.length === 1) {
      file = [filename];
    }
    var hit = this.matchOne(file, pattern, partial);
    if (hit) {
      if (options.flipNegate) return true
      return !this.negate
    }
  }

  // didn't get any hits.  this is success if it's a negative
  // pattern, failure otherwise.
  if (options.flipNegate) return false
  return this.negate
}

// set partial to true to test if, for example,
// "/a/b" matches the start of "/*/b/*/d"
// Partial means, if you run out of file before you run
// out of pattern, then that's fine, as long as all
// the parts match.
Minimatch.prototype.matchOne = function (file, pattern, partial) {
  var options = this.options;

  this.debug('matchOne',
    { 'this': this, file: file, pattern: pattern });

  this.debug('matchOne', file.length, pattern.length);

  for (var fi = 0,
      pi = 0,
      fl = file.length,
      pl = pattern.length
      ; (fi < fl) && (pi < pl)
      ; fi++, pi++) {
    this.debug('matchOne loop');
    var p = pattern[pi];
    var f = file[fi];

    this.debug(pattern, p, f);

    // should be impossible.
    // some invalid regexp stuff in the set.
    if (p === false) return false

    if (p === GLOBSTAR) {
      this.debug('GLOBSTAR', [pattern, p, f]);

      // "**"
      // a/**/b/**/c would match the following:
      // a/b/x/y/z/c
      // a/x/y/z/b/c
      // a/b/x/b/x/c
      // a/b/c
      // To do this, take the rest of the pattern after
      // the **, and see if it would match the file remainder.
      // If so, return success.
      // If not, the ** "swallows" a segment, and try again.
      // This is recursively awful.
      //
      // a/**/b/**/c matching a/b/x/y/z/c
      // - a matches a
      // - doublestar
      //   - matchOne(b/x/y/z/c, b/**/c)
      //     - b matches b
      //     - doublestar
      //       - matchOne(x/y/z/c, c) -> no
      //       - matchOne(y/z/c, c) -> no
      //       - matchOne(z/c, c) -> no
      //       - matchOne(c, c) yes, hit
      var fr = fi;
      var pr = pi + 1;
      if (pr === pl) {
        this.debug('** at the end');
        // a ** at the end will just swallow the rest.
        // We have found a match.
        // however, it will not swallow /.x, unless
        // options.dot is set.
        // . and .. are *never* matched by **, for explosively
        // exponential reasons.
        for (; fi < fl; fi++) {
          if (file[fi] === '.' || file[fi] === '..' ||
            (!options.dot && file[fi].charAt(0) === '.')) return false
        }
        return true
      }

      // ok, let's see if we can swallow whatever we can.
      while (fr < fl) {
        var swallowee = file[fr];

        this.debug('\nglobstar while', file, fr, pattern, pr, swallowee);

        // XXX remove this slice.  Just pass the start index.
        if (this.matchOne(file.slice(fr), pattern.slice(pr), partial)) {
          this.debug('globstar found match!', fr, fl, swallowee);
          // found a match.
          return true
        } else {
          // can't swallow "." or ".." ever.
          // can only swallow ".foo" when explicitly asked.
          if (swallowee === '.' || swallowee === '..' ||
            (!options.dot && swallowee.charAt(0) === '.')) {
            this.debug('dot detected!', file, fr, pattern, pr);
            break
          }

          // ** swallows a segment, and continue.
          this.debug('globstar swallow a segment, and continue');
          fr++;
        }
      }

      // no match was found.
      // However, in partial mode, we can't say this is necessarily over.
      // If there's more *pattern* left, then
      if (partial) {
        // ran out of file
        this.debug('\n>>> no match, partial?', file, fr, pattern, pr);
        if (fr === fl) return true
      }
      return false
    }

    // something other than **
    // non-magic patterns just have to match exactly
    // patterns with magic have been turned into regexps.
    var hit;
    if (typeof p === 'string') {
      if (options.nocase) {
        hit = f.toLowerCase() === p.toLowerCase();
      } else {
        hit = f === p;
      }
      this.debug('string match', p, f, hit);
    } else {
      hit = f.match(p);
      this.debug('pattern match', p, f, hit);
    }

    if (!hit) return false
  }

  // Note: ending in / means that we'll get a final ""
  // at the end of the pattern.  This can only match a
  // corresponding "" at the end of the file.
  // If the file ends in /, then it can only match a
  // a pattern that ends in /, unless the pattern just
  // doesn't have any more for it. But, a/b/ should *not*
  // match "a/b/*", even though "" matches against the
  // [^/]*? pattern, except in partial mode, where it might
  // simply not be reached yet.
  // However, a/b/ should still satisfy a/*

  // now either we fell off the end of the pattern, or we're done.
  if (fi === fl && pi === pl) {
    // ran out of pattern and filename at the same time.
    // an exact hit!
    return true
  } else if (fi === fl) {
    // ran out of file, but still had pattern left.
    // this is ok if we're doing the match as part of
    // a glob fs traversal.
    return partial
  } else if (pi === pl) {
    // ran out of pattern, still have file left.
    // this is only acceptable if we're on the very last
    // empty segment of a file with a trailing slash.
    // a/* should match a/b/
    var emptyFileEnd = (fi === fl - 1) && (file[fi] === '');
    return emptyFileEnd
  }

  // should be unreachable.
  throw new Error('wtf?')
};

// replace stuff like \* with *
function globUnescape (s) {
  return s.replace(/\\(.)/g, '$1')
}

function regExpEscape (s) {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

const getComponentsDtsSrcFilePath = (config) => {
    return config.sys.path.join(config.srcDir, GENERATED_DTS);
};
const getComponentsDtsTypesFilePath = (config, outputTarget) => {
    return config.sys.path.join(outputTarget.typesDir, GENERATED_DTS);
};
const isOutputTargetDist = (o) => {
    return o.type === DIST;
};
const isOutputTargetDistCollection = (o) => {
    return o.type === DIST_COLLECTION;
};
const isOutputTargetCopy = (o) => {
    return o.type === COPY;
};
const isOutputTargetDistLazy = (o) => {
    return o.type === DIST_LAZY;
};
const isOutputTargetAngular = (o) => {
    return o.type === ANGULAR;
};
const isOutputTargetDistLazyLoader = (o) => {
    return o.type === DIST_LAZY_LOADER;
};
const isOutputTargetDistGlobalStyles = (o) => {
    return o.type === DIST_GLOBAL_STYLES;
};
const isOutputTargetDistModule = (o) => {
    return o.type === DIST_MODULE;
};
const isOutputTargetDistSelfContained = (o) => {
    return o.type === DIST_SELF_CONTAINED;
};
const isOutputTargetHydrate = (o) => {
    return o.type === DIST_HYDRATE_SCRIPT;
};
const isOutputTargetCustom = (o) => {
    return o.type === CUSTOM;
};
const isOutputTargetDocs = (o) => {
    return o.type === DOCS || o.type === DOCS_README || o.type === DOCS_JSON || o.type === DOCS_CUSTOM || o.type === DOCS_VSCODE;
};
const isOutputTargetDocsReadme = (o) => {
    return o.type === DOCS_README || o.type === DOCS;
};
const isOutputTargetDocsJson = (o) => {
    return o.type === DOCS_JSON;
};
const isOutputTargetDocsCustom = (o) => {
    return o.type === DOCS_CUSTOM;
};
const isOutputTargetDocsVscode = (o) => {
    return o.type === DOCS_VSCODE;
};
const isOutputTargetWww = (o) => {
    return o.type === WWW;
};
const isOutputTargetStats = (o) => {
    return o.type === STATS;
};
const isOutputTargetDistTypes = (o) => {
    return o.type === DIST_TYPES;
};
const getComponentsFromModules = (moduleFiles) => {
    return sortBy(flatOne(moduleFiles.map(m => m.cmps)), (c) => c.tagName);
};
const canSkipOutputTargets = (buildCtx) => {
    if (buildCtx.components.length === 0) {
        return true;
    }
    if (buildCtx.requiresFullBuild) {
        return false;
    }
    if (buildCtx.isRebuild && (buildCtx.hasScriptChanges || buildCtx.hasStyleChanges || buildCtx.hasHtmlChanges)) {
        return false;
    }
    return true;
};
const ANGULAR = `angular`;
const COPY = 'copy';
const CUSTOM = `custom`;
const DIST = `dist`;
const DIST_COLLECTION = `dist-collection`;
const DIST_TYPES = `dist-types`;
const DIST_HYDRATE_SCRIPT = `dist-hydrate-script`;
const DIST_LAZY = `dist-lazy`;
const DIST_LAZY_LOADER = `dist-lazy-loader`;
const DIST_MODULE = `experimental-dist-module`;
const DIST_SELF_CONTAINED = `dist-self-contained`;
const DIST_GLOBAL_STYLES = 'dist-global-styles';
const DOCS = `docs`;
const DOCS_CUSTOM = 'docs-custom';
const DOCS_JSON = `docs-json`;
const DOCS_README = `docs-readme`;
const DOCS_VSCODE = `docs-vscode`;
const STATS = `stats`;
const WWW = `www`;
const VALID_TYPES = [
    ANGULAR,
    COPY,
    CUSTOM,
    DIST,
    DIST_COLLECTION,
    DIST_GLOBAL_STYLES,
    DIST_HYDRATE_SCRIPT,
    DIST_LAZY,
    DIST_MODULE,
    DIST_SELF_CONTAINED,
    DOCS,
    DOCS_JSON,
    DOCS_README,
    DOCS_VSCODE,
    DOCS_CUSTOM,
    STATS,
    WWW,
];
const GENERATED_DTS = 'components.d.ts';

async function scopeComponentCss(config, buildCtx, cmp, mode, cssText, commentOriginalSelector) {
    try {
        const scopeId = getScopeId(cmp.tagName, mode);
        cssText = await config.sys.scopeCss(cssText, scopeId, commentOriginalSelector);
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    return cssText;
}
const getScopeId = (tagName, mode) => {
    return ('sc-' + tagName) + ((mode && mode !== DEFAULT_STYLE_MODE) ? '-' + mode : '');
};

const generateHmr = (config, compilerCtx, buildCtx) => {
    if (!config.devServer || !buildCtx.isRebuild) {
        return null;
    }
    if (config.devServer.reloadStrategy == null) {
        return null;
    }
    const hmr = {
        reloadStrategy: config.devServer.reloadStrategy,
        versionId: Date.now().toString().substring(6) + '' + Math.round((Math.random() * 89999) + 10000)
    };
    if (buildCtx.scriptsAdded.length > 0) {
        hmr.scriptsAdded = buildCtx.scriptsAdded.slice();
    }
    if (buildCtx.scriptsDeleted.length > 0) {
        hmr.scriptsDeleted = buildCtx.scriptsDeleted.slice();
    }
    const excludeHmr = excludeHmrFiles(config, config.devServer.excludeHmr, buildCtx.filesChanged);
    if (excludeHmr.length > 0) {
        hmr.excludeHmr = excludeHmr.slice();
    }
    if (buildCtx.hasHtmlChanges) {
        hmr.indexHtmlUpdated = true;
    }
    if (buildCtx.hasServiceWorkerChanges) {
        hmr.serviceWorkerUpdated = true;
    }
    const componentsUpdated = getComponentsUpdated(compilerCtx, buildCtx);
    if (componentsUpdated) {
        hmr.componentsUpdated = componentsUpdated;
    }
    if (Object.keys(buildCtx.stylesUpdated).length > 0) {
        hmr.inlineStylesUpdated = sortBy(buildCtx.stylesUpdated.map(s => {
            return {
                styleId: getScopeId(s.styleTag, s.styleMode),
                styleTag: s.styleTag,
                styleText: s.styleText,
            };
        }), s => s.styleId);
    }
    const externalStylesUpdated = getExternalStylesUpdated(config, buildCtx);
    if (externalStylesUpdated) {
        hmr.externalStylesUpdated = externalStylesUpdated;
    }
    const externalImagesUpdated = getImagesUpdated(config, buildCtx);
    if (externalImagesUpdated) {
        hmr.imagesUpdated = externalImagesUpdated;
    }
    if (Object.keys(hmr).length === 0) {
        return null;
    }
    return hmr;
};
const getComponentsUpdated = (compilerCtx, buildCtx) => {
    // find all of the components that would be affected from the file changes
    if (!buildCtx.filesChanged) {
        return null;
    }
    const filesToLookForImporters = buildCtx.filesChanged.filter(f => {
        return f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx');
    });
    if (filesToLookForImporters.length === 0) {
        return null;
    }
    const changedScriptFiles = [];
    const checkedFiles = new Set();
    const allModuleFiles = buildCtx.moduleFiles.filter(m => m.localImports && m.localImports.length > 0);
    while (filesToLookForImporters.length > 0) {
        const scriptFile = filesToLookForImporters.shift();
        addTsFileImporters(allModuleFiles, filesToLookForImporters, checkedFiles, changedScriptFiles, scriptFile);
    }
    const tags = changedScriptFiles.reduce((tags, changedTsFile) => {
        const moduleFile = compilerCtx.moduleMap.get(changedTsFile);
        if (moduleFile != null) {
            moduleFile.cmps.forEach(cmp => {
                if (typeof cmp.tagName === 'string') {
                    if (!tags.includes(cmp.tagName)) {
                        tags.push(cmp.tagName);
                    }
                }
            });
        }
        return tags;
    }, []);
    if (tags.length === 0) {
        return null;
    }
    return tags.sort();
};
const addTsFileImporters = (allModuleFiles, filesToLookForImporters, checkedFiles, changedScriptFiles, scriptFile) => {
    if (!changedScriptFiles.includes(scriptFile)) {
        // add it to our list of files to transpile
        changedScriptFiles.push(scriptFile);
    }
    if (checkedFiles.has(scriptFile)) {
        // already checked this file
        return;
    }
    checkedFiles.add(scriptFile);
    // get all the ts files that import this ts file
    const tsFilesThatImportsThisTsFile = allModuleFiles.reduce((arr, moduleFile) => {
        moduleFile.localImports.forEach(localImport => {
            let checkFile = localImport;
            if (checkFile === scriptFile) {
                arr.push(moduleFile.sourceFilePath);
                return;
            }
            checkFile = localImport + '.tsx';
            if (checkFile === scriptFile) {
                arr.push(moduleFile.sourceFilePath);
                return;
            }
            checkFile = localImport + '.ts';
            if (checkFile === scriptFile) {
                arr.push(moduleFile.sourceFilePath);
                return;
            }
            checkFile = localImport + '.js';
            if (checkFile === scriptFile) {
                arr.push(moduleFile.sourceFilePath);
                return;
            }
        });
        return arr;
    }, []);
    // add all the files that import this ts file to the list of ts files we need to look through
    tsFilesThatImportsThisTsFile.forEach(tsFileThatImportsThisTsFile => {
        // if we add to this array, then the while look will keep working until it's empty
        filesToLookForImporters.push(tsFileThatImportsThisTsFile);
    });
};
const getExternalStylesUpdated = (config, buildCtx) => {
    if (!buildCtx.isRebuild) {
        return null;
    }
    const outputTargets = config.outputTargets.filter(isOutputTargetWww);
    if (outputTargets.length === 0) {
        return null;
    }
    const cssFiles = buildCtx.filesWritten.filter(f => f.endsWith('.css'));
    if (cssFiles.length === 0) {
        return null;
    }
    return cssFiles.map(cssFile => {
        return config.sys.path.basename(cssFile);
    }).sort();
};
const getImagesUpdated = (config, buildCtx) => {
    const outputTargets = config.outputTargets.filter(isOutputTargetWww);
    if (outputTargets.length === 0) {
        return null;
    }
    const imageFiles = buildCtx.filesChanged.reduce((arr, filePath) => {
        if (IMAGE_EXT.some(ext => filePath.toLowerCase().endsWith(ext))) {
            const fileName = config.sys.path.basename(filePath);
            if (!arr.includes(fileName)) {
                arr.push(fileName);
            }
        }
        return arr;
    }, []);
    if (imageFiles.length === 0) {
        return null;
    }
    return imageFiles.sort();
};
const excludeHmrFiles = (config, excludeHmr, filesChanged) => {
    const excludeFiles = [];
    if (!excludeHmr || excludeHmr.length === 0) {
        return excludeFiles;
    }
    excludeHmr.forEach(excludeHmr => {
        return filesChanged.map(fileChanged => {
            let shouldExclude = false;
            if (isGlob(excludeHmr)) {
                shouldExclude = minimatch_1(fileChanged, excludeHmr);
            }
            else {
                shouldExclude = (normalizePath(excludeHmr) === normalizePath(fileChanged));
            }
            if (shouldExclude) {
                config.logger.debug(`excludeHmr: ${fileChanged}`);
                excludeFiles.push(config.sys.path.basename(fileChanged));
            }
            return shouldExclude;
        }).some(r => r);
    });
    return excludeFiles.sort();
};
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'];

const generateBuildResults = (config, compilerCtx, buildCtx) => {
    const timeSpan = buildCtx.createTimeSpan(`generateBuildResults started`, true);
    const buildResults = {
        buildId: buildCtx.buildId,
        buildConditionals: getBuildConditionals(buildCtx),
        bundleBuildCount: buildCtx.bundleBuildCount,
        diagnostics: normalizeDiagnostics(compilerCtx, buildCtx.diagnostics),
        dirsAdded: buildCtx.dirsAdded.slice().sort(),
        dirsDeleted: buildCtx.dirsDeleted.slice().sort(),
        duration: Date.now() - buildCtx.startTime,
        filesAdded: buildCtx.filesAdded.slice().sort(),
        filesChanged: buildCtx.filesChanged.slice().sort(),
        filesDeleted: buildCtx.filesDeleted.slice().sort(),
        filesUpdated: buildCtx.filesUpdated.slice().sort(),
        filesWritten: buildCtx.filesWritten.sort(),
        hasError: hasError(buildCtx.diagnostics),
        hasSuccessfulBuild: compilerCtx.hasSuccessfulBuild,
        isRebuild: buildCtx.isRebuild,
        styleBuildCount: buildCtx.styleBuildCount,
        transpileBuildCount: buildCtx.transpileBuildCount,
        components: [],
        entries: []
    };
    compilerCtx.lastBuildResults = Object.assign({}, buildResults);
    const hmr = generateHmr(config, compilerCtx, buildCtx);
    if (hmr != null) {
        buildResults.hmr = hmr;
    }
    buildCtx.entryModules.forEach(en => {
        const buildEntry = {
            entryId: en.entryKey,
            components: [],
            bundles: [],
            inputs: [],
            modes: en.modeNames.slice(),
            encapsulations: []
        };
        en.cmps.forEach(cmp => {
            if (!buildEntry.inputs.includes(cmp.sourceFilePath)) {
                buildEntry.inputs.push(cmp.sourceFilePath);
            }
            if (!buildEntry.encapsulations.includes(cmp.encapsulation)) {
                buildEntry.encapsulations.push(cmp.encapsulation);
            }
            const buildCmp = {
                tag: cmp.tagName,
                dependencyOf: cmp.dependents.slice(),
                dependencies: cmp.dependencies.slice()
            };
            buildEntry.components.push(buildCmp);
        });
        buildResults.entries.push(buildEntry);
    });
    buildResults.entries.forEach(en => {
        buildResults.components.push(...en.components);
    });
    timeSpan.finish(`generateBuildResults finished`);
    return buildResults;
};
const getBuildConditionals = (buildCtx) => {
    const b = {
        shadow: false,
        slot: false,
        svg: false,
        vdom: false
    };
    buildCtx.components.forEach(cmp => {
        b.shadow = b.shadow || (cmp.encapsulation === 'shadow');
        b.slot = b.slot || cmp.htmlTagNames.includes('slot');
        b.svg = b.svg || cmp.htmlTagNames.includes('svg');
        b.vdom = b.vdom || cmp.hasVdomRender;
    });
    return b;
};

const generateBuildStats = async (config, compilerCtx, buildCtx, buildResults) => {
    const statsTargets = config.outputTargets.filter(isOutputTargetStats);
    await Promise.all(statsTargets.map(async (outputTarget) => {
        await generateStatsOutputTarget(config, compilerCtx, buildCtx, buildResults, outputTarget);
    }));
};
const generateStatsOutputTarget = async (config, compilerCtx, buildCtx, buildResults, outputTarget) => {
    try {
        let jsonData;
        if (buildResults.hasError) {
            jsonData = {
                diagnostics: buildResults.diagnostics
            };
        }
        else {
            const stats = {
                compiler: {
                    name: config.sys.compiler.name,
                    version: config.sys.compiler.version
                },
                app: {
                    namespace: config.namespace,
                    fsNamespace: config.fsNamespace,
                    components: buildResults.components.length,
                    entries: buildResults.entries.length,
                    bundles: buildResults.entries.reduce((total, en) => {
                        total += en.bundles.length;
                        return total;
                    }, 0)
                },
                options: {
                    minifyJs: config.minifyJs,
                    minifyCss: config.minifyCss,
                    hashFileNames: config.hashFileNames,
                    hashedFileNameLength: config.hashedFileNameLength,
                    buildEs5: config.buildEs5
                },
                components: buildResults.components,
                entries: buildResults.entries,
                rollupResults: buildCtx.rollupResults,
                sourceGraph: {},
                collections: buildCtx.collections.map(c => {
                    return {
                        name: c.collectionName,
                        source: normalizePath(config.sys.path.relative(config.rootDir, c.moduleDir)),
                        tags: c.moduleFiles.map(m => m.cmpMeta.tagNameMeta).sort()
                    };
                }).sort((a, b) => {
                    if (a.name < b.name)
                        return -1;
                    if (a.name > b.name)
                        return 1;
                    return 0;
                })
            };
            sortBy(buildCtx.moduleFiles, m => m.sourceFilePath).forEach(moduleFile => {
                const key = normalizePath(config.sys.path.relative(config.rootDir, moduleFile.sourceFilePath));
                stats.sourceGraph[key] = moduleFile.localImports.map(localImport => {
                    return normalizePath(config.sys.path.relative(config.rootDir, localImport));
                }).sort();
            });
            jsonData = stats;
        }
        await compilerCtx.fs.writeFile(outputTarget.file, JSON.stringify(jsonData, null, 2));
        await compilerCtx.fs.commit();
    }
    catch (e) { }
};

const initFsWatcher = async (config, compilerCtx, buildCtx) => {
    // only create the watcher if this is a watch build
    // and we haven't created a watch listener already
    if (!config.watch || compilerCtx.fsWatcher != null) {
        return false;
    }
    if (typeof config.sys.createFsWatcher !== 'function') {
        return false;
    }
    try {
        buildCtx.debug(`initFsWatcher: ${config.sys.path.relative(config.rootDir, config.srcDir)}`);
        // since creation is async, let's make sure multiple don't get created
        compilerCtx.fsWatcher = true;
        compilerCtx.fsWatcher = await config.sys.createFsWatcher(config, config.sys.fs, compilerCtx.events);
        await compilerCtx.fsWatcher.addDirectory(config.srcDir);
        if (typeof config.configPath === 'string') {
            config.configPath = normalizePath(config.configPath);
            await compilerCtx.fsWatcher.addFile(config.configPath);
        }
    }
    catch (e) {
        const diagnostics = [];
        catchError(diagnostics, e);
        config.logger.printDiagnostics(diagnostics);
        return false;
    }
    return true;
};

const writeCacheStats = (config, compilerCtx, buildCtx) => {
    if (!config.enableCacheStats) {
        return;
    }
    const statsPath = config.sys.path.join(config.rootDir, 'stencil-cache-stats.json');
    config.logger.warn(`cache stats enabled for debugging, which is horrible for build times. Only enableCacheStats when debugging memory issues.`);
    const timeSpan = config.logger.createTimeSpan(`cache stats started: ${statsPath}`);
    let statsData = {};
    try {
        const dataStr = compilerCtx.fs.disk.readFileSync(statsPath);
        statsData = JSON.parse(dataStr);
    }
    catch (e) { }
    statsData['compilerCtx'] = statsData['compilerCtx'] || {};
    getObjectSize(statsData['compilerCtx'], compilerCtx);
    statsData['compilerCtx.cache.cacheFs.items'] = statsData['compilerCtx.cache.cacheFs.items'] || {};
    getObjectSize(statsData['compilerCtx.cache.cacheFs.items'], compilerCtx.cache['cacheFs']['items']);
    statsData['buildCtx'] = statsData['buildCtx'] || {};
    getObjectSize(statsData['buildCtx'], buildCtx);
    compilerCtx.fs.disk.writeFileSync(statsPath, JSON.stringify(statsData, null, 2));
    timeSpan.finish(`cache stats finished`);
};
const getObjectSize = (data, obj) => {
    if (obj) {
        Object.keys(obj).forEach(key => {
            if (typeof obj[key] === 'object') {
                const size = objectSizeEstimate(obj[key]);
                if (size > 20000) {
                    data[key] = data[key] || [];
                    data[key].push(size);
                }
            }
        });
    }
};
const objectSizeEstimate = (obj) => {
    if (!obj) {
        return 0;
    }
    const objectList = [];
    const stack = [obj];
    let bytes = 0;
    while (stack.length) {
        const value = stack.pop();
        if (typeof value === 'boolean') {
            bytes += 4;
        }
        else if (typeof value === 'string') {
            bytes += value.length * 2;
        }
        else if (typeof value === 'number') {
            bytes += 8;
        }
        else if (typeof value === 'object' && !objectList.includes(value)) {
            objectList.push(value);
            for (const i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
};

const buildFinish = async (buildCtx) => {
    const results = await buildDone(buildCtx.config, buildCtx.compilerCtx, buildCtx, false);
    const buildLog = {
        buildId: buildCtx.buildId,
        messages: buildCtx.buildMessages.slice(),
        progress: 1
    };
    buildCtx.compilerCtx.events.emit('buildLog', buildLog);
    return results;
};
const buildAbort = (buildCtx) => {
    return buildDone(buildCtx.config, buildCtx.compilerCtx, buildCtx, true);
};
const buildDone = async (config, compilerCtx, buildCtx, aborted) => {
    if (buildCtx.hasFinished && buildCtx.buildResults) {
        // we've already marked this build as finished and
        // already created the build results, just return these
        return buildCtx.buildResults;
    }
    buildCtx.debug(`${aborted ? 'aborted' : 'finished'} build, ${buildCtx.timestamp}`);
    // create the build results data
    buildCtx.buildResults = generateBuildResults(config, compilerCtx, buildCtx);
    // log any errors/warnings
    if (!buildCtx.hasFinished) {
        // haven't set this build as finished yet
        if (!buildCtx.hasPrintedResults) {
            config.logger.printDiagnostics(buildCtx.buildResults.diagnostics);
        }
        if (!compilerCtx.hasLoggedServerUrl && config.devServer && config.devServer.browserUrl && config.flags.serve) {
            // we've opened up the dev server
            // let's print out the dev server url
            config.logger.info(`dev server: ${config.logger.cyan(config.devServer.browserUrl)}`);
            compilerCtx.hasLoggedServerUrl = true;
        }
        const hasChanges = buildCtx.hasScriptChanges || buildCtx.hasStyleChanges;
        if (buildCtx.isRebuild && hasChanges && buildCtx.buildResults.hmr && !aborted) {
            // this is a rebuild, and we've got hmr data
            // and this build hasn't been aborted
            logHmr(config.logger, buildCtx);
        }
        // create a nice pretty message stating what happend
        const buildText = buildCtx.isRebuild ? 'rebuild' : 'build';
        const watchText = config.watch ? ', watching for changes...' : '';
        let buildStatus = 'finished';
        let statusColor = 'green';
        if (buildCtx.hasError) {
            // gosh darn, build had errors
            // ಥ_ಥ
            buildStatus = 'failed';
            statusColor = 'red';
        }
        else {
            // successful build!
            // ┏(°.°)┛ ┗(°.°)┓ ┗(°.°)┛ ┏(°.°)┓
            compilerCtx.hasSuccessfulBuild = true;
        }
        // print out the time it took to build
        // and add the duration to the build results
        if (!buildCtx.hasPrintedResults) {
            buildCtx.timeSpan.finish(`${buildText} ${buildStatus}${watchText}`, statusColor, true, true);
            buildCtx.hasPrintedResults = true;
            // write the build stats
            await generateBuildStats(config, compilerCtx, buildCtx, buildCtx.buildResults);
        }
        // emit a buildFinish event for anyone who cares
        compilerCtx.events.emit('buildFinish', buildCtx.buildResults);
        // write all of our logs to disk if config'd to do so
        // do this even if there are errors or not the active build
        config.logger.writeLogs(buildCtx.isRebuild);
        if (config.watch) {
            // this is a watch build
            // setup watch if we haven't done so already
            await initFsWatcher(config, compilerCtx, buildCtx);
        }
        else {
            // not a watch build, so lets destroy anything left open
            config.sys.destroy();
        }
    }
    // write cache stats only for memory debugging
    writeCacheStats(config, compilerCtx, buildCtx);
    // it's official, this build has finished
    buildCtx.hasFinished = true;
    return buildCtx.buildResults;
};
const logHmr = (logger, buildCtx) => {
    // this is a rebuild, and we've got hmr data
    // and this build hasn't been aborted
    const hmr = buildCtx.buildResults.hmr;
    if (hmr.componentsUpdated) {
        cleanupUpdateMsg(logger, `updated component`, hmr.componentsUpdated);
    }
    if (hmr.inlineStylesUpdated) {
        const inlineStyles = hmr.inlineStylesUpdated.map(s => s.styleTag).reduce((arr, v) => {
            if (!arr.includes(v)) {
                arr.push(v);
            }
            return arr;
        }, []);
        cleanupUpdateMsg(logger, `updated style`, inlineStyles);
    }
    if (hmr.externalStylesUpdated) {
        cleanupUpdateMsg(logger, `updated stylesheet`, hmr.externalStylesUpdated);
    }
    if (hmr.imagesUpdated) {
        cleanupUpdateMsg(logger, `updated image`, hmr.imagesUpdated);
    }
};
const cleanupUpdateMsg = (logger, msg, fileNames) => {
    if (fileNames.length > 0) {
        let fileMsg = '';
        if (fileNames.length > 7) {
            const remaining = fileNames.length - 6;
            fileNames = fileNames.slice(0, 6);
            fileMsg = fileNames.join(', ') + `, +${remaining} others`;
        }
        else {
            fileMsg = fileNames.join(', ');
        }
        if (fileNames.length > 1) {
            msg += 's';
        }
        logger.info(`${msg}: ${logger.cyan(fileMsg)}`);
    }
};

function isEmptable(o) {
    return (isOutputTargetDist(o) ||
        isOutputTargetWww(o) ||
        isOutputTargetDistLazyLoader(o) ||
        isOutputTargetDistSelfContained(o) ||
        isOutputTargetDistModule(o) ||
        isOutputTargetHydrate(o));
}
async function emptyOutputTargets(config, compilerCtx, buildCtx) {
    if (buildCtx.isRebuild) {
        return;
    }
    const cleanDirs = config.outputTargets
        .filter(isEmptable)
        .filter(o => o.empty)
        .map(({ dir }) => dir);
    if (cleanDirs.length === 0) {
        return;
    }
    const timeSpan = buildCtx.createTimeSpan(`cleaning ${cleanDirs.length} dirs`, true);
    await Promise.all(cleanDirs.map(dir => emptyDir(config, compilerCtx, buildCtx, dir)));
    timeSpan.finish('cleaning dirs finished');
}
async function emptyDir(config, compilerCtx, buildCtx, dir) {
    buildCtx.debug(`empty dir: ${dir}`);
    // Check if there is a .gitkeep file
    // We want to keep it so people don't have to readd manually
    // to their projects each time.
    const gitkeepPath = config.sys.path.join(dir, '.gitkeep');
    const existsGitkeep = await compilerCtx.fs.access(gitkeepPath);
    await compilerCtx.fs.emptyDir(dir);
    // If there was a .gitkeep file, add it again.
    if (existsGitkeep) {
        await compilerCtx.fs.writeFile(gitkeepPath, '', { immediateWrite: true });
    }
}

function getUsedComponents(doc, cmps) {
    const tags = new Set(cmps.map(cmp => cmp.tagName.toUpperCase()));
    const found = [];
    function searchComponents(el) {
        if (tags.has(el.tagName)) {
            found.push(el.tagName.toLowerCase());
        }
        for (let i = 0; i < el.childElementCount; i++) {
            searchComponents(el.children[i]);
        }
    }
    searchComponents(doc.documentElement);
    return found;
}

function getDefaultBundles(config, buildCtx, cmps) {
    const userConfigEntryPoints = getUserConfigBundles(config, buildCtx, cmps);
    if (userConfigEntryPoints.length > 0) {
        return userConfigEntryPoints;
    }
    let entryPointsHints = config.entryComponentsHint;
    if (!entryPointsHints && buildCtx.indexDoc) {
        entryPointsHints = getUsedComponents(buildCtx.indexDoc, cmps);
    }
    if (!entryPointsHints) {
        return [];
    }
    const mainBundle = unique([
        ...entryPointsHints,
        ...flatOne(entryPointsHints
            .map(resolveTag)
            .map(cmp => cmp.dependencies))
    ]).map(resolveTag);
    function resolveTag(tag) {
        return cmps.find(cmp => cmp.tagName === tag);
    }
    return [mainBundle];
}
function getUserConfigBundles(config, buildCtx, cmps) {
    const definedTags = new Set();
    const entryTags = config.bundles.map(b => {
        return b.components.map(tag => {
            const tagError = validateComponentTag(tag);
            if (tagError) {
                const err = buildError(buildCtx.diagnostics);
                err.header = `Stencil Config`;
                err.messageText = tagError;
            }
            const component = cmps.find(cmp => cmp.tagName === tag);
            if (!component) {
                const warn = buildWarn(buildCtx.diagnostics);
                warn.header = `Stencil Config`;
                warn.messageText = `Component tag "${tag}" is defined in a bundle but no matching component was found within this app or its collections.`;
            }
            if (definedTags.has(tag)) {
                const warn = buildWarn(buildCtx.diagnostics);
                warn.header = `Stencil Config`;
                warn.messageText = `Component tag "${tag}" has been defined multiple times in the "bundles" config.`;
            }
            definedTags.add(tag);
            return component;
        }).sort();
    });
    return entryTags;
}

function computeUsedComponents(config, defaultBundles, allCmps) {
    if (!config.excludeUnusedDependencies) {
        return new Set(allCmps.map(c => c.tagName));
    }
    const usedComponents = new Set();
    // All components
    defaultBundles.forEach(entry => {
        entry.forEach(cmp => usedComponents.add(cmp.tagName));
    });
    allCmps.forEach(cmp => {
        if (!cmp.isCollectionDependency) {
            usedComponents.add(cmp.tagName);
        }
    });
    allCmps.forEach(cmp => {
        if (cmp.isCollectionDependency) {
            if (cmp.dependents.some(dep => usedComponents.has(dep))) {
                usedComponents.add(cmp.tagName);
            }
        }
    });
    return usedComponents;
}
function generateComponentBundles(config, buildCtx) {
    const cmps = sortBy(buildCtx.components, cmp => cmp.dependents.length);
    const defaultBundles = getDefaultBundles(config, buildCtx, cmps);
    const usedComponents = computeUsedComponents(config, defaultBundles, cmps);
    if (config.devMode) {
        return cmps
            .filter(c => usedComponents.has(c.tagName))
            .map(cmp => [cmp]);
    }
    // Visit components that are already in one of the default bundlers
    const alreadyBundled = new Set();
    defaultBundles.forEach(entry => {
        entry.forEach(cmp => alreadyBundled.add(cmp));
    });
    const bundlers = cmps
        .filter(cmp => usedComponents.has(cmp.tagName) && !alreadyBundled.has(cmp))
        .map(c => [c]);
    return [
        ...defaultBundles,
        ...optimizeBundlers(bundlers, 0.6)
    ].filter(b => b.length > 0);
}
function optimizeBundlers(bundles, threshold) {
    const cmpIndexMap = new Map();
    bundles.forEach((entry, index) => {
        entry.forEach(cmp => {
            cmpIndexMap.set(cmp.tagName, index);
        });
    });
    const visited = new Uint8Array(bundles.length);
    const matrix = bundles.map(entry => {
        const vector = new Uint8Array(bundles.length);
        entry.forEach(cmp => {
            cmp.dependents.forEach(tag => {
                const index = cmpIndexMap.get(tag);
                if (index !== undefined) {
                    vector[index] = 1;
                }
            });
        });
        entry.forEach(cmp => {
            const index = cmpIndexMap.get(cmp.tagName);
            if (index !== undefined) {
                vector[index] = 0;
            }
        });
        return vector;
    });
    // resolve similar components
    const newBundles = [];
    for (let i = 0; i < matrix.length; i++) {
        // check if bundle is visited (0 means it's not)
        if (visited[i] === 0) {
            const bundle = [...bundles[i]];
            visited[i] = 1;
            for (let j = i + 1; j < matrix.length; j++) {
                if (visited[j] === 0 && computeScore(matrix[i], matrix[j]) >= threshold) {
                    bundle.push(...bundles[j]);
                    visited[j] = 1;
                }
            }
            newBundles.push(bundle);
        }
    }
    return newBundles;
}
function computeScore(m0, m1) {
    let total = 0;
    let match = 0;
    for (let i = 0; i < m0.length; i++) {
        if (m0[i] === 1 || m1[i] === 1) {
            total++;
            if (m0[i] === m1[i]) {
                match++;
            }
        }
    }
    return match / total;
}

function generateEntryModules(config, buildCtx) {
    // figure out how modules and components connect
    try {
        const bundles = generateComponentBundles(config, buildCtx);
        buildCtx.entryModules = bundles.map(createEntryModule);
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    buildCtx.debug(`generateEntryModules, ${buildCtx.entryModules.length} entryModules`);
}
function createEntryModule(cmps) {
    // generate a unique entry key based on the components within this entry module
    cmps = sortBy(cmps, c => c.tagName);
    const entryKey = cmps
        .map(c => c.tagName)
        .join('.') + '.entry';
    return {
        cmps,
        entryKey,
        // get the modes used in this bundle
        modeNames: getEntryModes(cmps),
    };
}
function getEntryModes(cmps) {
    const styleModeNames = [];
    cmps.forEach(cmp => {
        const cmpStyleModes = getComponentStyleModes(cmp);
        cmpStyleModes.forEach(modeName => {
            if (!styleModeNames.includes(modeName)) {
                styleModeNames.push(modeName);
            }
        });
    });
    if (styleModeNames.length === 0) {
        styleModeNames.push(DEFAULT_STYLE_MODE);
    }
    else if (styleModeNames.length > 1) {
        const index = (styleModeNames.indexOf(DEFAULT_STYLE_MODE));
        if (index > -1) {
            styleModeNames.splice(index, 1);
        }
    }
    return styleModeNames.sort();
}
function getComponentStyleModes(cmpMeta) {
    if (cmpMeta && cmpMeta.styles) {
        return cmpMeta.styles.map(style => style.modeName);
    }
    return [];
}

const COMPILER_BUILD = {
    id: '20191202165816',
    minfyJs: 'terser4.3.4_3',
    optimizeCss: 'autoprefixer9.6.5_cssnano4.1.10_postcss7.0.18_3',
    transpiler: 'typescript3.6.3_3'
};

const addImports = (transformOpts, tsSourceFile, importFnNames, importPath) => {
    if (importFnNames.length === 0) {
        return tsSourceFile;
    }
    if (transformOpts.module === ts$1__default.ModuleKind.CommonJS) {
        // CommonJS require()
        return addCjsRequires(tsSourceFile, importFnNames, importPath);
    }
    // ESM Imports
    return addEsmImports(tsSourceFile, importFnNames, importPath);
};
const addEsmImports = (tsSourceFile, importFnNames, importPath) => {
    // ESM Imports
    // import { importNames } from 'importPath';
    const importSpecifiers = importFnNames.map(importKey => {
        const splt = importKey.split(' as ');
        let importAs = importKey;
        let importFnName = importKey;
        if (splt.length > 1) {
            importAs = splt[1];
            importFnName = splt[0];
        }
        return ts$1__default.createImportSpecifier(typeof importFnName === 'string' && importFnName !== importAs ? ts$1__default.createIdentifier(importFnName) : undefined, ts$1__default.createIdentifier(importAs));
    });
    const statements = tsSourceFile.statements.slice();
    const newImport = ts$1__default.createImportDeclaration(undefined, undefined, ts$1__default.createImportClause(undefined, ts$1__default.createNamedImports(importSpecifiers)), ts$1__default.createLiteral(importPath));
    statements.unshift(newImport);
    return ts$1__default.updateSourceFileNode(tsSourceFile, statements);
};
const addCjsRequires = (tsSourceFile, importFnNames, importPath) => {
    // CommonJS require()
    // const { a, b, c } = require(importPath);
    const importBinding = ts$1__default.createObjectBindingPattern(importFnNames.map(importKey => {
        const splt = importKey.split(' as ');
        let importAs = importKey;
        let importFnName = importKey;
        if (splt.length > 1) {
            importAs = splt[1];
            importFnName = splt[0];
        }
        return ts$1__default.createBindingElement(undefined, importFnName, importAs);
    }));
    const requireStatement = ts$1__default.createVariableStatement(undefined, ts$1__default.createVariableDeclarationList([
        ts$1__default.createVariableDeclaration(importBinding, undefined, ts$1__default.createCall(ts$1__default.createIdentifier('require'), [], [ts$1__default.createLiteral(importPath)]))
    ], ts$1__default.NodeFlags.Const));
    const statements = tsSourceFile.statements.slice();
    statements.splice(2, 0, requireStatement);
    return ts$1__default.updateSourceFileNode(tsSourceFile, statements);
};

const getDeclarationParameters = (decorator) => {
    if (!ts$1__default.isCallExpression(decorator.expression)) {
        return [];
    }
    return decorator.expression.arguments.map(getDeclarationParameter);
};
const getDeclarationParameter = (arg) => {
    if (ts$1__default.isObjectLiteralExpression(arg)) {
        return objectLiteralToObjectMap(arg);
    }
    else if (ts$1__default.isStringLiteral(arg)) {
        return arg.text;
    }
    throw new Error(`invalid decorator argument: ${arg.getText()}`);
};
const isDecoratorNamed = (propName) => {
    return (dec) => {
        return (ts$1__default.isCallExpression(dec.expression) && dec.expression.expression.getText() === propName);
    };
};
const CLASS_DECORATORS_TO_REMOVE = new Set([
    'Component'
]);
const MEMBER_DECORATORS_TO_REMOVE = new Set([
    'Element',
    'Event',
    'Listen',
    'Method',
    'Prop',
    'PropDidChange',
    'PropWillChange',
    'State',
    'Watch'
]);

const getScriptTarget = () => {
    // using a fn so the browser compiler doesn't require the global ts for startup
    return ts$1__default.ScriptTarget.ES2017;
};
const isMemberPrivate = (member) => {
    if (member.modifiers && member.modifiers.some(m => m.kind === ts$1__default.SyntaxKind.PrivateKeyword || m.kind === ts$1__default.SyntaxKind.ProtectedKeyword)) {
        return true;
    }
    return false;
};
const convertValueToLiteral = (val, refs = null) => {
    if (refs == null) {
        refs = new WeakSet();
    }
    if (val === String) {
        return ts$1__default.createIdentifier('String');
    }
    if (val === Number) {
        return ts$1__default.createIdentifier('Number');
    }
    if (val === Boolean) {
        return ts$1__default.createIdentifier('Boolean');
    }
    if (val === undefined) {
        return ts$1__default.createIdentifier('undefined');
    }
    if (val === null) {
        return ts$1__default.createIdentifier('null');
    }
    if (Array.isArray(val)) {
        return arrayToArrayLiteral(val, refs);
    }
    if (typeof val === 'object') {
        if (val.__identifier && val.__escapedText) {
            return ts$1__default.createLiteral(val.__escapedText);
        }
        return objectToObjectLiteral(val, refs);
    }
    return ts$1__default.createLiteral(val);
};
const arrayToArrayLiteral = (list, refs) => {
    const newList = list.map(l => {
        return convertValueToLiteral(l, refs);
    });
    return ts$1__default.createArrayLiteral(newList);
};
const objectToObjectLiteral = (obj, refs) => {
    if (refs.has(obj)) {
        return ts$1__default.createIdentifier('undefined');
    }
    refs.add(obj);
    const newProperties = Object.keys(obj).map(key => {
        const prop = ts$1__default.createPropertyAssignment(ts$1__default.createLiteral(key), convertValueToLiteral(obj[key], refs));
        return prop;
    });
    return ts$1__default.createObjectLiteral(newProperties, true);
};
const createStaticGetter = (propName, returnExpression) => {
    return ts$1__default.createGetAccessor(undefined, [ts$1__default.createToken(ts$1__default.SyntaxKind.StaticKeyword)], propName, undefined, undefined, ts$1__default.createBlock([
        ts$1__default.createReturn(returnExpression)
    ]));
};
const removeDecorators = (node, decoratorNames) => {
    if (node.decorators) {
        const updatedDecoratorList = node.decorators.filter(dec => {
            const name = (ts$1__default.isCallExpression(dec.expression) &&
                ts$1__default.isIdentifier(dec.expression.expression) &&
                dec.expression.expression.text);
            return !decoratorNames.has(name);
        });
        if (updatedDecoratorList.length === 0) {
            node.decorators = undefined;
        }
        else if (updatedDecoratorList.length !== node.decorators.length) {
            node.decorators = ts$1__default.createNodeArray(updatedDecoratorList);
        }
    }
};
const getStaticValue = (staticMembers, staticName) => {
    const staticMember = staticMembers.find(member => member.name.escapedText === staticName);
    if (!staticMember || !staticMember.body || !staticMember.body.statements) {
        return null;
    }
    const rtnStatement = staticMember.body.statements.find(s => s.kind === ts$1__default.SyntaxKind.ReturnStatement);
    if (!rtnStatement || !rtnStatement.expression) {
        return null;
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.StringLiteral) {
        return rtnStatement.expression.text;
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.TrueKeyword) {
        return true;
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.FalseKeyword) {
        return false;
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.ObjectLiteralExpression) {
        return objectLiteralToObjectMap(rtnStatement.expression);
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.ArrayLiteralExpression && rtnStatement.expression.elements) {
        return arrayLiteralToArray(rtnStatement.expression);
    }
    if (rtnStatement.expression.kind === ts$1__default.SyntaxKind.Identifier) {
        return {
            __identifier: true,
            __escapedText: rtnStatement.expression.escapedText
        };
    }
    return null;
};
const arrayLiteralToArray = (arr) => {
    return arr.elements.map(element => {
        let val;
        switch (element.kind) {
            case ts$1__default.SyntaxKind.ObjectLiteralExpression:
                val = objectLiteralToObjectMap(element);
                break;
            case ts$1__default.SyntaxKind.StringLiteral:
                val = element.text;
                break;
            case ts$1__default.SyntaxKind.TrueKeyword:
                val = true;
                break;
            case ts$1__default.SyntaxKind.FalseKeyword:
                val = false;
                break;
            case ts$1__default.SyntaxKind.Identifier:
                const escapedText = element.escapedText;
                if (escapedText === 'String') {
                    val = String;
                }
                else if (escapedText === 'Number') {
                    val = Number;
                }
                else if (escapedText === 'Boolean') {
                    val = Boolean;
                }
                break;
            case ts$1__default.SyntaxKind.PropertyAccessExpression:
            default:
                val = element;
        }
        return val;
    });
};
const objectLiteralToObjectMap = (objectLiteral) => {
    const attrs = objectLiteral.properties;
    return attrs.reduce((final, attr) => {
        const attrName = getTextOfPropertyName(attr.name);
        let val;
        switch (attr.initializer.kind) {
            case ts$1__default.SyntaxKind.ArrayLiteralExpression:
                val = arrayLiteralToArray(attr.initializer);
                break;
            case ts$1__default.SyntaxKind.ObjectLiteralExpression:
                val = objectLiteralToObjectMap(attr.initializer);
                break;
            case ts$1__default.SyntaxKind.StringLiteral:
                val = attr.initializer.text;
                break;
            case ts$1__default.SyntaxKind.NoSubstitutionTemplateLiteral:
                val = attr.initializer.text;
                break;
            case ts$1__default.SyntaxKind.TrueKeyword:
                val = true;
                break;
            case ts$1__default.SyntaxKind.FalseKeyword:
                val = false;
                break;
            case ts$1__default.SyntaxKind.Identifier:
                const escapedText = attr.initializer.escapedText;
                if (escapedText === 'String') {
                    val = String;
                }
                else if (escapedText === 'Number') {
                    val = Number;
                }
                else if (escapedText === 'Boolean') {
                    val = Boolean;
                }
                else if (escapedText === 'undefined') {
                    val = undefined;
                }
                else if (escapedText === 'null') {
                    val = null;
                }
                else {
                    val = getIdentifierValue(attr.initializer);
                }
                break;
            case ts$1__default.SyntaxKind.PropertyAccessExpression:
            default:
                val = attr.initializer;
        }
        final[attrName] = val;
        return final;
    }, {});
};
const getIdentifierValue = (initializer) => {
    const escapedText = initializer.escapedText;
    const identifier = {
        __identifier: true,
        __escapedText: escapedText
    };
    return identifier;
};
const getTextOfPropertyName = (propName) => {
    switch (propName.kind) {
        case ts$1__default.SyntaxKind.Identifier:
            return propName.text;
        case ts$1__default.SyntaxKind.StringLiteral:
        case ts$1__default.SyntaxKind.NumericLiteral:
            return propName.text;
        case ts$1__default.SyntaxKind.ComputedPropertyName:
            const expression = propName.expression;
            if (ts$1__default.isStringLiteral(expression) || ts$1__default.isNumericLiteral(expression)) {
                return propName.expression.text;
            }
    }
    return undefined;
};
const getAttributeTypeInfo = (baseNode, sourceFile) => {
    const allReferences = {};
    getAllTypeReferences(baseNode).forEach(rt => {
        allReferences[rt] = getTypeReferenceLocation(rt, sourceFile);
    });
    return allReferences;
};
const getEntityName = (entity) => {
    if (ts$1__default.isIdentifier(entity)) {
        return entity.escapedText.toString();
    }
    else {
        return getEntityName(entity.left);
    }
};
const getAllTypeReferences = (node) => {
    const referencedTypes = [];
    const visit = (node) => {
        if (ts$1__default.isTypeReferenceNode(node)) {
            referencedTypes.push(getEntityName(node.typeName));
            if (node.typeArguments) {
                node.typeArguments
                    .filter(ta => ts$1__default.isTypeReferenceNode(ta))
                    .forEach((tr) => {
                    const typeName = tr.typeName;
                    referencedTypes.push(typeName.escapedText.toString());
                });
            }
        }
        return ts$1__default.forEachChild(node, visit);
    };
    visit(node);
    return referencedTypes;
};
const validateReferences = (config, diagnostics, references, node) => {
    Object.keys(references).forEach(refName => {
        const ref = references[refName];
        if (ref.path === '@stencil/core' && MEMBER_DECORATORS_TO_REMOVE.has(refName)) {
            const err = buildError(diagnostics);
            augmentDiagnosticWithNode(config, err, node);
        }
    });
};
const getTypeReferenceLocation = (typeName, sourceFile) => {
    const sourceFileObj = sourceFile.getSourceFile();
    // Loop through all top level imports to find any reference to the type for 'import' reference location
    const importTypeDeclaration = sourceFileObj.statements.find(st => {
        const statement = ts$1__default.isImportDeclaration(st) &&
            st.importClause &&
            ts$1__default.isImportClause(st.importClause) &&
            st.importClause.namedBindings &&
            ts$1__default.isNamedImports(st.importClause.namedBindings) &&
            Array.isArray(st.importClause.namedBindings.elements) &&
            st.importClause.namedBindings.elements.find(nbe => nbe.name.getText() === typeName);
        if (!statement) {
            return false;
        }
        return true;
    });
    if (importTypeDeclaration) {
        const localImportPath = importTypeDeclaration.moduleSpecifier.text;
        return {
            location: 'import',
            path: localImportPath
        };
    }
    // Loop through all top level exports to find if any reference to the type for 'local' reference location
    const isExported = sourceFileObj.statements.some(st => {
        // Is the interface defined in the file and exported
        const isInterfaceDeclarationExported = ((ts$1__default.isInterfaceDeclaration(st) &&
            st.name.getText() === typeName) &&
            Array.isArray(st.modifiers) &&
            st.modifiers.some(mod => mod.kind === ts$1__default.SyntaxKind.ExportKeyword));
        const isTypeAliasDeclarationExported = ((ts$1__default.isTypeAliasDeclaration(st) &&
            st.name.getText() === typeName) &&
            Array.isArray(st.modifiers) &&
            st.modifiers.some(mod => mod.kind === ts$1__default.SyntaxKind.ExportKeyword));
        // Is the interface exported through a named export
        const isTypeInExportDeclaration = ts$1__default.isExportDeclaration(st) &&
            ts$1__default.isNamedExports(st.exportClause) &&
            st.exportClause.elements.some(nee => nee.name.getText() === typeName);
        return isInterfaceDeclarationExported || isTypeAliasDeclarationExported || isTypeInExportDeclaration;
    });
    if (isExported) {
        return {
            location: 'local'
        };
    }
    // This is most likely a global type, if it is a local that is not exported then typescript will inform the dev
    return {
        location: 'global',
    };
};
const resolveType = (checker, type) => {
    const set = new Set();
    parseDocsType(checker, type, set);
    // normalize booleans
    const hasTrue = set.delete('true');
    const hasFalse = set.delete('false');
    if (hasTrue || hasFalse) {
        set.add('boolean');
    }
    let parts = Array.from(set.keys()).sort();
    if (parts.length > 1) {
        parts = parts.map(p => (p.indexOf('=>') >= 0) ? `(${p})` : p);
    }
    if (parts.length > 20) {
        return typeToString(checker, type);
    }
    else {
        return parts.join(' | ');
    }
};
const typeToString = (checker, type) => {
    const TYPE_FORMAT_FLAGS = ts$1__default.TypeFormatFlags.NoTruncation |
        ts$1__default.TypeFormatFlags.InTypeAlias |
        ts$1__default.TypeFormatFlags.InElementType;
    return checker.typeToString(type, undefined, TYPE_FORMAT_FLAGS);
};
const parseDocsType = (checker, type, parts) => {
    if (type.isUnion()) {
        type.types.forEach(t => {
            parseDocsType(checker, t, parts);
        });
    }
    else {
        const text = typeToString(checker, type);
        parts.add(text);
    }
};
const getModuleFromSourceFile = (compilerCtx, tsSourceFile) => {
    const sourceFilePath = normalizePath(tsSourceFile.fileName);
    const moduleFile = compilerCtx.moduleMap.get(sourceFilePath);
    if (moduleFile != null) {
        return moduleFile;
    }
    const moduleFiles = Array.from(compilerCtx.moduleMap.values());
    return moduleFiles.find(m => m.jsFilePath === sourceFilePath);
};
const getComponentMeta = (compilerCtx, tsSourceFile, node) => {
    const meta = compilerCtx.nodeMap.get(node);
    if (meta) {
        return meta;
    }
    const moduleFile = getModuleFromSourceFile(compilerCtx, tsSourceFile);
    if (moduleFile != null && node.members != null) {
        const staticMembers = node.members.filter(isStaticGetter);
        const tagName = getComponentTagName(staticMembers);
        if (typeof tagName === 'string') {
            return moduleFile.cmps.find(cmp => cmp.tagName === tagName);
        }
    }
    return undefined;
};
const getComponentTagName = (staticMembers) => {
    if (staticMembers.length > 0) {
        const tagName = getStaticValue(staticMembers, 'is');
        if (typeof tagName === 'string' && tagName.includes('-')) {
            return tagName;
        }
    }
    return null;
};
const isStaticGetter = (member) => {
    return (member.kind === ts$1__default.SyntaxKind.GetAccessor &&
        member.modifiers && member.modifiers.some(({ kind }) => kind === ts$1__default.SyntaxKind.StaticKeyword));
};
const serializeSymbol = (checker, symbol) => {
    return {
        tags: symbol.getJsDocTags().map(tag => ({ text: tag.text, name: tag.name })),
        text: ts$1__default.displayPartsToString(symbol.getDocumentationComment(checker)),
    };
};
const isInternal = (jsDocs) => {
    return jsDocs && jsDocs.tags.some((s) => s.name === 'internal');
};
const isMethod = (member, methodName) => {
    return ts$1__default.isMethodDeclaration(member) && member.name && member.name.escapedText === methodName;
};

const ATTACH_SHADOW = '__stencil_attachShadow';
const CREATE_EVENT = '__stencil_createEvent';
const DEFINE_CUSTOM_ELEMENT = '__stencil_defineCustomElement';
const GET_CONNECT = '__stencil_getConnect';
const GET_CONTEXT = '__stencil_getContext';
const GET_ELEMENT = '__stencil_getElement';
const HOST = '__stencil_Host';
const HTML_ELEMENT = 'HTMLElement';
const PROXY_CUSTOM_ELEMENT = '__stencil_proxyCustomElement';
const REGISTER_INSTANCE = '__stencil_registerInstance';
const REGISTER_HOST = '__stencil_registerHost';
const H = '__stencil_h';
const RUNTIME_APIS = {
    attachShadow: `attachShadow as ${ATTACH_SHADOW}`,
    createEvent: `createEvent as ${CREATE_EVENT}`,
    defineCustomElement: `defineCustomElement as ${DEFINE_CUSTOM_ELEMENT}`,
    getConnect: `getConnect as ${GET_CONNECT}`,
    getContext: `getContext as ${GET_CONTEXT}`,
    getElement: `getElement as ${GET_ELEMENT}`,
    h: `h as ${H}`,
    legacyH: `h`,
    Host: `Host as ${HOST}`,
    HTMLElement: HTML_ELEMENT,
    proxyCustomElement: `proxyCustomElement as ${PROXY_CUSTOM_ELEMENT}`,
    registerHost: `registerHost as ${REGISTER_HOST}`,
    registerInstance: `registerInstance as ${REGISTER_INSTANCE}`,
};
const addCoreRuntimeApi = (moduleFile, coreRuntimeApi) => {
    if (!moduleFile.coreRuntimeApis.includes(coreRuntimeApi)) {
        moduleFile.coreRuntimeApis.push(coreRuntimeApi);
    }
};
const addLegacyApis = (moduleFile) => {
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.legacyH);
};

const addLazyElementGetter = (classMembers, moduleFile, cmp) => {
    // @Element() element;
    // is transformed into:
    // get element() { return __stencil_getElement(this); }
    if (cmp.elementRef) {
        addCoreRuntimeApi(moduleFile, RUNTIME_APIS.getElement);
        classMembers.push(ts$1__default.createGetAccessor(undefined, undefined, cmp.elementRef, [], undefined, ts$1__default.createBlock([
            ts$1__default.createReturn(ts$1__default.createCall(ts$1__default.createIdentifier(GET_ELEMENT), undefined, [ts$1__default.createThis()]))
        ])));
    }
};

const addWatchers = (classMembers, cmp) => {
    if (cmp.watchers.length > 0) {
        const watcherObj = {};
        cmp.watchers.forEach(({ propName, methodName }) => {
            watcherObj[propName] = watcherObj[propName] || [];
            watcherObj[propName].push(methodName);
        });
        classMembers.push(createStaticGetter('watchers', convertValueToLiteral(watcherObj)));
    }
};

const replaceStylePlaceholders = (cmps, modeName, code) => {
    cmps.forEach(cmp => {
        let styleModeName = modeName;
        let style = cmp.styles.find(s => s.modeName === styleModeName);
        if (style == null || typeof style.compiledStyleText !== 'string') {
            styleModeName = DEFAULT_STYLE_MODE;
            style = cmp.styles.find(s => s.modeName === styleModeName);
            if (style == null || typeof style.compiledStyleText !== 'string') {
                return;
            }
        }
        const styleTextPlaceholder = getStyleTextPlaceholder(cmp);
        code = code.replace(styleTextPlaceholder, style.compiledStyleText);
    });
    return code;
};
const getStyleTextPlaceholder = (cmp) => {
    return `STYLE_TEXT_PLACEHOLDER:${cmp.tagName}`;
};

const removeStaticMetaProperties = (classNode) => {
    if (classNode.members == null) {
        return [];
    }
    return classNode.members.filter(classMember => {
        if (classMember.modifiers) {
            if (classMember.modifiers.some(m => m.kind === ts$1__default.SyntaxKind.StaticKeyword)) {
                const memberName = classMember.name.escapedText;
                if (REMOVE_STATIC_GETTERS.has(memberName)) {
                    return false;
                }
            }
        }
        return true;
    });
};
const REMOVE_STATIC_GETTERS = new Set([
    'is',
    'properties',
    'encapsulation',
    'elementRef',
    'events',
    'listeners',
    'methods',
    'states',
    'originalStyleUrls',
    'styleMode',
    'style',
    'styles',
    'styleUrl',
    'watchers',
    'styleUrls',
    'contextProps',
    'connectProps'
]);

const transformHostData = (classElements, moduleFile) => {
    const hasHostData = classElements.some(e => ts$1__default.isMethodDeclaration(e) && e.name.escapedText === 'hostData');
    if (hasHostData) {
        const renderIndex = classElements.findIndex(e => ts$1__default.isMethodDeclaration(e) && e.name.escapedText === 'render');
        if (renderIndex >= 0) {
            const renderMethod = classElements[renderIndex];
            classElements[renderIndex] = ts$1__default.updateMethod(renderMethod, renderMethod.decorators, renderMethod.modifiers, renderMethod.asteriskToken, ts$1__default.createIdentifier(INTERNAL_RENDER), renderMethod.questionToken, renderMethod.typeParameters, renderMethod.parameters, renderMethod.type, renderMethod.body);
        }
        classElements.push(syntheticRender(moduleFile, renderIndex >= 0));
    }
};
const syntheticRender = (moduleFile, hasRender) => {
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.Host);
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.h);
    const hArguments = [
        // __stencil_Host
        ts$1__default.createIdentifier(HOST),
        // this.hostData()
        ts$1__default.createCall(ts$1__default.createPropertyAccess(ts$1__default.createThis(), 'hostData'), undefined, undefined)
    ];
    if (hasRender) {
        hArguments.push(
        // this.render()
        ts$1__default.createCall(ts$1__default.createPropertyAccess(ts$1__default.createThis(), INTERNAL_RENDER), undefined, undefined));
    }
    /**
     * render() {
     *   return h(arguments);
     * }
     */
    return ts$1__default.createMethod(undefined, undefined, undefined, 'render', undefined, undefined, undefined, undefined, ts$1__default.createBlock([
        ts$1__default.createReturn(ts$1__default.createCall(ts$1__default.createIdentifier(H), undefined, hArguments))
    ]));
};
const INTERNAL_RENDER = '__stencil_render';

const updateComponentClass = (transformOpts, classNode, heritageClauses, members) => {
    if (transformOpts.module === ts$1__default.ModuleKind.CommonJS) {
        // CommonJS, leave component class as is
        let classModifiers = (Array.isArray(classNode.modifiers) ? classNode.modifiers.slice() : []);
        if (transformOpts.componentExport === 'customelement') {
            // remove export from class
            classModifiers = classModifiers.filter(m => {
                return m.kind !== ts$1__default.SyntaxKind.ExportKeyword;
            });
        }
        return ts$1__default.updateClassDeclaration(classNode, classNode.decorators, classModifiers, classNode.name, classNode.typeParameters, heritageClauses, members);
    }
    // ESM with export
    return createConstClass(transformOpts, classNode, heritageClauses, members);
};
const createConstClass = (transformOpts, classNode, heritageClauses, members) => {
    const className = classNode.name;
    const classModifiers = (Array.isArray(classNode.modifiers) ? classNode.modifiers : []).filter(m => {
        // remove the export
        return m.kind !== ts$1__default.SyntaxKind.ExportKeyword;
    });
    const constModifiers = [];
    if (transformOpts.componentExport !== 'customelement') {
        constModifiers.push(ts$1__default.createModifier(ts$1__default.SyntaxKind.ExportKeyword));
    }
    return ts$1__default.createVariableStatement(constModifiers, ts$1__default.createVariableDeclarationList([
        ts$1__default.createVariableDeclaration(className, undefined, ts$1__default.createClassExpression(classModifiers, undefined, classNode.typeParameters, heritageClauses, members))
    ], ts$1__default.NodeFlags.Const));
};

const addCreateEvents = (moduleFile, cmp) => {
    return cmp.events.map(ev => {
        addCoreRuntimeApi(moduleFile, RUNTIME_APIS.createEvent);
        return ts$1__default.createStatement(ts$1__default.createAssignment(ts$1__default.createPropertyAccess(ts$1__default.createThis(), ts$1__default.createIdentifier(ev.method)), ts$1__default.createCall(ts$1__default.createIdentifier(CREATE_EVENT), undefined, [
            ts$1__default.createThis(),
            ts$1__default.createLiteral(ev.name),
            ts$1__default.createLiteral(computeFlags(ev))
        ])));
    });
};
const computeFlags = (eventMeta) => {
    let flags = 0;
    if (eventMeta.bubbles) {
        flags |= 4 /* Bubbles */;
    }
    if (eventMeta.composed) {
        flags |= 2 /* Composed */;
    }
    if (eventMeta.cancelable) {
        flags |= 1 /* Cancellable */;
    }
    return flags;
};

const addLegacyProps = (moduleFile, cmp) => {
    if (cmp.legacyConnect.length > 0) {
        addCoreRuntimeApi(moduleFile, RUNTIME_APIS.getConnect);
    }
    if (cmp.legacyContext.length > 0) {
        addCoreRuntimeApi(moduleFile, RUNTIME_APIS.getContext);
    }
    return [
        ...cmp.legacyConnect.map(c => getStatement(c.name, GET_CONNECT, c.connect)),
        ...cmp.legacyContext.map(c => getStatement(c.name, GET_CONTEXT, c.context))
    ];
};
const getStatement = (propName, method, arg) => {
    return ts$1__default.createExpressionStatement(ts$1__default.createAssignment(ts$1__default.createPropertyAccess(ts$1__default.createThis(), propName), ts$1__default.createCall(ts$1__default.createIdentifier(method), undefined, [
        ts$1__default.createThis(),
        ts$1__default.createLiteral(arg)
    ])));
};

const updateLazyComponentConstructor = (classMembers, moduleFile, cmp) => {
    const cstrMethodArgs = [
        ts$1__default.createParameter(undefined, undefined, undefined, ts$1__default.createIdentifier(HOST_REF_ARG))
    ];
    const cstrMethodIndex = classMembers.findIndex(m => m.kind === ts$1__default.SyntaxKind.Constructor);
    if (cstrMethodIndex >= 0) {
        // add to the existing constructor()
        const cstrMethod = classMembers[cstrMethodIndex];
        const body = ts$1__default.updateBlock(cstrMethod.body, [
            registerInstanceStatement(moduleFile),
            ...cstrMethod.body.statements,
            ...addCreateEvents(moduleFile, cmp),
            ...addLegacyProps(moduleFile, cmp)
        ]);
        classMembers[cstrMethodIndex] = ts$1__default.updateConstructor(cstrMethod, cstrMethod.decorators, cstrMethod.modifiers, cstrMethodArgs, body);
    }
    else {
        // create a constructor()
        const cstrMethod = ts$1__default.createConstructor(undefined, undefined, cstrMethodArgs, ts$1__default.createBlock([
            registerInstanceStatement(moduleFile),
            ...addCreateEvents(moduleFile, cmp),
            ...addLegacyProps(moduleFile, cmp)
        ], true));
        classMembers.unshift(cstrMethod);
    }
};
const registerInstanceStatement = (moduleFile) => {
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.registerInstance);
    return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createIdentifier(REGISTER_INSTANCE), undefined, [
        ts$1__default.createThis(),
        ts$1__default.createIdentifier(HOST_REF_ARG)
    ]));
};
const HOST_REF_ARG = 'hostRef';

const updateLazyComponentClass = (transformOpts, classNode, moduleFile, cmp) => {
    const members = updateLazyComponentMembers(transformOpts, classNode, moduleFile, cmp);
    return updateComponentClass(transformOpts, classNode, classNode.heritageClauses, members);
};
const updateLazyComponentMembers = (transformOpts, classNode, moduleFile, cmp) => {
    const classMembers = removeStaticMetaProperties(classNode);
    updateLazyComponentConstructor(classMembers, moduleFile, cmp);
    addLazyElementGetter(classMembers, moduleFile, cmp);
    addWatchers(classMembers, cmp);
    transformHostData(classMembers, moduleFile);
    if (transformOpts.style === 'static') {
        addComponentStylePlaceholders(classMembers, cmp);
    }
    return classMembers;
};
const addComponentStylePlaceholders = (classMembers, cmp) => {
    if (cmp.hasStyle) {
        classMembers.push(createStaticGetter('style', ts$1__default.createStringLiteral(getStyleTextPlaceholder(cmp))));
    }
};

const transformToLazyComponentText = (compilerCtx, buildCtx, transformOpts, cmp, inputText) => {
    let outputText = null;
    try {
        const transpileOpts = {
            compilerOptions: {
                module: ts$1__default.ModuleKind.ESNext,
                target: getScriptTarget(),
                skipLibCheck: true,
                noResolve: true,
                noLib: true,
            },
            fileName: cmp.jsFilePath,
            transformers: {
                after: [
                    lazyComponentTransform(compilerCtx, transformOpts)
                ]
            }
        };
        const transpileOutput = ts$1__default.transpileModule(inputText, transpileOpts);
        buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(transpileOutput.diagnostics));
        if (!buildCtx.hasError && typeof transpileOutput.outputText === 'string') {
            outputText = transpileOutput.outputText;
        }
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    return outputText;
};
const lazyComponentTransform = (compilerCtx, transformOpts) => {
    return transformCtx => {
        return tsSourceFile => {
            const moduleFile = getModuleFromSourceFile(compilerCtx, tsSourceFile);
            const visitNode = (node) => {
                if (ts$1__default.isClassDeclaration(node)) {
                    const cmp = getComponentMeta(compilerCtx, tsSourceFile, node);
                    if (cmp != null) {
                        return updateLazyComponentClass(transformOpts, node, moduleFile, cmp);
                    }
                }
                return ts$1__default.visitEachChild(node, visitNode, transformCtx);
            };
            tsSourceFile = ts$1__default.visitEachChild(tsSourceFile, visitNode, transformCtx);
            if (moduleFile.isLegacy) {
                addLegacyApis(moduleFile);
            }
            tsSourceFile = addImports(transformOpts, tsSourceFile, moduleFile.coreRuntimeApis, transformOpts.coreImportPath);
            return tsSourceFile;
        };
    };
};

const updateToLazyComponent = async (config, compilerCtx, buildCtx, cmp) => {
    const inputFilePath = cmp.jsFilePath;
    const inputFileDir = config.sys.path.dirname(inputFilePath);
    const inputFileName = config.sys.path.basename(inputFilePath);
    const inputText = await compilerCtx.fs.readFile(inputFilePath);
    const cacheKey = await compilerCtx.cache.createKey('lazy', COMPILER_BUILD.id, COMPILER_BUILD.transpiler, inputText);
    const outputFileName = `${cacheKey}-${inputFileName}`;
    const outputFilePath = config.sys.path.join(inputFileDir, outputFileName);
    let outputJsText = await compilerCtx.cache.get(cacheKey);
    if (outputJsText == null) {
        const transformOpts = {
            coreImportPath: '@stencil/core',
            componentExport: null,
            componentMetadata: null,
            proxy: null,
            style: 'static'
        };
        outputJsText = transformToLazyComponentText(compilerCtx, buildCtx, transformOpts, cmp, inputText);
        await compilerCtx.cache.put(cacheKey, outputJsText);
    }
    await compilerCtx.fs.writeFile(outputFilePath, outputJsText, { inMemoryOnly: true });
    return {
        filePath: outputFilePath,
        exportLine: createComponentExport(cmp, outputFilePath),
        cmp
    };
};
const createComponentExport = (cmp, lazyModuleFilePath) => {
    const originalClassName = cmp.componentClassName;
    const underscoredClassName = cmp.tagName.replace(/-/g, '_');
    const filePath = normalizePath(lazyModuleFilePath);
    return `export { ${originalClassName} as ${underscoredClassName} } from '${filePath}';`;
};

const formatLazyBundleRuntimeMeta = (bundleId, cmps) => {
    return [
        bundleId,
        cmps.map(cmp => formatComponentRuntimeMeta(cmp, true))
    ];
};
const formatComponentRuntimeMeta = (compilerMeta, includeMethods) => {
    let flags = 0;
    if (compilerMeta.encapsulation === 'shadow') {
        flags |= 1 /* shadowDomEncapsulation */;
    }
    else if (compilerMeta.encapsulation === 'scoped') {
        flags |= 2 /* scopedCssEncapsulation */;
    }
    if (compilerMeta.encapsulation !== 'shadow' && compilerMeta.htmlTagNames.includes('slot')) {
        flags |= 4 /* hasSlotRelocation */;
    }
    const members = formatComponentRuntimeMembers(compilerMeta, includeMethods);
    const hostListeners = formatHostListeners(compilerMeta);
    return trimFalsy([
        flags,
        compilerMeta.tagName,
        Object.keys(members).length > 0 ? members : undefined,
        hostListeners.length > 0 ? hostListeners : undefined
    ]);
};
const stringifyRuntimeData = (data) => {
    const json = JSON.stringify(data);
    if (json.length > 10000) {
        // JSON metadata is big, JSON.parse() is faster
        // https://twitter.com/mathias/status/1143551692732030979
        return `JSON.parse(${JSON.stringify(json)})`;
    }
    return json;
};
const formatComponentRuntimeMembers = (compilerMeta, includeMethods = true) => {
    return Object.assign(Object.assign(Object.assign({}, formatPropertiesRuntimeMember(compilerMeta.properties)), formatStatesRuntimeMember(compilerMeta.states)), includeMethods ? formatMethodsRuntimeMember(compilerMeta.methods) : {});
};
const formatPropertiesRuntimeMember = (properties) => {
    const runtimeMembers = {};
    properties.forEach(member => {
        runtimeMembers[member.name] = trimFalsy([
            /**
             * [0] member type
             */
            formatFlags(member),
            formatAttrName(member)
        ]);
    });
    return runtimeMembers;
};
const formatFlags = (compilerProperty) => {
    let type = formatPropType(compilerProperty.type);
    if (compilerProperty.mutable) {
        type |= 1024 /* Mutable */;
    }
    if (compilerProperty.reflect) {
        type |= 512 /* ReflectAttr */;
    }
    return type;
};
const formatAttrName = (compilerProperty) => {
    if (typeof compilerProperty.attribute === 'string') {
        // string attr name means we should observe this attribute
        if (compilerProperty.name === compilerProperty.attribute) {
            // property name and attribute name are the exact same
            // true value means to use the property name for the attribute name
            return undefined;
        }
        // property name and attribute name are not the same
        // so we need to return the actual string value
        // example: "multiWord" !== "multi-word"
        return compilerProperty.attribute;
    }
    // we shouldn't even observe an attribute for this property
    return undefined;
};
const formatPropType = (type) => {
    if (type === 'string') {
        return 1 /* String */;
    }
    if (type === 'number') {
        return 2 /* Number */;
    }
    if (type === 'boolean') {
        return 4 /* Boolean */;
    }
    if (type === 'any') {
        return 8 /* Any */;
    }
    return 16 /* Unknown */;
};
const formatStatesRuntimeMember = (states) => {
    const runtimeMembers = {};
    states.forEach(member => {
        runtimeMembers[member.name] = [
            32 /* State */
        ];
    });
    return runtimeMembers;
};
const formatMethodsRuntimeMember = (methods) => {
    const runtimeMembers = {};
    methods.forEach(member => {
        runtimeMembers[member.name] = [
            64 /* Method */
        ];
    });
    return runtimeMembers;
};
const formatHostListeners = (compilerMeta) => {
    return compilerMeta.listeners.map(compilerListener => {
        const hostListener = [
            computeListenerFlags(compilerListener),
            compilerListener.name,
            compilerListener.method,
        ];
        return hostListener;
    });
};
const computeListenerFlags = (listener) => {
    let flags = 0;
    if (listener.capture) {
        flags |= 2 /* Capture */;
    }
    if (listener.passive) {
        flags |= 1 /* Passive */;
    }
    switch (listener.target) {
        case 'document':
            flags |= 4 /* TargetDocument */;
            break;
        case 'window':
            flags |= 8 /* TargetWindow */;
            break;
        case 'parent':
            flags |= 16 /* TargetParent */;
            break;
        case 'body':
            flags |= 32 /* TargetBody */;
            break;
    }
    return flags;
};
const trimFalsy = (data) => {
    const arr = data;
    for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i]) {
            break;
        }
        // if falsy, safe to pop()
        arr.pop();
    }
    return arr;
};

const addModuleMetadataProxies = (tsSourceFile, moduleFile) => {
    const statements = tsSourceFile.statements.slice();
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.proxyCustomElement);
    statements.push(...moduleFile.cmps.map(addComponentMetadataProxy));
    return ts$1__default.updateSourceFileNode(tsSourceFile, statements);
};
const addComponentMetadataProxy = (compilerMeta) => {
    const compactMeta = formatComponentRuntimeMeta(compilerMeta, true);
    const liternalCmpClassName = ts$1__default.createIdentifier(compilerMeta.componentClassName);
    const liternalMeta = convertValueToLiteral(compactMeta);
    return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createIdentifier(PROXY_CUSTOM_ELEMENT), [], [
        liternalCmpClassName,
        liternalMeta
    ]));
};

const defineCustomElement = (tsSourceFile, moduleFile, transformOpts) => {
    let statements = tsSourceFile.statements.slice();
    statements.push(...moduleFile.cmps.map(cmp => {
        return addDefineCustomElement(moduleFile, cmp);
    }));
    if (transformOpts.module === ts$1__default.ModuleKind.CommonJS) {
        // remove commonjs exports keyword from component classes
        statements = removeComponentCjsExport(statements, moduleFile);
    }
    return ts$1__default.updateSourceFileNode(tsSourceFile, statements);
};
const addDefineCustomElement = (moduleFile, compilerMeta) => {
    if (compilerMeta.isPlain) {
        // add customElements.define('cmp-a', CmpClass);
        return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createPropertyAccess(ts$1__default.createIdentifier('customElements'), ts$1__default.createIdentifier('define')), [], [
            ts$1__default.createLiteral(compilerMeta.tagName),
            ts$1__default.createIdentifier(compilerMeta.componentClassName)
        ]));
    }
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.defineCustomElement);
    const compactMeta = formatComponentRuntimeMeta(compilerMeta, true);
    const liternalCmpClassName = ts$1__default.createIdentifier(compilerMeta.componentClassName);
    const liternalMeta = convertValueToLiteral(compactMeta);
    return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createIdentifier(DEFINE_CUSTOM_ELEMENT), [], [
        liternalCmpClassName,
        liternalMeta
    ]));
};
const removeComponentCjsExport = (statements, moduleFile) => {
    const cmpClassNames = new Set(moduleFile.cmps.map(cmp => cmp.componentClassName));
    return statements.filter(s => {
        if (s.kind === ts$1__default.SyntaxKind.ExpressionStatement) {
            const exp = s.expression;
            if (exp && exp.kind === ts$1__default.SyntaxKind.BinaryExpression) {
                const left = exp.left;
                if (left && left.kind === ts$1__default.SyntaxKind.PropertyAccessExpression) {
                    if (left.expression && left.expression.kind === ts$1__default.SyntaxKind.Identifier) {
                        const leftText = left.expression;
                        if (leftText.text === 'exports') {
                            const right = exp.right;
                            if (right && cmpClassNames.has(right.text)) {
                                return false;
                            }
                        }
                    }
                }
            }
        }
        return true;
    });
};

const addNativeConnectedCallback = (classMembers, cmp) => {
    // function call to stencil's exported connectedCallback(elm, plt)
    // TODO: fast path
    if (cmp.isPlain && cmp.hasRenderFn) {
        const fnCall = ts$1__default.createExpressionStatement(ts$1__default.createAssignment(ts$1__default.createPropertyAccess(ts$1__default.createThis(), 'textContent'), ts$1__default.createCall(ts$1__default.createPropertyAccess(ts$1__default.createThis(), 'render'), undefined, undefined)));
        const connectedCallback = classMembers.find(classMember => {
            return (ts$1__default.isMethodDeclaration(classMember) && classMember.name.escapedText === 'connectedCallback');
        });
        const prependBody = [
            fnCall,
        ];
        if (connectedCallback != null) {
            // class already has a connectedCallback(), so update it
            connectedCallback.body = ts$1__default.updateBlock(connectedCallback.body, [
                ...prependBody,
                ...connectedCallback.body.statements
            ]);
        }
        else {
            // class doesn't have a connectedCallback(), so add it
            const callbackMethod = ts$1__default.createMethod(undefined, undefined, undefined, 'connectedCallback', undefined, undefined, undefined, undefined, ts$1__default.createBlock(prependBody, true));
            classMembers.push(callbackMethod);
        }
    }
};

const addNativeElementGetter = (classMembers, cmp) => {
    // @Element() element;
    // is transformed into:
    // get element() { return this; }
    if (cmp.elementRef) {
        classMembers.push(ts$1__default.createGetAccessor(undefined, undefined, cmp.elementRef, [], undefined, ts$1__default.createBlock([
            ts$1__default.createReturn(ts$1__default.createThis())
        ])));
    }
};

/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 *
 * This file is a port of shadowCSS from webcomponents.js to TypeScript.
 * https://github.com/webcomponents/webcomponentsjs/blob/4efecd7e0e/src/ShadowCSS/ShadowCSS.js
 * https://github.com/angular/angular/blob/master/packages/compiler/src/shadow_css.ts
 */
const safeSelector = (selector) => {
    const placeholders = [];
    let index = 0;
    let content;
    // Replaces attribute selectors with placeholders.
    // The WS in [attr="va lue"] would otherwise be interpreted as a selector separator.
    selector = selector.replace(/(\[[^\]]*\])/g, (_, keep) => {
        const replaceBy = `__ph-${index}__`;
        placeholders.push(keep);
        index++;
        return replaceBy;
    });
    // Replaces the expression in `:nth-child(2n + 1)` with a placeholder.
    // WS and "+" would otherwise be interpreted as selector separators.
    content = selector.replace(/(:nth-[-\w]+)(\([^)]+\))/g, (_, pseudo, exp) => {
        const replaceBy = `__ph-${index}__`;
        placeholders.push(exp);
        index++;
        return pseudo + replaceBy;
    });
    const ss = {
        content,
        placeholders,
    };
    return ss;
};
const restoreSafeSelector = (placeholders, content) => {
    return content.replace(/__ph-(\d+)__/g, (_, index) => placeholders[+index]);
};
const _polyfillHost = '-shadowcsshost';
const _polyfillSlotted = '-shadowcssslotted';
// note: :host-context pre-processed to -shadowcsshostcontext.
const _polyfillHostContext = '-shadowcsscontext';
const _parenSuffix = ')(?:\\((' +
    '(?:\\([^)(]*\\)|[^)(]*)+?' +
    ')\\))?([^,{]*)';
const _cssColonHostRe = new RegExp('(' + _polyfillHost + _parenSuffix, 'gim');
const _cssColonHostContextRe = new RegExp('(' + _polyfillHostContext + _parenSuffix, 'gim');
const _cssColonSlottedRe = new RegExp('(' + _polyfillSlotted + _parenSuffix, 'gim');
const _polyfillHostNoCombinator = _polyfillHost + '-no-combinator';
const _polyfillHostNoCombinatorRe = /-shadowcsshost-no-combinator([^\s]*)/;
const _shadowDOMSelectorsRe = [
    /::shadow/g,
    /::content/g
];
const _selectorReSuffix = '([>\\s~+\[.,{:][\\s\\S]*)?$';
const _polyfillHostRe = /-shadowcsshost/gim;
const _colonHostRe = /:host/gim;
const _colonSlottedRe = /::slotted/gim;
const _colonHostContextRe = /:host-context/gim;
const _commentRe = /\/\*\s*[\s\S]*?\*\//g;
const stripComments = (input) => {
    return input.replace(_commentRe, '');
};
const _commentWithHashRe = /\/\*\s*#\s*source(Mapping)?URL=[\s\S]+?\*\//g;
const extractCommentsWithHash = (input) => {
    return input.match(_commentWithHashRe) || [];
};
const _ruleRe = /(\s*)([^;\{\}]+?)(\s*)((?:{%BLOCK%}?\s*;?)|(?:\s*;))/g;
const _curlyRe = /([{}])/g;
const OPEN_CURLY = '{';
const CLOSE_CURLY = '}';
const BLOCK_PLACEHOLDER = '%BLOCK%';
const processRules = (input, ruleCallback) => {
    const inputWithEscapedBlocks = escapeBlocks(input);
    let nextBlockIndex = 0;
    return inputWithEscapedBlocks.escapedString.replace(_ruleRe, (...m) => {
        const selector = m[2];
        let content = '';
        let suffix = m[4];
        let contentPrefix = '';
        if (suffix && suffix.startsWith('{' + BLOCK_PLACEHOLDER)) {
            content = inputWithEscapedBlocks.blocks[nextBlockIndex++];
            suffix = suffix.substring(BLOCK_PLACEHOLDER.length + 1);
            contentPrefix = '{';
        }
        const cssRule = {
            selector,
            content
        };
        const rule = ruleCallback(cssRule);
        return `${m[1]}${rule.selector}${m[3]}${contentPrefix}${rule.content}${suffix}`;
    });
};
const escapeBlocks = (input) => {
    const inputParts = input.split(_curlyRe);
    const resultParts = [];
    const escapedBlocks = [];
    let bracketCount = 0;
    let currentBlockParts = [];
    for (let partIndex = 0; partIndex < inputParts.length; partIndex++) {
        const part = inputParts[partIndex];
        if (part === CLOSE_CURLY) {
            bracketCount--;
        }
        if (bracketCount > 0) {
            currentBlockParts.push(part);
        }
        else {
            if (currentBlockParts.length > 0) {
                escapedBlocks.push(currentBlockParts.join(''));
                resultParts.push(BLOCK_PLACEHOLDER);
                currentBlockParts = [];
            }
            resultParts.push(part);
        }
        if (part === OPEN_CURLY) {
            bracketCount++;
        }
    }
    if (currentBlockParts.length > 0) {
        escapedBlocks.push(currentBlockParts.join(''));
        resultParts.push(BLOCK_PLACEHOLDER);
    }
    const strEscapedBlocks = {
        escapedString: resultParts.join(''),
        blocks: escapedBlocks
    };
    return strEscapedBlocks;
};
const insertPolyfillHostInCssText = (selector) => {
    selector = selector
        .replace(_colonHostContextRe, _polyfillHostContext)
        .replace(_colonHostRe, _polyfillHost)
        .replace(_colonSlottedRe, _polyfillSlotted);
    return selector;
};
const convertColonRule = (cssText, regExp, partReplacer) => {
    // m[1] = :host(-context), m[2] = contents of (), m[3] rest of rule
    return cssText.replace(regExp, (...m) => {
        if (m[2]) {
            const parts = m[2].split(',');
            const r = [];
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i].trim();
                if (!p)
                    break;
                r.push(partReplacer(_polyfillHostNoCombinator, p, m[3]));
            }
            return r.join(',');
        }
        else {
            return _polyfillHostNoCombinator + m[3];
        }
    });
};
const colonHostPartReplacer = (host, part, suffix) => {
    return host + part.replace(_polyfillHost, '') + suffix;
};
const convertColonHost = (cssText) => {
    return convertColonRule(cssText, _cssColonHostRe, colonHostPartReplacer);
};
const colonHostContextPartReplacer = (host, part, suffix) => {
    if (part.indexOf(_polyfillHost) > -1) {
        return colonHostPartReplacer(host, part, suffix);
    }
    else {
        return host + part + suffix + ', ' + part + ' ' + host + suffix;
    }
};
const convertColonSlotted = (cssText, slotAttr) => {
    const regExp = _cssColonSlottedRe;
    return cssText.replace(regExp, (...m) => {
        if (m[2]) {
            const compound = m[2].trim();
            const suffix = m[3];
            const sel = '.' + slotAttr + ' > ' + compound + suffix;
            return sel;
        }
        else {
            return _polyfillHostNoCombinator + m[3];
        }
    });
};
const convertColonHostContext = (cssText) => {
    return convertColonRule(cssText, _cssColonHostContextRe, colonHostContextPartReplacer);
};
const convertShadowDOMSelectors = (cssText) => {
    return _shadowDOMSelectorsRe.reduce((result, pattern) => result.replace(pattern, ' '), cssText);
};
const makeScopeMatcher = (scopeSelector) => {
    const lre = /\[/g;
    const rre = /\]/g;
    scopeSelector = scopeSelector.replace(lre, '\\[').replace(rre, '\\]');
    return new RegExp('^(' + scopeSelector + ')' + _selectorReSuffix, 'm');
};
const selectorNeedsScoping = (selector, scopeSelector) => {
    const re = makeScopeMatcher(scopeSelector);
    return !re.test(selector);
};
const applySimpleSelectorScope = (selector, scopeSelector, hostSelector) => {
    // In Android browser, the lastIndex is not reset when the regex is used in String.replace()
    _polyfillHostRe.lastIndex = 0;
    if (_polyfillHostRe.test(selector)) {
        const replaceBy = `.${hostSelector}`;
        return selector
            .replace(_polyfillHostNoCombinatorRe, (_, selector) => {
            return selector.replace(/([^:]*)(:*)(.*)/, (_, before, colon, after) => {
                return before + replaceBy + colon + after;
            });
        })
            .replace(_polyfillHostRe, replaceBy + ' ');
    }
    return scopeSelector + ' ' + selector;
};
const applyStrictSelectorScope = (selector, scopeSelector, hostSelector) => {
    const isRe = /\[is=([^\]]*)\]/g;
    scopeSelector = scopeSelector.replace(isRe, (_, ...parts) => parts[0]);
    const className = '.' + scopeSelector;
    const _scopeSelectorPart = (p) => {
        let scopedP = p.trim();
        if (!scopedP) {
            return '';
        }
        if (p.indexOf(_polyfillHostNoCombinator) > -1) {
            scopedP = applySimpleSelectorScope(p, scopeSelector, hostSelector);
        }
        else {
            // remove :host since it should be unnecessary
            const t = p.replace(_polyfillHostRe, '');
            if (t.length > 0) {
                const matches = t.match(/([^:]*)(:*)(.*)/);
                if (matches) {
                    scopedP = matches[1] + className + matches[2] + matches[3];
                }
            }
        }
        return scopedP;
    };
    const safeContent = safeSelector(selector);
    selector = safeContent.content;
    let scopedSelector = '';
    let startIndex = 0;
    let res;
    const sep = /( |>|\+|~(?!=))\s*/g;
    // If a selector appears before :host it should not be shimmed as it
    // matches on ancestor elements and not on elements in the host's shadow
    // `:host-context(div)` is transformed to
    // `-shadowcsshost-no-combinatordiv, div -shadowcsshost-no-combinator`
    // the `div` is not part of the component in the 2nd selectors and should not be scoped.
    // Historically `component-tag:host` was matching the component so we also want to preserve
    // this behavior to avoid breaking legacy apps (it should not match).
    // The behavior should be:
    // - `tag:host` -> `tag[h]` (this is to avoid breaking legacy apps, should not match anything)
    // - `tag :host` -> `tag [h]` (`tag` is not scoped because it's considered part of a
    //   `:host-context(tag)`)
    const hasHost = selector.indexOf(_polyfillHostNoCombinator) > -1;
    // Only scope parts after the first `-shadowcsshost-no-combinator` when it is present
    let shouldScope = !hasHost;
    while ((res = sep.exec(selector)) !== null) {
        const separator = res[1];
        const part = selector.slice(startIndex, res.index).trim();
        shouldScope = shouldScope || part.indexOf(_polyfillHostNoCombinator) > -1;
        const scopedPart = shouldScope ? _scopeSelectorPart(part) : part;
        scopedSelector += `${scopedPart} ${separator} `;
        startIndex = sep.lastIndex;
    }
    const part = selector.substring(startIndex);
    shouldScope = shouldScope || part.indexOf(_polyfillHostNoCombinator) > -1;
    scopedSelector += shouldScope ? _scopeSelectorPart(part) : part;
    // replace the placeholders with their original values
    return restoreSafeSelector(safeContent.placeholders, scopedSelector);
};
const scopeSelector = (selector, scopeSelectorText, hostSelector, slotSelector) => {
    return selector.split(',')
        .map(shallowPart => {
        if (slotSelector && shallowPart.indexOf('.' + slotSelector) > -1) {
            return shallowPart.trim();
        }
        if (selectorNeedsScoping(shallowPart, scopeSelectorText)) {
            return applyStrictSelectorScope(shallowPart, scopeSelectorText, hostSelector).trim();
        }
        else {
            return shallowPart.trim();
        }
    })
        .join(', ');
};
const scopeSelectors = (cssText, scopeSelectorText, hostSelector, slotSelector, commentOriginalSelector) => {
    return processRules(cssText, (rule) => {
        let selector = rule.selector;
        let content = rule.content;
        if (rule.selector[0] !== '@') {
            selector = scopeSelector(rule.selector, scopeSelectorText, hostSelector, slotSelector);
        }
        else if (rule.selector.startsWith('@media') || rule.selector.startsWith('@supports') ||
            rule.selector.startsWith('@page') || rule.selector.startsWith('@document')) {
            content = scopeSelectors(rule.content, scopeSelectorText, hostSelector, slotSelector);
        }
        const cssRule = {
            selector: selector.replace(/\s{2,}/g, ' ').trim(),
            content
        };
        return cssRule;
    });
};
const scopeCssText = (cssText, scopeId, hostScopeId, slotScopeId, commentOriginalSelector) => {
    cssText = insertPolyfillHostInCssText(cssText);
    cssText = convertColonHost(cssText);
    cssText = convertColonHostContext(cssText);
    cssText = convertColonSlotted(cssText, slotScopeId);
    cssText = convertShadowDOMSelectors(cssText);
    if (scopeId) {
        cssText = scopeSelectors(cssText, scopeId, hostScopeId, slotScopeId);
    }
    cssText = cssText.replace(/-shadowcsshost-no-combinator/g, `.${hostScopeId}`);
    cssText = cssText.replace(/>\s*\*\s+([^{, ]+)/gm, ' $1 ');
    return cssText.trim();
};
const scopeCss = (cssText, scopeId, commentOriginalSelector) => {
    const hostScopeId = scopeId + '-h';
    const slotScopeId = scopeId + '-s';
    const commentsWithHash = extractCommentsWithHash(cssText);
    cssText = stripComments(cssText);
    const orgSelectors = [];
    if (commentOriginalSelector) {
        const processCommentedSelector = (rule) => {
            const placeholder = `/*!@___${orgSelectors.length}___*/`;
            const comment = `/*!@${rule.selector}*/`;
            orgSelectors.push({ placeholder, comment });
            rule.selector = placeholder + rule.selector;
            return rule;
        };
        cssText = processRules(cssText, rule => {
            if (rule.selector[0] !== '@') {
                return processCommentedSelector(rule);
            }
            else if (rule.selector.startsWith('@media') || rule.selector.startsWith('@supports') ||
                rule.selector.startsWith('@page') || rule.selector.startsWith('@document')) {
                rule.content = processRules(rule.content, processCommentedSelector);
                return rule;
            }
            return rule;
        });
    }
    const scopedCssText = scopeCssText(cssText, scopeId, hostScopeId, slotScopeId);
    cssText = [scopedCssText, ...commentsWithHash].join('\n');
    if (commentOriginalSelector) {
        orgSelectors.forEach(({ placeholder, comment }) => {
            cssText = cssText.replace(placeholder, comment);
        });
    }
    return cssText;
};

const addNativeStaticStyle = (classMembers, cmp) => {
    if (Array.isArray(cmp.styles) && cmp.styles.length > 0) {
        if (cmp.styles.length > 1 || (cmp.styles.length === 1 && cmp.styles[0].modeName !== DEFAULT_STYLE_MODE)) {
            // multiple style modes
            addMultipleModeStyleGetter(classMembers, cmp, cmp.styles);
        }
        else {
            // single style
            addSingleStyleGetter(classMembers, cmp, cmp.styles[0]);
        }
    }
};
const addMultipleModeStyleGetter = (classMembers, cmp, styles) => {
    const styleModes = [];
    styles.forEach(style => {
        if (typeof style.styleStr === 'string') {
            // inline the style string
            // static get style() { return { "ios": "string" }; }
            const styleLiteral = createStyleLiteral(cmp, style);
            const propStr = ts$1__default.createPropertyAssignment(style.modeName, styleLiteral);
            styleModes.push(propStr);
        }
        else if (typeof style.styleIdentifier === 'string') {
            // direct import already written in the source code
            // import myTagIosStyle from './import-path.css';
            // static get style() { return { "ios": myTagIosStyle }; }
            const styleIdentifier = ts$1__default.createIdentifier(style.styleIdentifier);
            const propIdentifier = ts$1__default.createPropertyAssignment(style.modeName, styleIdentifier);
            styleModes.push(propIdentifier);
        }
        else if (Array.isArray(style.externalStyles) && style.externalStyles.length > 0) {
            // import generated from @Component() styleUrls option
            // import myTagIosStyle from './import-path.css';
            // static get style() { return { "ios": myTagIosStyle }; }
            const styleUrlIdentifier = createStyleIdentifierFromUrl(cmp, style);
            const propUrlIdentifier = ts$1__default.createPropertyAssignment(style.modeName, styleUrlIdentifier);
            styleModes.push(propUrlIdentifier);
        }
    });
    const styleObj = ts$1__default.createObjectLiteral(styleModes, true);
    classMembers.push(createStaticGetter('style', styleObj));
};
const addSingleStyleGetter = (classMembers, cmp, style) => {
    if (typeof style.styleStr === 'string') {
        // inline the style string
        // static get style() { return "string"; }
        const styleLiteral = createStyleLiteral(cmp, style);
        classMembers.push(createStaticGetter('style', styleLiteral));
    }
    else if (typeof style.styleIdentifier === 'string') {
        // direct import already written in the source code
        // import myTagStyle from './import-path.css';
        // static get style() { return myTagStyle; }
        const styleIdentifier = ts$1__default.createIdentifier(style.styleIdentifier);
        classMembers.push(createStaticGetter('style', styleIdentifier));
    }
    else if (Array.isArray(style.externalStyles) && style.externalStyles.length > 0) {
        // import generated from @Component() styleUrls option
        // import myTagStyle from './import-path.css';
        // static get style() { return myTagStyle; }
        const styleUrlIdentifier = createStyleIdentifierFromUrl(cmp, style);
        classMembers.push(createStaticGetter('style', styleUrlIdentifier));
    }
};
const createStyleLiteral = (cmp, style) => {
    if (cmp.encapsulation === 'scoped') {
        // scope the css first
        const scopeId = getScopeId(cmp.tagName, style.modeName);
        return ts$1__default.createStringLiteral(scopeCss(style.styleStr, scopeId, false));
    }
    return ts$1__default.createStringLiteral(style.styleStr);
};
const createStyleIdentifierFromUrl = (cmp, style) => {
    style.styleIdentifier = dashToPascalCase(cmp.tagName);
    style.styleIdentifier = style.styleIdentifier.charAt(0).toLowerCase() + style.styleIdentifier.substring(1);
    if (style.modeName !== DEFAULT_STYLE_MODE) {
        style.styleIdentifier += dashToPascalCase(style.modeName);
    }
    style.styleIdentifier += 'Style';
    style.externalStyles = [style.externalStyles[0]];
    return ts$1__default.createIdentifier(style.styleIdentifier);
};

const updateNativeConstructor = (classMembers, moduleFile, cmp, ensureSuper) => {
    if (cmp.isPlain) {
        return;
    }
    const cstrMethodIndex = classMembers.findIndex(m => m.kind === ts$1__default.SyntaxKind.Constructor);
    if (cstrMethodIndex >= 0) {
        // add to the existing constructor()
        const cstrMethod = classMembers[cstrMethodIndex];
        let statements = [
            ...nativeInit(moduleFile, cmp),
            ...cstrMethod.body.statements,
            ...addCreateEvents(moduleFile, cmp),
            ...addLegacyProps(moduleFile, cmp)
        ];
        if (ensureSuper) {
            const hasSuper = cstrMethod.body.statements.some(s => s.kind === ts$1__default.SyntaxKind.SuperKeyword);
            if (!hasSuper) {
                statements = [
                    createNativeConstructorSuper(),
                    ...statements
                ];
            }
        }
        classMembers[cstrMethodIndex] = ts$1__default.updateConstructor(cstrMethod, cstrMethod.decorators, cstrMethod.modifiers, cstrMethod.parameters, ts$1__default.updateBlock(cstrMethod.body, statements));
    }
    else {
        // create a constructor()
        let statements = [
            ...nativeInit(moduleFile, cmp),
            ...addCreateEvents(moduleFile, cmp),
            ...addLegacyProps(moduleFile, cmp),
        ];
        if (ensureSuper) {
            statements = [
                createNativeConstructorSuper(),
                ...statements
            ];
        }
        const cstrMethod = ts$1__default.createConstructor(undefined, undefined, undefined, ts$1__default.createBlock(statements, true));
        classMembers.unshift(cstrMethod);
    }
};
const nativeInit = (moduleFile, cmp) => {
    const initStatements = [
        nativeRegisterHostStatement(moduleFile),
    ];
    if (cmp.encapsulation === 'shadow') {
        initStatements.push(nativeAttachShadowStatement(moduleFile));
    }
    return initStatements;
};
const nativeRegisterHostStatement = (moduleFile) => {
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.registerHost);
    return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createIdentifier(REGISTER_HOST), undefined, [ts$1__default.createThis()]));
};
const nativeAttachShadowStatement = (moduleFile) => {
    addCoreRuntimeApi(moduleFile, RUNTIME_APIS.attachShadow);
    return ts$1__default.createStatement(ts$1__default.createCall(ts$1__default.createIdentifier(ATTACH_SHADOW), undefined, [ts$1__default.createThis()]));
};
const createNativeConstructorSuper = () => {
    return ts$1__default.createExpressionStatement(ts$1__default.createCall(ts$1__default.createIdentifier('super'), undefined, undefined));
};

const updateNativeComponentClass = (transformOpts, classNode, moduleFile, cmp) => {
    const heritageClauses = updateNativeHostComponentHeritageClauses(classNode, moduleFile);
    const members = updateNativeHostComponentMembers(transformOpts, classNode, moduleFile, cmp);
    return updateComponentClass(transformOpts, classNode, heritageClauses, members);
};
const updateNativeHostComponentHeritageClauses = (classNode, moduleFile) => {
    if (classNode.heritageClauses != null && classNode.heritageClauses.length > 0) {
        return classNode.heritageClauses;
    }
    if (moduleFile.cmps.length > 1) {
        addCoreRuntimeApi(moduleFile, RUNTIME_APIS.HTMLElement);
    }
    const heritageClause = ts$1__default.createHeritageClause(ts$1__default.SyntaxKind.ExtendsKeyword, [
        ts$1__default.createExpressionWithTypeArguments([], ts$1__default.createIdentifier(HTML_ELEMENT))
    ]);
    return [heritageClause];
};
const updateNativeHostComponentMembers = (transformOpts, classNode, moduleFile, cmp) => {
    const classMembers = removeStaticMetaProperties(classNode);
    updateNativeConstructor(classMembers, moduleFile, cmp, true);
    addNativeConnectedCallback(classMembers, cmp);
    addNativeElementGetter(classMembers, cmp);
    addWatchers(classMembers, cmp);
    if (transformOpts.style === 'static') {
        addNativeStaticStyle(classMembers, cmp);
    }
    transformHostData(classMembers, moduleFile);
    return classMembers;
};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var path$1 = createCommonjsModule(function (module) {
module.exports = {
  sep: '/'
};

try {
  module.exports = require('path');
} catch (e) {}
});
var path_1 = path$1.sep;

const createStencilImportPath = (type, tagName, encapsulation, modeName, importPath) => {
    const pathData = serializeStencilImportPath(type, tagName, encapsulation, modeName);
    return `${pathData}!${importPath}`;
};
const serializeStencilImportPath = (type, tagName, encapsulation, modeName) => {
    const data = {
        tag: tagName,
    };
    if (modeName && modeName !== DEFAULT_STYLE_MODE) {
        data.mode = modeName;
    }
    if (encapsulation !== 'none') {
        data.encapsulation = encapsulation;
    }
    const params = new URLSearchParams(Object.entries(data));
    params.set('type', type);
    return STENCIL_IMPORT_PREFIX + params.toString();
};
const parseStencilImportPath = (importee, importer) => {
    if (typeof importee === 'string' && typeof importee === 'string') {
        if (importee.startsWith(STENCIL_IMPORT_PREFIX) && importee.includes('!')) {
            const importeeParts = importee.split('!');
            const importData = importeeParts[0];
            const importPath = importeeParts[importeeParts.length - 1];
            const dataParts = importData.split('?');
            if (dataParts.length === 2) {
                const params = dataParts[1];
                const urlParams = new URLSearchParams(params);
                const type = urlParams.get('type');
                const data = {
                    tag: urlParams.get('tag'),
                    encapsulation: urlParams.get('encapsulation') || 'none',
                    mode: urlParams.get('mode') || DEFAULT_STYLE_MODE,
                };
                importer = normalizePath(importer);
                const importerDir = path$1.dirname(importer);
                const importerExt = getFileExt(importer.split('?')[0]);
                const resolvedFilePath = normalizePath(path$1.resolve(importerDir, importPath));
                const resolvedFileName = path$1.basename(resolvedFilePath);
                const resolvedFileExt = getFileExt(resolvedFileName);
                let resolvedId = resolvedFilePath;
                if (data.encapsulation === 'scoped' && data.mode && data.mode !== DEFAULT_STYLE_MODE) {
                    resolvedId += `?${params}`;
                }
                const r = {
                    type,
                    resolvedId,
                    resolvedFilePath,
                    resolvedFileName,
                    resolvedFileExt,
                    params,
                    data,
                    importee,
                    importer,
                    importerExt,
                };
                return r;
            }
        }
    }
    return null;
};
const STENCIL_IMPORT_PREFIX = `\0stencil?`;

const updateStyleImports = (transformOpts, tsSourceFile, moduleFile) => {
    // add style imports built from @Component() styleUrl option
    if (transformOpts.module === ts$1__default.ModuleKind.CommonJS) {
        return updateCjsStyleRequires(tsSourceFile, moduleFile);
    }
    return updateEsmStyleImports(tsSourceFile, moduleFile);
};
const updateEsmStyleImports = (tsSourceFile, moduleFile) => {
    const styleImports = [];
    let statements = tsSourceFile.statements.slice();
    let updateSourceFile = false;
    moduleFile.cmps.forEach(cmp => {
        cmp.styles.forEach(style => {
            if (typeof style.styleIdentifier === 'string') {
                updateSourceFile = true;
                if (style.externalStyles.length > 0) {
                    // add style imports built from @Component() styleUrl option
                    styleImports.push(createEsmStyleImport(tsSourceFile, cmp, style));
                }
                else {
                    // update existing esm import of a style identifier
                    statements = updateEsmStyleImportPath(tsSourceFile, statements, cmp, style);
                }
            }
        });
    });
    if (updateSourceFile) {
        let lastImportIndex = -1;
        for (let i = 0; i < statements.length; i++) {
            if (ts$1__default.isImportDeclaration(statements[i])) {
                lastImportIndex = i;
            }
        }
        statements.splice(lastImportIndex + 1, 0, ...styleImports);
        return ts$1__default.updateSourceFileNode(tsSourceFile, statements);
    }
    return tsSourceFile;
};
const updateEsmStyleImportPath = (tsSourceFile, statements, cmp, style) => {
    for (let i = 0; i < statements.length; i++) {
        const n = statements[i];
        if (ts$1__default.isImportDeclaration(n) && n.importClause && n.moduleSpecifier && ts$1__default.isStringLiteral(n.moduleSpecifier)) {
            if (n.importClause.name && n.importClause.name.escapedText === style.styleIdentifier) {
                const orgImportPath = n.moduleSpecifier.text;
                const importPath = getStyleImportPath(tsSourceFile, cmp, style, orgImportPath);
                statements[i] = ts$1__default.updateImportDeclaration(n, n.decorators, n.modifiers, n.importClause, ts$1__default.createStringLiteral(importPath));
                break;
            }
        }
    }
    return statements;
};
const createEsmStyleImport = (tsSourceFile, cmp, style) => {
    const importName = ts$1__default.createIdentifier(style.styleIdentifier);
    const importPath = getStyleImportPath(tsSourceFile, cmp, style, style.externalStyles[0].originalComponentPath);
    return ts$1__default.createImportDeclaration(undefined, undefined, ts$1__default.createImportClause(importName, undefined), ts$1__default.createLiteral(importPath));
};
const updateCjsStyleRequires = (tsSourceFile, moduleFile) => {
    const styleRequires = [];
    moduleFile.cmps.forEach(cmp => {
        cmp.styles.forEach(style => {
            if (typeof style.styleIdentifier === 'string' && style.externalStyles.length > 0) {
                // add style imports built from @Component() styleUrl option
                styleRequires.push(createCjsStyleRequire(tsSourceFile, cmp, style));
            }
        });
    });
    if (styleRequires.length > 0) {
        return ts$1__default.updateSourceFileNode(tsSourceFile, [
            ...styleRequires,
            ...tsSourceFile.statements
        ]);
    }
    return tsSourceFile;
};
const createCjsStyleRequire = (tsSourceFile, cmp, style) => {
    const importName = ts$1__default.createIdentifier(style.styleIdentifier);
    const importPath = getStyleImportPath(tsSourceFile, cmp, style, style.externalStyles[0].originalComponentPath);
    return ts$1__default.createVariableStatement(undefined, ts$1__default.createVariableDeclarationList([
        ts$1__default.createVariableDeclaration(importName, undefined, ts$1__default.createCall(ts$1__default.createIdentifier('require'), [], [ts$1__default.createLiteral(importPath)]))
    ], ts$1__default.NodeFlags.Const));
};
const getStyleImportPath = (tsSourceFile, cmp, style, importPath) => {
    const importeeDir = path$1.dirname(tsSourceFile.fileName);
    importPath = normalizePath(path$1.resolve(importeeDir, importPath));
    return `${createStencilImportPath('css', cmp.tagName, cmp.encapsulation, style.modeName, importPath)}`;
};

const transformToNativeComponentText = (compilerCtx, buildCtx, cmp, inputJsText) => {
    let outputText = null;
    const transformOpts = {
        coreImportPath: '@stencil/core',
        componentExport: null,
        componentMetadata: null,
        proxy: null,
        style: 'static'
    };
    try {
        const transpileOpts = {
            compilerOptions: {
                module: ts$1__default.ModuleKind.ESNext,
                target: getScriptTarget(),
            },
            fileName: cmp.jsFilePath,
            transformers: {
                after: [
                    nativeComponentTransform(compilerCtx, transformOpts)
                ]
            }
        };
        const transpileOutput = ts$1__default.transpileModule(inputJsText, transpileOpts);
        buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(transpileOutput.diagnostics));
        if (!buildCtx.hasError && typeof transpileOutput.outputText === 'string') {
            outputText = transpileOutput.outputText;
        }
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    return outputText;
};
const nativeComponentTransform = (compilerCtx, transformOpts) => {
    return transformCtx => {
        return tsSourceFile => {
            const moduleFile = getModuleFromSourceFile(compilerCtx, tsSourceFile);
            const visitNode = (node) => {
                if (ts$1__default.isClassDeclaration(node)) {
                    const cmp = getComponentMeta(compilerCtx, tsSourceFile, node);
                    if (cmp != null) {
                        return updateNativeComponentClass(transformOpts, node, moduleFile, cmp);
                    }
                }
                return ts$1__default.visitEachChild(node, visitNode, transformCtx);
            };
            tsSourceFile = ts$1__default.visitEachChild(tsSourceFile, visitNode, transformCtx);
            if (moduleFile.cmps.length > 0) {
                if (transformOpts.componentExport === 'customelement') {
                    // define custom element, will have no export
                    tsSourceFile = defineCustomElement(tsSourceFile, moduleFile, transformOpts);
                }
                else if (transformOpts.proxy === 'defineproperty') {
                    // exporting as a module, but also add the component proxy fn
                    tsSourceFile = addModuleMetadataProxies(tsSourceFile, moduleFile);
                }
                tsSourceFile = updateStyleImports(transformOpts, tsSourceFile, moduleFile);
            }
            if (moduleFile.isLegacy) {
                addLegacyApis(moduleFile);
            }
            tsSourceFile = addImports(transformOpts, tsSourceFile, moduleFile.coreRuntimeApis, transformOpts.coreImportPath);
            return tsSourceFile;
        };
    };
};

const updateToNativeComponent = async (config, compilerCtx, buildCtx, cmp) => {
    const inputFilePath = cmp.jsFilePath;
    const inputFileDir = config.sys.path.dirname(inputFilePath);
    const inputFileName = config.sys.path.basename(inputFilePath);
    const inputJsText = await compilerCtx.fs.readFile(inputFilePath);
    const cacheKey = await compilerCtx.cache.createKey('native', COMPILER_BUILD.id, COMPILER_BUILD.transpiler, inputJsText);
    const outputFileName = `${cacheKey}-${inputFileName}`;
    const outputFilePath = config.sys.path.join(inputFileDir, outputFileName);
    let outputJsText = await compilerCtx.cache.get(cacheKey);
    if (outputJsText == null) {
        outputJsText = transformToNativeComponentText(compilerCtx, buildCtx, cmp, inputJsText);
        await compilerCtx.cache.put(cacheKey, outputJsText);
    }
    await compilerCtx.fs.writeFile(outputFilePath, outputJsText, { inMemoryOnly: true });
    return {
        filePath: outputFilePath,
        exportLine: createComponentExport$1(cmp, outputFilePath),
        cmp
    };
};
const createComponentExport$1 = (cmp, lazyModuleFilePath) => {
    const originalClassName = cmp.componentClassName;
    const pascalCasedClassName = dashToPascalCase(cmp.tagName);
    const filePath = normalizePath(lazyModuleFilePath);
    return `export { ${originalClassName} as ${pascalCasedClassName} } from '${filePath}';`;
};

const componentEntryPlugin = (config, compilerCtx, buildCtx, build, entryModules) => {
    const entrys = new Map();
    return {
        name: 'componentEntryPlugin',
        resolveId(id) {
            if (typeof id === 'string') {
                const entryModule = entryModules.find(entryModule => entryModule.entryKey === id);
                if (entryModule != null) {
                    entrys.set(id, entryModule);
                    return {
                        id,
                    };
                }
            }
            return null;
        },
        async load(id) {
            const entryModule = entrys.get(id);
            if (entryModule != null) {
                const modules = await Promise.all(build.lazyLoad
                    ? entryModule.cmps.map(cmp => updateToLazyComponent(config, compilerCtx, buildCtx, cmp))
                    : entryModule.cmps.map(cmp => updateToNativeComponent(config, compilerCtx, buildCtx, cmp)));
                return modules
                    .map(lazyModule => lazyModule.exportLine)
                    .join('\n');
            }
            return null;
        }
    };
};

async function optimizeModule(config, compilerCtx, sourceTarget, isCore, input) {
    const isDebug = (config.logLevel === 'debug');
    const opts = getTerserOptions(sourceTarget, isDebug);
    if (sourceTarget !== 'es5' && isCore) {
        if (!isDebug) {
            opts.compress.passes = 3;
            opts.compress.global_defs = {
                supportsListenerOptions: true,
                'plt.$cssShim$': false
            };
            opts.compress.pure_funcs = ['getHostRef', ...opts.compress.pure_funcs];
        }
        opts.mangle.properties = {
            regex: '^\\$.+\\$$',
            debug: isDebug
        };
    }
    let cacheKey;
    if (compilerCtx) {
        cacheKey = await compilerCtx.cache.createKey('minifyModule', COMPILER_BUILD.id, opts, input);
        const cachedContent = await compilerCtx.cache.get(cacheKey);
        if (cachedContent != null) {
            return {
                output: cachedContent,
                diagnostics: []
            };
        }
    }
    const results = await config.sys.minifyJs(input, opts);
    if (results != null && typeof results.output === 'string' && results.diagnostics.length === 0 && compilerCtx != null) {
        if (isCore) {
            results.output = results.output
                .replace(/disconnectedCallback\(\)\{\}/g, '');
        }
        await compilerCtx.cache.put(cacheKey, results.output);
    }
    return results;
}
const getTerserOptions = (sourceTarget, isDebug) => {
    const opts = {
        safari10: true,
        output: {},
    };
    if (sourceTarget === 'es5') {
        opts.ecma = opts.output.ecma = 5;
        opts.compress = false;
        opts.mangle = true;
    }
    else {
        opts.mangle = {
            properties: {
                regex: '^\\$.+\\$$'
            }
        };
        opts.compress = {
            pure_getters: true,
            keep_fargs: false,
            passes: 2,
            pure_funcs: [
                'console.debug'
            ]
        };
        opts.ecma = opts.output.ecma = opts.compress.ecma = 7;
        opts.toplevel = true;
        opts.module = true;
        opts.compress.toplevel = true;
        opts.mangle.toplevel = true;
        opts.compress.arrows = true;
        opts.compress.module = true;
    }
    if (isDebug) {
        opts.mangle = { keep_fnames: true };
        opts.compress = {};
        opts.compress.drop_console = false;
        opts.compress.drop_debugger = false;
        opts.compress.pure_funcs = [];
        opts.output.beautify = true;
        opts.output.indent_level = 2;
        opts.output.comments = 'all';
    }
    return opts;
};

const getCompileOptions = (input, filePath) => {
    const rtn = {
        componentExport: getConfig(input.componentExport, VALID_EXPORT, 'customelement'),
        componentMetadata: getConfig(input.componentMetadata, VALID_METADATA, null),
        proxy: getConfig(input.proxy, VALID_PROXY, 'defineproperty'),
        module: getConfig(input.module, VALID_MODULE, 'esm'),
        script: getConfig(input.script, VALID_SCRIPT, 'es2017'),
        style: getConfig(input.style, VALID_STYLE, 'static'),
        data: input.data ? Object.assign({}, input.data) : null,
        type: input.type
    };
    if (rtn.type == null) {
        const fileName = path$1.basename(filePath).trim().toLowerCase();
        if (fileName.endsWith('.d.ts')) {
            rtn.type = 'dts';
        }
        else if (fileName.endsWith('.tsx')) {
            rtn.type = 'tsx';
        }
        else if (fileName.endsWith('.ts')) {
            rtn.type = 'ts';
        }
        else if (fileName.endsWith('.jsx')) {
            rtn.type = 'jsx';
        }
        else if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
            rtn.type = 'js';
        }
        else if (fileName.endsWith('.css') && rtn.data != null) {
            rtn.type = 'css';
        }
    }
    return rtn;
};
const getConfig = (value, validValues, defaultValue) => {
    if (value === 'null') {
        return null;
    }
    value = (typeof value === 'string' ? value.toLowerCase().trim() : null);
    if (validValues.has(value)) {
        return value;
    }
    return defaultValue;
};
const VALID_PROXY = new Set(['defineproperty', null]);
const VALID_METADATA = new Set(['compilerstatic', null]);
const VALID_EXPORT = new Set(['customelement', 'module']);
const VALID_MODULE = new Set(['esm', 'cjs']);
const VALID_SCRIPT = new Set(['latest', 'esnext', 'es2017', 'es2015', 'es5']);
const VALID_STYLE = new Set(['static']);
const getTransformOptions = (compilerOpts) => {
    const transformOpts = {
        // best we always set this to true
        allowSyntheticDefaultImports: true,
        // best we always set this to true
        esModuleInterop: true,
        // always get source maps
        sourceMap: true,
        // isolated per file transpiling
        isolatedModules: true,
        // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
        suppressOutputPathCheck: true,
        // Filename can be non-ts file.
        allowNonTsExtensions: true,
        // We are not returning a sourceFile for lib file when asked by the program,
        // so pass --noLib to avoid reporting a file not found error.
        noLib: true,
        noResolve: true,
        coreImportPath: '@stencil/core/internal/client',
        componentExport: null,
        componentMetadata: compilerOpts.componentMetadata,
        proxy: compilerOpts.proxy,
        style: compilerOpts.style
    };
    if (compilerOpts.module === 'cjs' || compilerOpts.module === 'commonjs') {
        compilerOpts.module = 'cjs';
        transformOpts.module = ts$1__default.ModuleKind.CommonJS;
    }
    else {
        compilerOpts.module = 'esm';
        transformOpts.module = ts$1__default.ModuleKind.ESNext;
    }
    if (compilerOpts.script === 'esnext') {
        transformOpts.target = ts$1__default.ScriptTarget.ESNext;
    }
    else if (compilerOpts.script === 'latest') {
        transformOpts.target = ts$1__default.ScriptTarget.Latest;
    }
    else if (compilerOpts.script === 'es2015') {
        transformOpts.target = ts$1__default.ScriptTarget.ES2015;
    }
    else if (compilerOpts.script === 'es5') {
        transformOpts.target = ts$1__default.ScriptTarget.ES5;
    }
    else {
        transformOpts.target = ts$1__default.ScriptTarget.ES2017;
        compilerOpts.script = 'es2017';
    }
    if (compilerOpts.componentExport === 'lazy') {
        transformOpts.componentExport = 'lazy';
    }
    else if (compilerOpts.componentExport === 'module') {
        transformOpts.componentExport = 'native';
    }
    else {
        transformOpts.componentExport = 'customelement';
    }
    return transformOpts;
};
const getCompilerConfig = () => {
    const config = {
        cwd: '/',
        rootDir: '/',
        srcDir: '/',
        devMode: true,
        _isTesting: true,
        validateTypes: false,
        enableCache: false,
        sys: {
            path: path$1
        }
    };
    return config;
};

const addComponentMetaStatic = (cmpNode, cmpMeta) => {
    const publicCompilerMeta = getPublicCompilerMeta(cmpMeta);
    const cmpMetaStaticProp = createStaticGetter('COMPILER_META', convertValueToLiteral(publicCompilerMeta));
    const classMembers = [...cmpNode.members, cmpMetaStaticProp];
    return ts$1__default.updateClassDeclaration(cmpNode, cmpNode.decorators, cmpNode.modifiers, cmpNode.name, cmpNode.typeParameters, cmpNode.heritageClauses, classMembers);
};
const getPublicCompilerMeta = (cmpMeta) => {
    const publicCompilerMeta = Object.assign({}, cmpMeta);
    // no need to copy all compiler meta data
    delete publicCompilerMeta.assetsDirs;
    delete publicCompilerMeta.dependencies;
    delete publicCompilerMeta.excludeFromCollection;
    delete publicCompilerMeta.isCollectionDependency;
    delete publicCompilerMeta.docs;
    delete publicCompilerMeta.jsFilePath;
    delete publicCompilerMeta.potentialCmpRefs;
    delete publicCompilerMeta.styleDocs;
    delete publicCompilerMeta.sourceFilePath;
    return publicCompilerMeta;
};

const ts = {};
const initTypescript = () => {
    if (!ts.transform) {
        if (globalThis.ts) {
            // doing this so we can lazy load "ts"
            Object.assign(ts, globalThis.ts);
        }
        else {
            throw new Error(`typescript: missing global "ts" variable`);
        }
    }
    if (!ts.sys) {
        ts.sys = {
            args: [],
            newLine: '\n',
            useCaseSensitiveFileNames: false,
            write(s) {
                console.log(s);
            },
            readFile(_p, _encoding) {
                throw new Error('ts.sys.readFile not implemented');
            },
            writeFile(_p, _data, _writeByteOrderMark) {
                throw new Error('ts.sys.writeFile not implemented');
            },
            resolvePath(p) {
                return path$1.resolve(p);
            },
            fileExists(_p) {
                throw new Error('ts.sys.fileExists not implemented');
            },
            directoryExists(_p) {
                throw new Error('ts.sys.directoryExists not implemented');
            },
            createDirectory(_p) {
                throw new Error('ts.sys.createDirectory not implemented');
            },
            getExecutingFilePath() {
                return location.href;
            },
            getCurrentDirectory() {
                return '/';
            },
            getDirectories(_path) {
                return [];
            },
            readDirectory(_path, _extensions, _exclude, _include, _depth) {
                return [];
            },
            exit(exitCode) {
                console.log('typescript exit:', exitCode);
            }
        };
    }
};

const getStyleId = (cmp, modeName, isScopedStyles) => {
    return `${cmp.tagName}${modeName}${isScopedStyles ? '.sc' : ''}`;
};
const escapeCssForJs = (style) => {
    if (typeof style === 'string') {
        return style
            .replace(/\\[\D0-7]/g, (v) => '\\' + v)
            .replace(/\r\n|\r|\n/g, `\\n`)
            .replace(/\"/g, `\\"`)
            .replace(/\'/g, `\\'`)
            .replace(/\@/g, `\\@`);
    }
    return style;
};
const requiresScopedStyles = (encapsulation, commentOriginalSelector) => {
    return (encapsulation === 'scoped' || (encapsulation === 'shadow' && commentOriginalSelector));
};
const PLUGIN_HELPERS = [
    {
        pluginName: 'PostCSS',
        pluginId: 'postcss',
        pluginExts: ['pcss']
    },
    {
        pluginName: 'Sass',
        pluginId: 'sass',
        pluginExts: ['scss', 'sass']
    },
    {
        pluginName: 'Stylus',
        pluginId: 'stylus',
        pluginExts: ['styl', 'stylus']
    }, {
        pluginName: 'Less',
        pluginId: 'less',
        pluginExts: ['less']
    }
];
const stripComments$1 = (input) => {
    let isInsideString = null;
    let currentCharacter = '';
    let returnValue = '';
    for (let i = 0; i < input.length; i++) {
        currentCharacter = input[i];
        if (input[i - 1] !== '\\') {
            if (currentCharacter === '"' || currentCharacter === '\'') {
                if (isInsideString === currentCharacter) {
                    isInsideString = null;
                }
                else if (!isInsideString) {
                    isInsideString = currentCharacter;
                }
            }
        }
        // Find beginning of /* type comment
        if (!isInsideString && currentCharacter === '/' && input[i + 1] === '*') {
            // Ignore important comment when configured to preserve comments using important syntax: /*!
            let j = i + 2;
            // Iterate over comment
            for (; j < input.length; j++) {
                // Find end of comment
                if (input[j] === '*' && input[j + 1] === '/') {
                    break;
                }
            }
            // Resume iteration over CSS string from the end of the comment
            i = j + 1;
            continue;
        }
        returnValue += currentCharacter;
    }
    return returnValue;
};

const transformCssToEsm = (config, cssText, filePath, tagName, encapsulation, modeName) => {
    if (encapsulation === 'scoped') {
        const scopeId = getScopeId(tagName, modeName);
        cssText = scopeCss(cssText, scopeId, false);
    }
    const defaultVarName = createVarName(filePath, modeName);
    const varNames = new Set([defaultVarName]);
    const esmImports = [];
    const cssImports = getCssImports(config, varNames, cssText, filePath, modeName);
    cssImports.forEach(cssImport => {
        // remove the original css @imports
        cssText = cssText = cssText.replace(cssImport.srcImportText, '');
        const importPath = createStencilImportPath('css', tagName, encapsulation, modeName, cssImport.filePath);
        esmImports.push(`import ${cssImport.varName} from '${importPath}';`);
    });
    const output = [
        esmImports.join('\n')
    ];
    output.push(`const ${defaultVarName} = `);
    cssImports.forEach(cssImport => {
        output.push(`${cssImport.varName} + `);
    });
    output.push(`${JSON.stringify(cssText)};`);
    output.push(`\nexport default ${defaultVarName};`);
    return {
        code: output.join(''),
        map: null
    };
};
const getCssImports = (config, varNames, cssText, filePath, modeName) => {
    const cssImports = [];
    if (!cssText.includes('@import')) {
        // no @import at all, so don't bother
        return cssImports;
    }
    cssText = stripComments$1(cssText);
    const dir = path$1.dirname(filePath);
    let r;
    while (r = CSS_IMPORT_RE.exec(cssText)) {
        const cssImportData = {
            srcImportText: r[0],
            url: r[4].replace(/[\"\'\)]/g, ''),
            filePath: null,
            varName: null
        };
        if (!isLocalCssImport(cssImportData.srcImportText)) {
            // do nothing for @import url(http://external.css)
            config.logger.debug(`did not resolve external css @import: ${cssImportData.srcImportText}`);
            continue;
        }
        else if (isCssNodeModule(cssImportData.url)) {
            // do not resolve this path cuz it starts with node resolve id ~
            continue;
        }
        else if (path$1.isAbsolute(cssImportData.url)) {
            // absolute path already
            cssImportData.filePath = normalizePath(cssImportData.url);
        }
        else {
            // relative path
            cssImportData.filePath = normalizePath(path$1.resolve(dir, cssImportData.url));
        }
        cssImportData.varName = createVarName(filePath, modeName);
        if (varNames.has(cssImportData.varName)) {
            cssImportData.varName += (varNames.size);
        }
        varNames.add(cssImportData.varName);
        cssImports.push(cssImportData);
    }
    return cssImports;
};
const CSS_IMPORT_RE = /(@import)\s+(url\()?\s?(.*?)\s?\)?([^;]*);?/gi;
const isCssNodeModule = (url) => {
    return url.startsWith('~');
};
const isLocalCssImport = (srcImport) => {
    srcImport = srcImport.toLowerCase();
    if (srcImport.includes('url(')) {
        srcImport = srcImport.replace(/\"/g, '');
        srcImport = srcImport.replace(/\'/g, '');
        srcImport = srcImport.replace(/\s/g, '');
        if (srcImport.includes('url(http') || srcImport.includes('url(//')) {
            return false;
        }
    }
    return true;
};
const createVarName = (filePath, modeName) => {
    let varName = path$1.basename(filePath).toLowerCase();
    varName = varName.replace(/[|&;$%@"<>()+,.{}_]/g, '-');
    if (modeName && modeName !== DEFAULT_STYLE_MODE && !varName.includes(modeName)) {
        varName = modeName + '-' + varName;
    }
    varName = dashToPascalCase(varName);
    return varName.trim();
};

class BuildEvents {
    constructor() {
        this.evCallbacks = new Map();
    }
    subscribe(eventName, cb) {
        const evName = getEventName(eventName);
        const callbacks = this.evCallbacks.get(evName);
        if (callbacks == null) {
            this.evCallbacks.set(evName, [cb]);
        }
        else {
            callbacks.push(cb);
        }
        return () => {
            this.unsubscribe(evName, cb);
        };
    }
    unsubscribe(eventName, cb) {
        const callbacks = this.evCallbacks.get(getEventName(eventName));
        if (callbacks != null) {
            const index = callbacks.indexOf(cb);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    unsubscribeAll() {
        this.evCallbacks.clear();
    }
    emit(eventName, ...args) {
        const callbacks = this.evCallbacks.get(getEventName(eventName));
        if (callbacks != null) {
            callbacks.forEach(cb => {
                try {
                    cb.apply(this, args);
                }
                catch (e) {
                    console.log(e);
                }
            });
        }
    }
}
const getEventName = (evName) => {
    return evName.trim().toLowerCase();
};

/**
 * The CompilerCtx is a persistent object that's reused throughout
 * all builds and rebuilds. The data within this object is used
 * for in-memory caching, and can be reset, but the object itself
 * is always the same.
 */
class CompilerContext {
    constructor(config) {
        this.activeBuildId = -1;
        this.activeFilesAdded = [];
        this.activeFilesDeleted = [];
        this.activeFilesUpdated = [];
        this.activeDirsAdded = [];
        this.activeDirsDeleted = [];
        this.cachedStyleMeta = new Map();
        this.collections = [];
        this.compilerOptions = null;
        this.events = new BuildEvents();
        this.fsWatcher = null;
        this.hasFsWatcherEvents = false;
        this.hasLoggedServerUrl = false;
        this.hasSuccessfulBuild = false;
        this.isActivelyBuilding = false;
        this.lastBuildResults = null;
        this.lastBuildStyles = new Map();
        this.lastComponentStyleInput = new Map();
        this.moduleMap = new Map();
        this.nodeMap = new WeakMap();
        this.resolvedCollections = new Set();
        this.rollupCacheHydrate = null;
        this.rollupCacheLazy = null;
        this.rollupCacheNative = null;
        this.rootTsFiles = [];
        this.tsService = null;
        this.styleModeNames = new Set();
        const cacheFs = (config.enableCache && config.sys.fs != null) ? new InMemoryFileSystem(config.sys.fs, config.sys.path) : null;
        this.cache = new Cache(config, cacheFs);
        this.cache.initCacheDir();
        this.fs = (config.sys.fs != null ? new InMemoryFileSystem(config.sys.fs, config.sys.path) : null);
    }
    reset() {
        this.cache.clear();
        this.cachedStyleMeta.clear();
        this.cachedGlobalStyle = null;
        this.collections.length = 0;
        this.compilerOptions = null;
        this.lastComponentStyleInput.clear();
        this.rollupCacheHydrate = null;
        this.rollupCacheLazy = null;
        this.rollupCacheNative = null;
        this.moduleMap.clear();
        this.resolvedCollections.clear();
        this.rootTsFiles.length = 0;
        this.tsService = null;
        if (this.fs != null) {
            this.fs.clearCache();
        }
    }
}
const getModule = (config, compilerCtx, sourceFilePath) => {
    sourceFilePath = normalizePath(sourceFilePath);
    const moduleFile = compilerCtx.moduleMap.get(sourceFilePath);
    if (moduleFile != null) {
        return moduleFile;
    }
    else {
        const sourceFileDir = config.sys.path.dirname(sourceFilePath);
        const sourceFileExt = config.sys.path.extname(sourceFilePath);
        const sourceFileName = config.sys.path.basename(sourceFilePath, sourceFileExt);
        const jsFilePath = config.sys.path.join(sourceFileDir, sourceFileName + '.js');
        const moduleFile = {
            sourceFilePath: sourceFilePath,
            jsFilePath: jsFilePath,
            cmps: [],
            coreRuntimeApis: [],
            collectionName: null,
            dtsFilePath: null,
            excludeFromCollection: false,
            externalImports: [],
            hasVdomAttribute: false,
            hasVdomXlink: false,
            hasVdomClass: false,
            hasVdomFunctional: false,
            hasVdomKey: false,
            hasVdomListener: false,
            hasVdomRef: false,
            hasVdomRender: false,
            hasVdomStyle: false,
            hasVdomText: false,
            htmlAttrNames: [],
            htmlTagNames: [],
            isCollectionDependency: false,
            isLegacy: false,
            localImports: [],
            originalCollectionComponentPath: null,
            originalImports: [],
            potentialCmpRefs: []
        };
        compilerCtx.moduleMap.set(sourceFilePath, moduleFile);
        return moduleFile;
    }
};
const resetModule = (moduleFile) => {
    moduleFile.cmps.length = 0;
    moduleFile.coreRuntimeApis.length = 0;
    moduleFile.collectionName = null;
    moduleFile.dtsFilePath = null;
    moduleFile.excludeFromCollection = false;
    moduleFile.externalImports.length = 0;
    moduleFile.isCollectionDependency = false;
    moduleFile.localImports.length = 0;
    moduleFile.originalCollectionComponentPath = null;
    moduleFile.originalImports.length = 0;
    moduleFile.hasVdomXlink = false;
    moduleFile.hasVdomAttribute = false;
    moduleFile.hasVdomClass = false;
    moduleFile.hasVdomFunctional = false;
    moduleFile.hasVdomKey = false;
    moduleFile.hasVdomListener = false;
    moduleFile.hasVdomRef = false;
    moduleFile.hasVdomRender = false;
    moduleFile.hasVdomStyle = false;
    moduleFile.hasVdomText = false;
    moduleFile.htmlAttrNames.length = 0;
    moduleFile.htmlTagNames.length = 0;
    moduleFile.potentialCmpRefs.length = 0;
};

const styleToStatic = (config, newMembers, componentOptions) => {
    const defaultModeStyles = [];
    if (componentOptions.styleUrls) {
        if (Array.isArray(componentOptions.styleUrls)) {
            defaultModeStyles.push(...normalizeStyleUrl(componentOptions.styleUrls));
        }
        else {
            defaultModeStyles.push(...normalizeStyleUrl(componentOptions.styleUrls[DEFAULT_STYLE_MODE]));
        }
    }
    if (componentOptions.styleUrl) {
        defaultModeStyles.push(...normalizeStyleUrl(componentOptions.styleUrl));
    }
    let styleUrls = {};
    if (componentOptions.styleUrls && !Array.isArray(componentOptions.styleUrls)) {
        styleUrls = normalizeStyleUrls(componentOptions.styleUrls);
    }
    if (defaultModeStyles.length > 0) {
        styleUrls[DEFAULT_STYLE_MODE] = defaultModeStyles;
    }
    if (Object.keys(styleUrls).length > 0) {
        const originalStyleUrls = convertValueToLiteral(styleUrls);
        newMembers.push(createStaticGetter('originalStyleUrls', originalStyleUrls));
        const norlizedStyleExt = normalizeExtension(config, styleUrls);
        const normalizedStyleExp = convertValueToLiteral(norlizedStyleExt);
        newMembers.push(createStaticGetter('styleUrls', normalizedStyleExp));
    }
    if (typeof componentOptions.styles === 'string') {
        const styles = componentOptions.styles.trim();
        if (styles.length > 0) {
            newMembers.push(createStaticGetter('styles', ts$1__default.createLiteral(styles)));
        }
    }
    else if (componentOptions.styles) {
        const convertIdentifier = componentOptions.styles;
        if (convertIdentifier.__identifier) {
            newMembers.push(createStaticGetter('styles', ts$1__default.createIdentifier(convertIdentifier.__escapedText)));
        }
    }
};
const normalizeExtension = (config, styleUrls) => {
    const compilerStyleUrls = {};
    Object.keys(styleUrls).forEach(key => {
        compilerStyleUrls[key] = styleUrls[key].map(s => useCss(config, s));
    });
    return compilerStyleUrls;
};
const useCss = (config, stylePath) => {
    const sourceFileDir = config.sys.path.dirname(stylePath);
    const sourceFileExt = config.sys.path.extname(stylePath);
    const sourceFileName = config.sys.path.basename(stylePath, sourceFileExt);
    return config.sys.path.join(sourceFileDir, sourceFileName + '.css');
};
const normalizeStyleUrls = (styleUrls) => {
    const compilerStyleUrls = {};
    Object.keys(styleUrls).forEach(key => {
        compilerStyleUrls[key] = normalizeStyleUrl(styleUrls[key]);
    });
    return compilerStyleUrls;
};
const normalizeStyleUrl = (style) => {
    if (Array.isArray(style)) {
        return style;
    }
    if (style) {
        return [style];
    }
    return [];
};

const componentDecoratorToStatic = (config, typeChecker, diagnostics, cmpNode, newMembers, componentDecorator) => {
    removeDecorators(cmpNode, CLASS_DECORATORS_TO_REMOVE);
    const [componentOptions] = getDeclarationParameters(componentDecorator);
    if (!componentOptions) {
        return;
    }
    if (!validateComponent(config, diagnostics, typeChecker, componentOptions, cmpNode, componentDecorator)) {
        return;
    }
    newMembers.push(createStaticGetter('is', convertValueToLiteral(componentOptions.tag.trim())));
    if (componentOptions.shadow) {
        newMembers.push(createStaticGetter('encapsulation', convertValueToLiteral('shadow')));
    }
    else if (componentOptions.scoped) {
        newMembers.push(createStaticGetter('encapsulation', convertValueToLiteral('scoped')));
    }
    styleToStatic(config, newMembers, componentOptions);
    let assetsDirs = componentOptions.assetsDirs || [];
    if (componentOptions.assetsDir) {
        assetsDirs = [
            ...assetsDirs,
            componentOptions.assetsDir,
        ];
    }
    if (assetsDirs.length > 0) {
        newMembers.push(createStaticGetter('assetsDirs', convertValueToLiteral(assetsDirs)));
    }
};
const validateComponent = (config, diagnostics, typeChecker, componentOptions, cmpNode, componentDecorator) => {
    const extendNode = cmpNode.heritageClauses && cmpNode.heritageClauses.find(c => c.token === ts$1__default.SyntaxKind.ExtendsKeyword);
    if (extendNode) {
        const err = buildError(diagnostics);
        err.messageText = `Classes decorated with @Component can not extend from a base class.
    Stencil needs to be able to switch between different base classes in order to implement the different output targets such as: lazy and raw web components.`;
        augmentDiagnosticWithNode(config, err, extendNode);
        return false;
    }
    if (componentOptions.shadow && componentOptions.scoped) {
        const err = buildError(diagnostics);
        err.messageText = `Components cannot be "scoped" and "shadow" at the same time, they are mutually exclusive configurations.`;
        augmentDiagnosticWithNode(config, err, findTagNode('scoped', componentDecorator));
        return false;
    }
    const constructor = cmpNode.members.find(ts$1__default.isConstructorDeclaration);
    if (constructor && constructor.parameters.length > 0) {
        const err = buildError(diagnostics);
        err.messageText = `Classes decorated with @Component can not have a "constructor" that takes arguments.
    All data required by a component must be passed by using class properties decorated with @Prop()`;
        augmentDiagnosticWithNode(config, err, constructor.parameters[0]);
        return false;
    }
    // check if class has more than one decorator
    const otherDecorator = cmpNode.decorators && cmpNode.decorators.find(d => d !== componentDecorator);
    if (otherDecorator) {
        const err = buildError(diagnostics);
        err.messageText = `Classes decorated with @Component can not be decorated with more decorators.
    Stencil performs extensive static analysis on top of your components in order to generate the necessary metadata, runtime decorators at the components level make this task very hard.`;
        augmentDiagnosticWithNode(config, err, otherDecorator);
        return false;
    }
    const tag = componentOptions.tag;
    if (typeof tag !== 'string' || tag.trim().length === 0) {
        const err = buildError(diagnostics);
        err.messageText = `tag missing in component decorator`;
        augmentDiagnosticWithNode(config, err, componentDecorator);
        return false;
    }
    const tagError = validateComponentTag(tag);
    if (tagError) {
        const err = buildError(diagnostics);
        err.messageText = `${tagError}. Please refer to https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name for more info.`;
        augmentDiagnosticWithNode(config, err, findTagNode('tag', componentDecorator));
        return false;
    }
    if (!config._isTesting) {
        const nonTypeExports = typeChecker.getExportsOfModule(typeChecker.getSymbolAtLocation(cmpNode.getSourceFile()))
            .filter(symbol => (symbol.flags & (ts$1__default.SymbolFlags.Interface | ts$1__default.SymbolFlags.TypeAlias)) === 0)
            .filter(symbol => symbol.name !== cmpNode.name.text);
        nonTypeExports.forEach(symbol => {
            const err = buildError(diagnostics);
            err.messageText = `To allow efficient bundling, modules using @Component() can only have a single export which is the component class itself.
      Any other exports should be moved to a separate file.
      For further information check out: https://stenciljs.com/docs/module-bundling`;
            const errorNode = symbol.valueDeclaration
                ? symbol.valueDeclaration
                : symbol.declarations[0];
            augmentDiagnosticWithNode(config, err, errorNode);
        });
        if (nonTypeExports.length > 0) {
            return false;
        }
    }
    return true;
};
const findTagNode = (propName, node) => {
    if (ts$1__default.isDecorator(node) && ts$1__default.isCallExpression(node.expression)) {
        const arg = node.expression.arguments[0];
        if (ts$1__default.isObjectLiteralExpression(arg)) {
            arg.properties.forEach(p => {
                if (ts$1__default.isPropertyAssignment(p)) {
                    if (p.name.getText() === propName) {
                        node = p.initializer;
                    }
                }
            });
        }
    }
    return node;
};

const elementDecoratorsToStatic = (diagnostics, decoratedMembers, typeChecker, newMembers) => {
    const elementRefs = decoratedMembers
        .filter(ts$1__default.isPropertyDeclaration)
        .map(prop => parseElementDecorator(diagnostics, typeChecker, prop))
        .filter(element => !!element);
    if (elementRefs.length > 0) {
        newMembers.push(createStaticGetter('elementRef', ts$1__default.createLiteral(elementRefs[0])));
        if (elementRefs.length > 1) {
            const error = buildError(diagnostics);
            error.messageText = `It's not valid to add more than one Element() decorator`;
        }
    }
};
const parseElementDecorator = (_diagnostics, _typeChecker, prop) => {
    const elementDecorator = prop.decorators && prop.decorators.find(isDecoratorNamed('Element'));
    if (elementDecorator == null) {
        return null;
    }
    return prop.name.getText();
};

const eventDecoratorsToStatic = (config, diagnostics, decoratedProps, typeChecker, newMembers) => {
    const events = decoratedProps
        .filter(ts$1__default.isPropertyDeclaration)
        .map(prop => parseEventDecorator(config, diagnostics, typeChecker, prop))
        .filter(ev => !!ev);
    if (events.length > 0) {
        newMembers.push(createStaticGetter('events', convertValueToLiteral(events)));
    }
};
const parseEventDecorator = (config, diagnostics, typeChecker, prop) => {
    const eventDecorator = prop.decorators.find(isDecoratorNamed('Event'));
    if (eventDecorator == null) {
        return null;
    }
    const [opts] = getDeclarationParameters(eventDecorator);
    const memberName = prop.name.getText();
    if (!memberName) {
        return null;
    }
    const symbol = typeChecker.getSymbolAtLocation(prop.name);
    const name = getEventName$1(opts, memberName);
    validateEventName(config, diagnostics, prop.name, name);
    const eventMeta = {
        method: memberName,
        name,
        bubbles: opts && typeof opts.bubbles === 'boolean' ? opts.bubbles : true,
        cancelable: opts && typeof opts.cancelable === 'boolean' ? opts.cancelable : true,
        composed: opts && typeof opts.composed === 'boolean' ? opts.composed : true,
        docs: serializeSymbol(typeChecker, symbol),
        complexType: getComplexType(typeChecker, prop)
    };
    validateReferences(config, diagnostics, eventMeta.complexType.references, prop.type);
    return eventMeta;
};
const getEventName$1 = (eventOptions, memberName) => {
    if (eventOptions && typeof eventOptions.eventName === 'string' && eventOptions.eventName.trim().length > 0) {
        // always use the event name if given
        return eventOptions.eventName.trim();
    }
    return memberName;
};
const getComplexType = (typeChecker, node) => {
    const sourceFile = node.getSourceFile();
    const eventType = node.type ? getEventType(node.type) : null;
    return {
        original: eventType ? eventType.getText() : 'any',
        resolved: eventType ? resolveType(typeChecker, typeChecker.getTypeFromTypeNode(eventType)) : 'any',
        references: eventType ? getAttributeTypeInfo(eventType, sourceFile) : {}
    };
};
const getEventType = (type) => {
    if (ts$1__default.isTypeReferenceNode(type) &&
        ts$1__default.isIdentifier(type.typeName) &&
        type.typeName.text === 'EventEmitter' &&
        type.typeArguments &&
        type.typeArguments.length > 0) {
        return type.typeArguments[0];
    }
    return null;
};
const validateEventName = (config, diagnostics, node, eventName) => {
    if (/^[A-Z]/.test(eventName)) {
        const diagnostic = buildWarn(diagnostics);
        diagnostic.messageText = [
            `In order to be compatible with all event listeners on elements, the event name `,
            `cannot start with a capital letter. `,
            `Please lowercase the first character for the event to best work with all listeners.`
        ].join('');
        augmentDiagnosticWithNode(config, diagnostic, node);
        return;
    }
    if (/^on[A-Z]/.test(eventName)) {
        const warn = buildWarn(diagnostics);
        warn.messageText = `Events decorated with @Event() should describe the actual DOM event name, not the handler. In other words "${eventName}" would be better named as "${suggestEventName(eventName)}".`;
        augmentDiagnosticWithNode(config, warn, node);
        return;
    }
    if (DOM_EVENT_NAMES.has(eventName.toLowerCase())) {
        const diagnostic = buildWarn(diagnostics);
        diagnostic.messageText = `The event name conflicts with the "${eventName}" native DOM event name.`;
        augmentDiagnosticWithNode(config, diagnostic, node);
        return;
    }
};
function suggestEventName(onEvent) {
    return onEvent[2].toLowerCase() + onEvent.slice(3);
}
const DOM_EVENT_NAMES = new Set([
    'CheckboxStateChange',
    'DOMContentLoaded',
    'DOMMenuItemActive',
    'DOMMenuItemInactive',
    'DOMMouseScroll',
    'MSManipulationStateChanged',
    'MSPointerHover',
    'MozAudioAvailable',
    'MozGamepadButtonDown',
    'MozGamepadButtonUp',
    'MozMousePixelScroll',
    'MozOrientation',
    'MozScrolledAreaChanged',
    'RadioStateChange',
    'SVGAbort',
    'SVGError',
    'SVGLoad',
    'SVGResize',
    'SVGScroll',
    'SVGUnload',
    'SVGZoom',
    'ValueChange',
    'abort',
    'afterprint',
    'afterscriptexecute',
    'alerting',
    'animationcancel',
    'animationend',
    'animationiteration',
    'animationstart',
    'appinstalled',
    'audioend',
    'audioprocess',
    'audiostart',
    'auxclick',
    'beforeinstallprompt',
    'beforeprint',
    'beforescriptexecute',
    'beforeunload',
    'beginEvent',
    'blur',
    'boundary',
    'broadcast',
    'busy',
    'callschanged',
    'canplay',
    'canplaythrough',
    'cardstatechange',
    'cfstatechange',
    'change',
    'chargingchange',
    'chargingtimechange',
    'checking',
    'click',
    'command',
    'commandupdate',
    'compassneedscalibration',
    'complete',
    'compositionend',
    'compositionstart',
    'compositionupdate',
    'connected',
    'connecting',
    'connectionInfoUpdate',
    'contextmenu',
    'copy',
    'cut',
    'datachange',
    'dataerror',
    'dblclick',
    'delivered',
    'devicechange',
    'devicemotion',
    'deviceorientation',
    'dialing',
    'disabled',
    'dischargingtimechange',
    'disconnected',
    'disconnecting',
    'downloading',
    'drag',
    'dragend',
    'dragenter',
    'dragleave',
    'dragover',
    'dragstart',
    'drop',
    'durationchange',
    'emptied',
    'enabled',
    'end',
    'endEvent',
    'ended',
    'error',
    'focus',
    'focusin',
    'focusout',
    'fullscreenchange',
    'fullscreenerror',
    'gamepadconnected',
    'gamepaddisconnected',
    'gotpointercapture',
    'hashchange',
    'held',
    'holding',
    'icccardlockerror',
    'iccinfochange',
    'incoming',
    'input',
    'invalid',
    'keydown',
    'keypress',
    'keyup',
    'languagechange',
    'levelchange',
    'load',
    'loadeddata',
    'loadedmetadata',
    'loadend',
    'loadstart',
    'localized',
    'lostpointercapture',
    'mark',
    'message',
    'messageerror',
    'mousedown',
    'mouseenter',
    'mouseleave',
    'mousemove',
    'mouseout',
    'mouseover',
    'mouseup',
    'mousewheel',
    'mozbrowseractivitydone',
    'mozbrowserasyncscroll',
    'mozbrowseraudioplaybackchange',
    'mozbrowsercaretstatechanged',
    'mozbrowserclose',
    'mozbrowsercontextmenu',
    'mozbrowserdocumentfirstpaint',
    'mozbrowsererror',
    'mozbrowserfindchange',
    'mozbrowserfirstpaint',
    'mozbrowsericonchange',
    'mozbrowserloadend',
    'mozbrowserloadstart',
    'mozbrowserlocationchange',
    'mozbrowsermanifestchange',
    'mozbrowsermetachange',
    'mozbrowseropensearch',
    'mozbrowseropentab',
    'mozbrowseropenwindow',
    'mozbrowserresize',
    'mozbrowserscroll',
    'mozbrowserscrollareachanged',
    'mozbrowserscrollviewchange',
    'mozbrowsersecuritychange',
    'mozbrowserselectionstatechanged',
    'mozbrowsershowmodalprompt',
    'mozbrowsertitlechange',
    'mozbrowserusernameandpasswordrequired',
    'mozbrowservisibilitychange',
    'moztimechange',
    'msContentZoom',
    'nomatch',
    'notificationclick',
    'noupdate',
    'obsolete',
    'offline',
    'online',
    'orientationchange',
    'overflow',
    'pagehide',
    'pageshow',
    'paste',
    'pause',
    'play',
    'playing',
    'pointercancel',
    'pointerdown',
    'pointerenter',
    'pointerleave',
    'pointerlockchange',
    'pointerlockerror',
    'pointermove',
    'pointerout',
    'pointerover',
    'pointerup',
    'popstate',
    'popuphidden',
    'popuphiding',
    'popupshowing',
    'popupshown',
    'progress',
    'push',
    'pushsubscriptionchange',
    'ratechange',
    'readystatechange',
    'received',
    'repeatEvent',
    'reset',
    'resize',
    'resourcetimingbufferfull',
    'result',
    'resume',
    'resuming',
    'scroll',
    'seeked',
    'seeking',
    'select',
    'selectionchange',
    'selectstart',
    'sent',
    'show',
    'slotchange',
    'smartcard-insert',
    'smartcard-remove',
    'soundend',
    'soundstart',
    'speechend',
    'speechstart',
    'stalled',
    'start',
    'statechange',
    'statuschange',
    'stkcommand',
    'stksessionend',
    'storage',
    'submit',
    'suspend',
    'timeout',
    'timeupdate',
    'touchcancel',
    'touchend',
    'touchenter',
    'touchleave',
    'touchmove',
    'touchstart',
    'transitioncancel',
    'transitionend',
    'transitionrun',
    'transitionstart',
    'underflow',
    'unload',
    'updateready',
    'userproximity',
    'ussdreceived',
    'visibilitychange',
    'voicechange',
    'voiceschanged',
    'volumechange',
    'vrdisplayactivate',
    'vrdisplayblur',
    'vrdisplayconnect',
    'vrdisplaydeactivate',
    'vrdisplaydisconnect',
    'vrdisplayfocus',
    'vrdisplaypresentchange',
    'waiting',
    'wheel',
].map(e => e.toLowerCase()));

const listenDecoratorsToStatic = (config, diagnostics, decoratedMembers, newMembers) => {
    const listeners = decoratedMembers
        .filter(ts$1__default.isMethodDeclaration)
        .map(method => parseListenDecorators(config, diagnostics, method));
    const flatListeners = flatOne(listeners);
    if (flatListeners.length > 0) {
        newMembers.push(createStaticGetter('listeners', convertValueToLiteral(flatListeners)));
    }
};
const parseListenDecorators = (config, diagnostics, method) => {
    const listenDecorators = method.decorators.filter(isDecoratorNamed('Listen'));
    if (listenDecorators.length === 0) {
        return [];
    }
    return listenDecorators.map(listenDecorator => {
        const methodName = method.name.getText();
        const [listenText, listenOptions] = getDeclarationParameters(listenDecorator);
        const eventNames = listenText.split(',');
        if (eventNames.length > 1) {
            const err = buildError(diagnostics);
            err.messageText = 'Please use multiple @Listen() decorators instead of comma-separated names.';
            augmentDiagnosticWithNode(config, err, listenDecorator);
        }
        return parseListener(config, diagnostics, eventNames[0], listenOptions, methodName, listenDecorator);
    });
};
const parseListener = (config, diagnostics, eventName, opts = {}, methodName, decoratorNode) => {
    let rawEventName = eventName.trim();
    let target = opts.target;
    // DEPRECATED: handle old syntax (`TARGET:event`)
    if (!target) {
        const splt = eventName.split(':');
        const prefix = splt[0].toLowerCase().trim();
        if (splt.length > 1 && isValidTargetValue(prefix)) {
            rawEventName = splt[1].trim();
            target = prefix;
            const warn = buildWarn(diagnostics);
            warn.messageText = `Deprecated @Listen() feature on "${methodName}". Use @Listen('${rawEventName}', { target: '${prefix}' }) instead.`;
            augmentDiagnosticWithNode(config, warn, decoratorNode);
        }
    }
    // DEPRECATED: handle keycode syntax (`event:KEY`)
    const [finalEvent, keycode, rest] = rawEventName.split('.');
    if (rest === undefined && isValidKeycodeSuffix(keycode)) {
        rawEventName = finalEvent;
        const warn = buildError(diagnostics);
        warn.messageText = `Deprecated @Listen() feature on "${methodName}". Using "${rawEventName}" is no longer supported, use "event.key" within the function itself instead.`;
        augmentDiagnosticWithNode(config, warn, decoratorNode);
    }
    const listener = {
        name: rawEventName,
        method: methodName,
        target,
        capture: (typeof opts.capture === 'boolean') ? opts.capture : false,
        passive: (typeof opts.passive === 'boolean') ? opts.passive :
            // if the event name is kown to be a passive event then set it to true
            (PASSIVE_TRUE_DEFAULTS.has(rawEventName.toLowerCase())),
    };
    return listener;
};
const isValidTargetValue = (prefix) => {
    return (VALID_ELEMENT_REF_PREFIXES.has(prefix));
};
const isValidKeycodeSuffix = (prefix) => {
    return (VALID_KEYCODE_SUFFIX.has(prefix));
};
const PASSIVE_TRUE_DEFAULTS = new Set([
    'dragstart', 'drag', 'dragend', 'dragenter', 'dragover', 'dragleave', 'drop',
    'mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'mouseleave', 'mouseout', 'mousewheel',
    'pointerover', 'pointerenter', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout', 'pointerleave',
    'resize',
    'scroll',
    'touchstart', 'touchmove', 'touchend', 'touchenter', 'touchleave', 'touchcancel',
    'wheel',
]);
const VALID_ELEMENT_REF_PREFIXES = new Set([
    'parent', 'body', 'document', 'window'
]);
const VALID_KEYCODE_SUFFIX = new Set([
    'enter', 'escape', 'space', 'tab', 'up', 'right', 'down', 'left'
]);

const validatePublicName = (config, diagnostics, memberName, decorator, memberType, node) => {
    if (RESERVED_PUBLIC_MEMBERS.has(memberName.toLowerCase())) {
        const warn = buildWarn(diagnostics);
        warn.messageText = [
            `The ${decorator} name "${memberName}" is a reserved public name. `,
            `Please rename the "${memberName}" ${memberType} so it does not conflict with an existing standardized prototype member. `,
            `Reusing ${memberType} names that are already defined on the element's prototype may cause `,
            `unexpected runtime errors or user-interface issues on various browsers, so it's best to avoid them entirely.`
        ].join('');
        augmentDiagnosticWithNode(config, warn, node);
        return;
    }
};
const HTML_ELEMENT_KEYS = [
    'title',
    'lang',
    'translate',
    'dir',
    // 'dataset',
    // 'hidden',
    'tabIndex',
    'accessKey',
    'draggable',
    // 'spellcheck',
    // 'autocapitalize',
    'contentEditable',
    'isContentEditable',
    // 'inputMode',
    'offsetParent',
    'offsetTop',
    'offsetLeft',
    'offsetWidth',
    'offsetHeight',
    'style',
    'innerText',
    'outerText',
    'oncopy',
    'oncut',
    'onpaste',
    'onabort',
    'onblur',
    'oncancel',
    'oncanplay',
    'oncanplaythrough',
    'onchange',
    'onclick',
    'onclose',
    'oncontextmenu',
    'oncuechange',
    'ondblclick',
    'ondrag',
    'ondragend',
    'ondragenter',
    'ondragleave',
    'ondragover',
    'ondragstart',
    'ondrop',
    'ondurationchange',
    'onemptied',
    'onended',
    'onerror',
    'onfocus',
    'oninput',
    'oninvalid',
    'onkeydown',
    'onkeypress',
    'onkeyup',
    'onload',
    'onloadeddata',
    'onloadedmetadata',
    'onloadstart',
    'onmousedown',
    'onmouseenter',
    'onmouseleave',
    'onmousemove',
    'onmouseout',
    'onmouseover',
    'onmouseup',
    'onmousewheel',
    'onpause',
    'onplay',
    'onplaying',
    'onprogress',
    'onratechange',
    'onreset',
    'onresize',
    'onscroll',
    'onseeked',
    'onseeking',
    'onselect',
    'onstalled',
    'onsubmit',
    'onsuspend',
    'ontimeupdate',
    'ontoggle',
    'onvolumechange',
    'onwaiting',
    'onwheel',
    'onauxclick',
    'ongotpointercapture',
    'onlostpointercapture',
    'onpointerdown',
    'onpointermove',
    'onpointerup',
    'onpointercancel',
    'onpointerover',
    'onpointerout',
    'onpointerenter',
    'onpointerleave',
    'onselectstart',
    'onselectionchange',
    'nonce',
    'click',
    'focus',
    'blur'
];
const ELEMENT_KEYS = [
    'namespaceURI',
    'prefix',
    'localName',
    'tagName',
    'id',
    'className',
    'classList',
    'slot',
    'attributes',
    'shadowRoot',
    'assignedSlot',
    'innerHTML',
    'outerHTML',
    'scrollTop',
    'scrollLeft',
    'scrollWidth',
    'scrollHeight',
    'clientTop',
    'clientLeft',
    'clientWidth',
    'clientHeight',
    'attributeStyleMap',
    'onbeforecopy',
    'onbeforecut',
    'onbeforepaste',
    'onsearch',
    'previousElementSibling',
    'nextElementSibling',
    'children',
    'firstElementChild',
    'lastElementChild',
    'childElementCount',
    'onfullscreenchange',
    'onfullscreenerror',
    'onwebkitfullscreenchange',
    'onwebkitfullscreenerror',
    'setPointerCapture',
    'releasePointerCapture',
    'hasPointerCapture',
    'hasAttributes',
    'getAttributeNames',
    'getAttribute',
    'getAttributeNS',
    'setAttribute',
    'setAttributeNS',
    'removeAttribute',
    'removeAttributeNS',
    'hasAttribute',
    'hasAttributeNS',
    'toggleAttribute',
    'getAttributeNode',
    'getAttributeNodeNS',
    'setAttributeNode',
    'setAttributeNodeNS',
    'removeAttributeNode',
    'closest',
    'matches',
    'webkitMatchesSelector',
    'attachShadow',
    'getElementsByTagName',
    'getElementsByTagNameNS',
    'getElementsByClassName',
    'insertAdjacentElement',
    'insertAdjacentText',
    'insertAdjacentHTML',
    'requestPointerLock',
    'getClientRects',
    'getBoundingClientRect',
    'scrollIntoView',
    'scroll',
    'scrollTo',
    'scrollBy',
    'scrollIntoViewIfNeeded',
    'animate',
    'computedStyleMap',
    'before',
    'after',
    'replaceWith',
    'remove',
    'prepend',
    'append',
    'querySelector',
    'querySelectorAll',
    'requestFullscreen',
    'webkitRequestFullScreen',
    'webkitRequestFullscreen',
    'part',
    'createShadowRoot',
    'getDestinationInsertionPoints'
];
const NODE_KEYS = [
    'ELEMENT_NODE',
    'ATTRIBUTE_NODE',
    'TEXT_NODE',
    'CDATA_SECTION_NODE',
    'ENTITY_REFERENCE_NODE',
    'ENTITY_NODE',
    'PROCESSING_INSTRUCTION_NODE',
    'COMMENT_NODE',
    'DOCUMENT_NODE',
    'DOCUMENT_TYPE_NODE',
    'DOCUMENT_FRAGMENT_NODE',
    'NOTATION_NODE',
    'DOCUMENT_POSITION_DISCONNECTED',
    'DOCUMENT_POSITION_PRECEDING',
    'DOCUMENT_POSITION_FOLLOWING',
    'DOCUMENT_POSITION_CONTAINS',
    'DOCUMENT_POSITION_CONTAINED_BY',
    'DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC',
    'nodeType',
    'nodeName',
    'baseURI',
    'isConnected',
    'ownerDocument',
    'parentNode',
    'parentElement',
    'childNodes',
    'firstChild',
    'lastChild',
    'previousSibling',
    'nextSibling',
    'nodeValue',
    'textContent',
    'hasChildNodes',
    'getRootNode',
    'normalize',
    'cloneNode',
    'isEqualNode',
    'isSameNode',
    'compareDocumentPosition',
    'contains',
    'lookupPrefix',
    'lookupNamespaceURI',
    'isDefaultNamespace',
    'insertBefore',
    'appendChild',
    'replaceChild',
    'removeChild'
];
const JSX_KEYS = [
    'ref',
    'key'
];
const ALL_KEYS = [
    ...HTML_ELEMENT_KEYS,
    ...ELEMENT_KEYS,
    ...NODE_KEYS,
    ...JSX_KEYS,
].map(p => p.toLowerCase());
const RESERVED_PUBLIC_MEMBERS = new Set(ALL_KEYS);

const methodDecoratorsToStatic = (config, diagnostics, sourceFile, decoratedProps, typeChecker, newMembers) => {
    const methods = decoratedProps
        .filter(ts$1__default.isMethodDeclaration)
        .map(method => parseMethodDecorator(config, diagnostics, sourceFile, typeChecker, method))
        .filter(method => !!method);
    if (methods.length > 0) {
        newMembers.push(createStaticGetter('methods', ts$1__default.createObjectLiteral(methods, true)));
    }
};
const parseMethodDecorator = (config, diagnostics, sourceFile, typeChecker, method) => {
    const methodDecorator = method.decorators.find(isDecoratorNamed('Method'));
    if (methodDecorator == null) {
        return null;
    }
    const methodName = method.name.getText();
    const flags = ts$1__default.TypeFormatFlags.WriteArrowStyleSignature | ts$1__default.TypeFormatFlags.NoTruncation;
    const signature = typeChecker.getSignatureFromDeclaration(method);
    const returnType = typeChecker.getReturnTypeOfSignature(signature);
    const returnTypeNode = typeChecker.typeToTypeNode(returnType);
    let returnString = typeToString(typeChecker, returnType);
    let signatureString = typeChecker.signatureToString(signature, method, flags, ts$1__default.SignatureKind.Call);
    if (!config._isTesting) {
        if (returnString === 'void') {
            const warn = buildWarn(diagnostics);
            warn.header = '@Method requires async';
            warn.messageText = `External @Method() ${methodName}() must return a Promise.\n\n Consider prefixing the method with async, such as @Method async ${methodName}().`;
            augmentDiagnosticWithNode(config, warn, method.name);
            returnString = 'Promise<void>';
            signatureString = signatureString.replace(/=> void$/, '=> Promise<void>');
        }
        else if (!isTypePromise(returnString)) {
            const err = buildError(diagnostics);
            err.header = '@Method requires async';
            err.messageText = `External @Method() ${methodName}() must return a Promise.\n\n Consider prefixing the method with async, such as @Method async ${methodName}().`;
            augmentDiagnosticWithNode(config, err, method.name);
        }
    }
    if (isMemberPrivate(method)) {
        const err = buildError(diagnostics);
        err.messageText = 'Methods decorated with the @Method() decorator cannot be "private" nor "protected". More info: https://stenciljs.com/docs/methods';
        augmentDiagnosticWithNode(config, err, method.modifiers[0]);
    }
    // Validate if the method name does not conflict with existing public names
    validatePublicName(config, diagnostics, methodName, '@Method()', 'method', method.name);
    const methodMeta = {
        complexType: {
            signature: signatureString,
            parameters: signature.parameters.map(symbol => serializeSymbol(typeChecker, symbol)),
            references: Object.assign(Object.assign({}, getAttributeTypeInfo(returnTypeNode, sourceFile)), getAttributeTypeInfo(method, sourceFile)),
            return: returnString
        },
        docs: {
            text: ts$1__default.displayPartsToString(signature.getDocumentationComment(typeChecker)),
            tags: signature.getJsDocTags()
        }
    };
    validateReferences(config, diagnostics, methodMeta.complexType.references, method.type || method.name);
    const staticProp = ts$1__default.createPropertyAssignment(ts$1__default.createLiteral(methodName), convertValueToLiteral(methodMeta));
    return staticProp;
};
const isTypePromise = (typeStr) => {
    return /^Promise<.+>$/.test(typeStr);
};

const propDecoratorsToStatic = (config, diagnostics, decoratedProps, typeChecker, newMembers) => {
    const connect = [];
    const context = [];
    const properties = decoratedProps
        .filter(ts$1__default.isPropertyDeclaration)
        .map(prop => parsePropDecorator(config, diagnostics, typeChecker, prop, context, connect, newMembers))
        .filter(prop => prop != null);
    if (properties.length > 0) {
        newMembers.push(createStaticGetter('properties', ts$1__default.createObjectLiteral(properties, true)));
    }
    if (context.length > 0) {
        newMembers.push(createStaticGetter('contextProps', convertValueToLiteral(context)));
    }
    if (connect.length > 0) {
        newMembers.push(createStaticGetter('connectProps', convertValueToLiteral(connect)));
    }
};
const parsePropDecorator = (config, diagnostics, typeChecker, prop, context, connect, newMembers) => {
    const propDecorator = prop.decorators.find(isDecoratorNamed('Prop'));
    if (propDecorator == null) {
        return null;
    }
    const propName = prop.name.getText();
    const propOptions = getPropOptions(propDecorator, diagnostics);
    if (propOptions.context) {
        context.push({
            name: propName,
            context: propOptions.context,
        });
        removeProp(prop, newMembers);
        return null;
    }
    if (propOptions.connect) {
        connect.push({
            name: propName,
            connect: propOptions.connect,
        });
        removeProp(prop, newMembers);
        return null;
    }
    if (isMemberPrivate(prop)) {
        const err = buildError(diagnostics);
        err.messageText = 'Properties decorated with the @Prop() decorator cannot be "private" nor "protected". More info: https://stenciljs.com/docs/properties';
        augmentDiagnosticWithNode(config, err, prop.modifiers[0]);
    }
    if (/^on(-|[A-Z])/.test(propName)) {
        const warn = buildWarn(diagnostics);
        warn.messageText = `The @Prop() name "${propName}" looks like an event. Please use the "@Event()" decorator to expose events instead, not properties or methods.`;
        augmentDiagnosticWithNode(config, warn, prop.name);
    }
    else {
        validatePublicName(config, diagnostics, propName, '@Prop()', 'prop', prop.name);
    }
    const symbol = typeChecker.getSymbolAtLocation(prop.name);
    const type = typeChecker.getTypeAtLocation(prop);
    const typeStr = propTypeFromTSType(type);
    const propMeta = {
        type: typeStr,
        mutable: !!propOptions.mutable,
        complexType: getComplexType$1(typeChecker, prop, type),
        required: prop.exclamationToken !== undefined && propName !== 'mode',
        optional: prop.questionToken !== undefined,
        docs: serializeSymbol(typeChecker, symbol)
    };
    validateReferences(config, diagnostics, propMeta.complexType.references, prop.type);
    // prop can have an attribute if type is NOT "unknown"
    if (typeStr !== 'unknown') {
        propMeta.attribute = getAttributeName(config, diagnostics, propName, propOptions, propDecorator);
        propMeta.reflect = getReflect(diagnostics, propOptions);
    }
    // extract default value
    const initializer = prop.initializer;
    if (initializer) {
        propMeta.defaultValue = initializer.getText();
    }
    const staticProp = ts$1__default.createPropertyAssignment(ts$1__default.createLiteral(propName), convertValueToLiteral(propMeta));
    return staticProp;
};
const getAttributeName = (config, diagnostics, propName, propOptions, node) => {
    if (propOptions.attribute === null) {
        return undefined;
    }
    if (typeof propOptions.attribute === 'string' && propOptions.attribute.trim().length > 0) {
        return propOptions.attribute.trim().toLowerCase();
    }
    if (typeof propOptions.attr === 'string' && propOptions.attr.trim().length > 0) {
        const diagnostic = buildWarn(diagnostics);
        diagnostic.messageText = `@Prop option "attr" has been deprecated. Please use "attribute" instead.`;
        augmentDiagnosticWithNode(config, diagnostic, node);
        return propOptions.attr.trim().toLowerCase();
    }
    return toDashCase(propName);
};
const getReflect = (_diagnostics, propOptions) => {
    if (typeof propOptions.reflect === 'boolean') {
        return propOptions.reflect;
    }
    if (typeof propOptions.reflectToAttr === 'boolean') {
        // const diagnostic = buildWarn(diagnostics);
        // diagnostic.messageText = `@Prop option "reflectToAttr" has been depreciated. Please use "reflect" instead.`;
        return propOptions.reflectToAttr;
    }
    return false;
};
const getPropOptions = (propDecorator, diagnostics) => {
    if (propDecorator.expression == null) {
        return {};
    }
    const suppliedOptions = propDecorator.expression.arguments
        .map(arg => {
        try {
            const fnStr = `return ${arg.getText()};`;
            return new Function(fnStr)();
        }
        catch (e) {
            catchError(diagnostics, e, `parse prop options: ${e}`);
        }
    });
    const propOptions = suppliedOptions[0];
    return propOptions || {};
};
const getComplexType$1 = (typeChecker, node, type) => {
    const nodeType = node.type;
    return {
        original: nodeType ? nodeType.getText() : typeToString(typeChecker, type),
        resolved: resolveType(typeChecker, type),
        references: getAttributeTypeInfo(node, node.getSourceFile())
    };
};
const propTypeFromTSType = (type) => {
    const isAnyType = checkType(type, isAny);
    if (isAnyType) {
        return 'any';
    }
    const isStr = checkType(type, isString);
    const isNu = checkType(type, isNumber);
    const isBool = checkType(type, isBoolean);
    // if type is more than a primitive type at the same time, we mark it as any
    if (Number(isStr) + Number(isNu) + Number(isBool) > 1) {
        return 'any';
    }
    // at this point we know the prop's type is NOT the mix of primitive types
    if (isStr) {
        return 'string';
    }
    if (isNu) {
        return 'number';
    }
    if (isBool) {
        return 'boolean';
    }
    return 'unknown';
};
const checkType = (type, check) => {
    if (type.flags & ts$1__default.TypeFlags.Union) {
        const union = type;
        if (union.types.some(type => checkType(type, check))) {
            return true;
        }
    }
    return check(type);
};
const isBoolean = (t) => {
    if (t) {
        return !!(t.flags & (ts$1__default.TypeFlags.Boolean | ts$1__default.TypeFlags.BooleanLike | ts$1__default.TypeFlags.BooleanLike));
    }
    return false;
};
const isNumber = (t) => {
    if (t) {
        return !!(t.flags & (ts$1__default.TypeFlags.Number | ts$1__default.TypeFlags.NumberLike | ts$1__default.TypeFlags.NumberLiteral));
    }
    return false;
};
const isString = (t) => {
    if (t) {
        return !!(t.flags & (ts$1__default.TypeFlags.String | ts$1__default.TypeFlags.StringLike | ts$1__default.TypeFlags.StringLiteral));
    }
    return false;
};
const isAny = (t) => {
    if (t) {
        return !!(t.flags & ts$1__default.TypeFlags.Any);
    }
    return false;
};
const removeProp = (prop, classElements) => {
    const index = classElements.findIndex(p => prop === p);
    if (index >= 0) {
        classElements.splice(index, 1);
    }
};

const stateDecoratorsToStatic = (diagnostics, _sourceFile, decoratedProps, typeChecker, newMembers) => {
    const states = decoratedProps
        .filter(ts$1__default.isPropertyDeclaration)
        .map(prop => stateDecoratorToStatic(diagnostics, typeChecker, prop))
        .filter(state => !!state);
    if (states.length > 0) {
        newMembers.push(createStaticGetter('states', ts$1__default.createObjectLiteral(states, true)));
    }
};
const stateDecoratorToStatic = (_diagnostics, _typeChecker, prop) => {
    const stateDecorator = prop.decorators.find(isDecoratorNamed('State'));
    if (stateDecorator == null) {
        return null;
    }
    const stateName = prop.name.getText();
    return ts$1__default.createPropertyAssignment(ts$1__default.createLiteral(stateName), ts$1__default.createObjectLiteral([], true));
};

const watchDecoratorsToStatic = (diagnostics, decoratedProps, newMembers) => {
    const watchers = decoratedProps
        .filter(ts$1__default.isMethodDeclaration)
        .map(method => parseWatchDecorator(diagnostics, method));
    const flatWatchers = flatOne(watchers);
    if (flatWatchers.length > 0) {
        newMembers.push(createStaticGetter('watchers', convertValueToLiteral(flatWatchers)));
    }
};
const isWatchDecorator = isDecoratorNamed('Watch');
const isPropWillChangeDecorator = isDecoratorNamed('PropWillChange');
const isPropDidChangeDecorator = isDecoratorNamed('PropDidChange');
const parseWatchDecorator = (_diagnostics, method) => {
    const methodName = method.name.getText();
    return method.decorators
        .filter(decorator => (isWatchDecorator(decorator) ||
        isPropWillChangeDecorator(decorator) ||
        isPropDidChangeDecorator(decorator)))
        .map(decorator => {
        const [propName] = getDeclarationParameters(decorator);
        return {
            propName,
            methodName
        };
    });
};
// TODO
// const isPropWatchable = (cmpMeta: d.ComponentMeta, propName: string) => {
//   const membersMeta = cmpMeta.membersMeta;
//   if (!membersMeta) {
//     return false;
//   }
//   const member = membersMeta[propName];
//   if (!member) {
//     return false;
//   }
// const type = member.memberType;
// return type === MEMBER_FLAGS.State || type === MEMBER_FLAGS.Prop || type === MEMBER_FLAGS.PropMutable;
// };

const convertDecoratorsToStatic = (config, diagnostics, typeChecker) => {
    return transformCtx => {
        const visit = (tsSourceFile, node) => {
            if (ts$1__default.isClassDeclaration(node)) {
                node = visitClass(config, diagnostics, typeChecker, tsSourceFile, node);
            }
            return ts$1__default.visitEachChild(node, node => visit(tsSourceFile, node), transformCtx);
        };
        return tsSourceFile => {
            return visit(tsSourceFile, tsSourceFile);
        };
    };
};
const visitClass = (config, diagnostics, typeChecker, tsSourceFile, cmpNode) => {
    if (!cmpNode.decorators) {
        return cmpNode;
    }
    const componentDecorator = cmpNode.decorators.find(isDecoratorNamed('Component'));
    if (!componentDecorator) {
        return cmpNode;
    }
    const newMembers = [...cmpNode.members];
    // parser component decorator (Component)
    componentDecoratorToStatic(config, typeChecker, diagnostics, cmpNode, newMembers, componentDecorator);
    // parse member decorators (Prop, State, Listen, Event, Method, Element and Watch)
    const decoratedMembers = newMembers.filter(member => Array.isArray(member.decorators) && member.decorators.length > 0);
    if (decoratedMembers.length > 0) {
        propDecoratorsToStatic(config, diagnostics, decoratedMembers, typeChecker, newMembers);
        stateDecoratorsToStatic(diagnostics, tsSourceFile, decoratedMembers, typeChecker, newMembers);
        eventDecoratorsToStatic(config, diagnostics, decoratedMembers, typeChecker, newMembers);
        methodDecoratorsToStatic(config, diagnostics, tsSourceFile, decoratedMembers, typeChecker, newMembers);
        elementDecoratorsToStatic(diagnostics, decoratedMembers, typeChecker, newMembers);
        watchDecoratorsToStatic(diagnostics, decoratedMembers, newMembers);
        listenDecoratorsToStatic(config, diagnostics, decoratedMembers, newMembers);
        removeStencilDecorators(decoratedMembers);
    }
    return ts$1__default.updateClassDeclaration(cmpNode, cmpNode.decorators, cmpNode.modifiers, cmpNode.name, cmpNode.typeParameters, cmpNode.heritageClauses, newMembers);
};
const removeStencilDecorators = (classMembers) => {
    classMembers.forEach(member => removeDecorators(member, MEMBER_DECORATORS_TO_REMOVE));
};

const gatherVdomMeta = (m, args) => {
    m.hasVdomRender = true;
    // Parse vdom tag
    const hTag = args[0];
    if (!ts$1__default.isStringLiteral(hTag) && (!ts$1__default.isIdentifier(hTag) || hTag.text !== 'Host')) {
        m.hasVdomFunctional = true;
    }
    // Parse attributes
    if (args.length > 1) {
        const objectLiteral = args[1];
        if (ts$1__default.isCallExpression(objectLiteral) || ts$1__default.isIdentifier(objectLiteral)) {
            m.hasVdomAttribute = true;
            m.hasVdomKey = true;
            m.hasVdomClass = true;
            m.hasVdomListener = true;
            m.hasVdomRef = true;
            m.hasVdomXlink = true;
            m.hasVdomStyle = true;
        }
        else if (ts$1__default.isObjectLiteralExpression(objectLiteral)) {
            objectLiteral.properties.forEach(prop => {
                m.hasVdomAttribute = true;
                if (ts$1__default.isSpreadAssignment(prop) || ts$1__default.isComputedPropertyName(prop.name)) {
                    m.hasVdomKey = true;
                    m.hasVdomClass = true;
                    m.hasVdomListener = true;
                    m.hasVdomXlink = true;
                    m.hasVdomRef = true;
                    m.hasVdomStyle = true;
                }
                else if (prop.name && prop.name.text && prop.name.text.length > 0) {
                    const attrName = prop.name.text;
                    if (attrName === 'key') {
                        m.hasVdomKey = true;
                    }
                    if (attrName === 'ref') {
                        m.hasVdomRef = true;
                    }
                    if (attrName === 'class' || attrName === 'className') {
                        m.hasVdomClass = true;
                    }
                    if (attrName === 'style') {
                        m.hasVdomStyle = true;
                    }
                    if (/^on(-|[A-Z])/.test(attrName)) {
                        m.hasVdomListener = true;
                    }
                    if (attrName.startsWith('xlink')) {
                        m.hasVdomXlink = true;
                    }
                    m.htmlAttrNames.push(attrName);
                }
            });
        }
    }
    // Parse children
    if (!m.hasVdomText) {
        for (let i = 2; i < args.length; i++) {
            const arg = args[i];
            if (!ts$1__default.isCallExpression(arg) || !ts$1__default.isIdentifier(arg.expression) || (arg.expression.text !== 'h')) {
                m.hasVdomText = true;
                break;
            }
        }
    }
};

const parseCallExpression = (m, node) => {
    if (node.arguments != null && node.arguments.length > 0) {
        if (ts$1__default.isIdentifier(node.expression)) {
            // h('tag')
            visitCallExpressionArgs(m, node.expression, node.arguments);
        }
        else if (ts$1__default.isPropertyAccessExpression(node.expression)) {
            // document.createElement('tag')
            if (node.expression.name) {
                visitCallExpressionArgs(m, node.expression.name, node.arguments);
            }
        }
    }
};
const visitCallExpressionArgs = (m, callExpressionName, args) => {
    const fnName = callExpressionName.escapedText;
    if (fnName === 'h' || fnName === H || fnName === 'createElement') {
        visitCallExpressionArg(m, args[0]);
        if (fnName === 'h' || fnName === H) {
            gatherVdomMeta(m, args);
        }
    }
    else if (args.length > 1 && fnName === 'createElementNS') {
        visitCallExpressionArg(m, args[1]);
    }
    else if (fnName === 'require' && args.length > 0 && m.originalImports) {
        const arg = args[0];
        if (ts$1__default.isStringLiteral(arg)) {
            if (!m.originalImports.includes(arg.text)) {
                m.originalImports.push(arg.text);
            }
        }
    }
};
const visitCallExpressionArg = (m, arg) => {
    if (ts$1__default.isStringLiteral(arg)) {
        let tag = arg.text;
        if (typeof tag === 'string') {
            tag = tag.toLowerCase();
            m.htmlTagNames.push(tag);
            if (tag.includes('-')) {
                m.potentialCmpRefs.push(tag);
            }
        }
    }
};

const setComponentBuildConditionals = (cmpMeta) => {
    if (cmpMeta.properties.length > 0) {
        cmpMeta.hasProp = true;
        cmpMeta.hasPropMutable = cmpMeta.properties.some(p => p.mutable);
        cmpMeta.hasReflect = cmpMeta.properties.some(p => p.reflect);
        cmpMeta.hasAttribute = cmpMeta.properties.some(p => typeof p.attribute === 'string');
        cmpMeta.hasPropBoolean = cmpMeta.properties.some(p => p.type === 'boolean');
        cmpMeta.hasPropNumber = cmpMeta.properties.some(p => p.type === 'number');
        cmpMeta.hasPropString = cmpMeta.properties.some(p => p.type === 'string');
    }
    if (cmpMeta.states.length > 0) {
        cmpMeta.hasState = true;
    }
    if (cmpMeta.watchers.length > 0) {
        cmpMeta.hasWatchCallback = true;
    }
    if (cmpMeta.methods.length > 0) {
        cmpMeta.hasMethod = true;
    }
    if (cmpMeta.events.length > 0) {
        cmpMeta.hasEvent = true;
    }
    if (cmpMeta.listeners.length > 0) {
        cmpMeta.hasListener = true;
        cmpMeta.hasListenerTargetWindow = cmpMeta.listeners.some(l => l.target === 'window');
        cmpMeta.hasListenerTargetDocument = cmpMeta.listeners.some(l => l.target === 'document');
        cmpMeta.hasListenerTargetBody = cmpMeta.listeners.some(l => l.target === 'body');
        cmpMeta.hasListenerTargetParent = cmpMeta.listeners.some(l => l.target === 'parent');
        cmpMeta.hasListenerTarget = cmpMeta.listeners.some(l => !!l.target);
    }
    cmpMeta.hasMember = (cmpMeta.hasProp || cmpMeta.hasState || cmpMeta.hasElement || cmpMeta.hasMethod);
    cmpMeta.isUpdateable = (cmpMeta.hasProp || cmpMeta.hasState);
    if (cmpMeta.styles.length > 0) {
        cmpMeta.hasStyle = true;
        cmpMeta.hasMode = cmpMeta.styles.some(s => s.modeName !== DEFAULT_STYLE_MODE);
    }
    cmpMeta.hasLifecycle = (cmpMeta.hasComponentWillLoadFn || cmpMeta.hasComponentDidLoadFn || cmpMeta.hasComponentShouldUpdateFn || cmpMeta.hasComponentWillUpdateFn || cmpMeta.hasComponentDidUpdateFn || cmpMeta.hasComponentWillRenderFn || cmpMeta.hasComponentDidRenderFn);
    cmpMeta.isPlain = !cmpMeta.hasMember && !cmpMeta.hasStyle && !cmpMeta.hasLifecycle && !cmpMeta.hasListener && !cmpMeta.hasVdomRender;
};

function parseComponentsDeprecated(config, compilerCtx, collection, collectionDir, collectionManifest) {
    if (collectionManifest.components) {
        collectionManifest.components.forEach(cmpData => {
            parseComponentDeprecated(config, compilerCtx, collection, collectionDir, cmpData);
        });
    }
}
function parseComponentDeprecated(config, compilerCtx, collection, collectionDir, cmpData) {
    const sourceFilePath = normalizePath(config.sys.path.join(collectionDir, cmpData.componentPath));
    const moduleFile = getModule(config, compilerCtx, sourceFilePath);
    moduleFile.isCollectionDependency = true;
    moduleFile.isLegacy = true;
    moduleFile.collectionName = collection.collectionName;
    moduleFile.excludeFromCollection = excludeFromCollection(config, cmpData);
    moduleFile.originalCollectionComponentPath = cmpData.componentPath;
    moduleFile.jsFilePath = parseJsFilePath(config, collectionDir, cmpData);
    const cmpMeta = {
        isLegacy: moduleFile.isLegacy,
        excludeFromCollection: moduleFile.excludeFromCollection,
        isCollectionDependency: moduleFile.isCollectionDependency,
        tagName: parseTag(cmpData),
        componentClassName: parseComponentClass(cmpData),
        virtualProperties: [],
        docs: {
            text: '',
            tags: []
        },
        internal: false,
        jsFilePath: moduleFile.jsFilePath,
        sourceFilePath: '',
        styleDocs: [],
        assetsDirs: parseAssetsDir(config, collectionDir, cmpData),
        styles: parseStyles(config, collectionDir, cmpData),
        properties: parseProps(cmpData),
        states: parseStates(cmpData),
        listeners: parseListeners(cmpData),
        methods: parseMethods(cmpData),
        elementRef: parseHostElementMember(cmpData),
        events: parseEvents(cmpData),
        encapsulation: parseEncapsulation(cmpData),
        watchers: parseWatchers(cmpData),
        legacyConnect: parseConnectProps(cmpData),
        legacyContext: parseContextProps(cmpData),
        hasAttributeChangedCallbackFn: false,
        hasComponentWillLoadFn: true,
        hasComponentDidLoadFn: true,
        hasComponentShouldUpdateFn: true,
        hasComponentWillUpdateFn: true,
        hasComponentDidUpdateFn: true,
        hasComponentWillRenderFn: false,
        hasComponentDidRenderFn: false,
        hasComponentDidUnloadFn: true,
        hasConnectedCallbackFn: false,
        hasDisconnectedCallbackFn: false,
        hasElement: false,
        hasEvent: false,
        hasLifecycle: false,
        hasListener: false,
        hasListenerTarget: false,
        hasListenerTargetWindow: false,
        hasListenerTargetDocument: false,
        hasListenerTargetBody: false,
        hasListenerTargetParent: false,
        hasMember: false,
        hasMethod: false,
        hasMode: false,
        hasAttribute: false,
        hasProp: false,
        hasPropNumber: false,
        hasPropBoolean: false,
        hasPropString: false,
        hasPropMutable: false,
        hasReflect: false,
        hasRenderFn: false,
        hasState: false,
        hasStyle: false,
        hasVdomAttribute: true,
        hasVdomXlink: true,
        hasVdomClass: true,
        hasVdomFunctional: true,
        hasVdomKey: true,
        hasVdomListener: true,
        hasVdomRef: true,
        hasVdomRender: false,
        hasVdomStyle: true,
        hasVdomText: true,
        hasWatchCallback: false,
        isPlain: false,
        htmlAttrNames: [],
        htmlTagNames: [],
        isUpdateable: false,
        potentialCmpRefs: []
    };
    setComponentBuildConditionals(cmpMeta);
    moduleFile.cmps = [cmpMeta];
    // parseComponentDependencies(cmpData, cmpMeta);
    // parseContextMember(cmpData, cmpMeta);
    // parseConnectMember(cmpData, cmpMeta);
    collection.moduleFiles.push(moduleFile);
}
function excludeFromCollection(config, cmpData) {
    // this is a component from a collection dependency
    // however, this project may also become a collection
    // for example, "ionicons" is a dependency of "ionic"
    // and "ionic" is it's own stand-alone collection, so within
    // ionic's collection we want ionicons to just work
    // cmpData is a component from a collection dependency
    // if this component is listed in this config's bundles
    // then we'll need to ensure it also becomes apart of this collection
    const isInBundle = config.bundles && config.bundles.some(bundle => {
        return bundle.components && bundle.components.some(tag => tag === cmpData.tag);
    });
    // if it's not in the config bundle then it's safe to exclude
    // this component from going into this build's collection
    return !isInBundle;
}
function parseTag(cmpData) {
    return cmpData.tag;
}
function parseJsFilePath(config, collectionDir, cmpData) {
    // convert the path that's relative to the collection file
    // into an absolute path to the component's js file path
    if (typeof cmpData.componentPath !== 'string') {
        throw new Error(`parseModuleJsFilePath, "componentPath" missing on cmpData: ${cmpData.tag}`);
    }
    return normalizePath(config.sys.path.join(collectionDir, cmpData.componentPath));
}
// function parseComponentDependencies(cmpData: d.ComponentDataDeprecated, cmpMeta: d.ComponentCompilerMeta) {
//   if (invalidArrayData(cmpData.dependencies)) {
//     cmpMeta.dependencies = [];
//   } else {
//     cmpMeta.dependencies = cmpData.dependencies.sort();
//   }
// }
function parseComponentClass(cmpData) {
    return cmpData.componentClass;
}
function parseStyles(config, collectionDir, cmpData) {
    const stylesData = cmpData.styles;
    if (stylesData) {
        const modeNames = Object.keys(stylesData);
        return modeNames.map(modeName => {
            return parseStyle(config, collectionDir, cmpData, stylesData[modeName], modeName.toLowerCase());
        });
    }
    else {
        return [];
    }
}
function parseAssetsDir(config, collectionDir, cmpData) {
    if (invalidArrayData(cmpData.assetPaths)) {
        return [];
    }
    return cmpData.assetPaths.map(assetsPath => {
        const assetsMeta = {
            absolutePath: normalizePath(config.sys.path.join(collectionDir, assetsPath)),
            cmpRelativePath: normalizePath(config.sys.path.relative(config.sys.path.dirname(cmpData.componentPath), assetsPath)),
            originalComponentPath: normalizePath(assetsPath)
        };
        return assetsMeta;
    }).sort((a, b) => {
        if (a.cmpRelativePath < b.cmpRelativePath)
            return -1;
        if (a.cmpRelativePath > b.cmpRelativePath)
            return 1;
        return 0;
    });
}
function parseStyle(config, collectionDir, cmpData, modeStyleData, modeName) {
    const modeStyle = {
        modeName: modeName,
        styleId: cmpData.tag,
        styleStr: modeStyleData.style,
        styleIdentifier: null,
        externalStyles: [],
        compiledStyleText: null,
        compiledStyleTextScoped: null,
        compiledStyleTextScopedCommented: null
    };
    if (Array.isArray(modeStyleData.stylePaths)) {
        modeStyleData.stylePaths.forEach(stylePath => {
            const externalStyle = {
                absolutePath: normalizePath(config.sys.path.join(collectionDir, stylePath)),
                relativePath: normalizePath(config.sys.path.relative(config.sys.path.dirname(cmpData.componentPath), stylePath)),
                originalComponentPath: stylePath
            };
            modeStyle.externalStyles.push(externalStyle);
        });
    }
    return modeStyle;
}
function parseProps(cmpData) {
    const propsData = cmpData.props;
    if (invalidArrayData(propsData)) {
        return [];
    }
    return propsData.map(propData => {
        const type = convertType(propData.type);
        const prop = {
            name: propData.name,
            attribute: (typeof propData.attr === 'string' ? propData.attr : null),
            mutable: !!propData.mutable,
            optional: true,
            required: false,
            reflect: !!propData.reflectToAttr,
            type,
            internal: false,
            complexType: {
                original: type === 'unknown' ? 'any' : type,
                resolved: type,
                references: {},
            },
            docs: {
                text: '',
                tags: []
            }
        };
        return prop;
    });
}
function parseConnectProps(cmpData) {
    const connectData = cmpData.connect;
    if (invalidArrayData(connectData)) {
        return [];
    }
    return connectData.map(propData => {
        const prop = {
            name: propData.name,
            connect: propData.tag
        };
        return prop;
    });
}
function parseContextProps(cmpData) {
    const contextData = cmpData.context;
    if (invalidArrayData(contextData)) {
        return [];
    }
    return contextData.map(propData => {
        return {
            name: propData.name,
            context: propData.id
        };
    });
}
function parseStates(cmpData) {
    if (invalidArrayData(cmpData.states)) {
        return [];
    }
    return cmpData.states.map(state => {
        return {
            name: state.name
        };
    });
}
function parseWatchers(cmpData) {
    if (invalidArrayData(cmpData.props)) {
        return [];
    }
    const watchers = [];
    cmpData.props
        .filter(prop => prop.watch && prop.watch.length > 0)
        .forEach(prop => {
        prop.watch.forEach(watch => {
            watchers.push({
                propName: prop.name,
                methodName: watch
            });
        });
    });
    return watchers;
}
function parseListeners(cmpData) {
    const listenersData = cmpData.listeners;
    if (invalidArrayData(listenersData)) {
        return [];
    }
    return listenersData.map(listenerData => {
        const listener = {
            name: listenerData.event,
            method: listenerData.method,
            target: undefined,
            passive: (listenerData.passive !== false),
            capture: (listenerData.capture !== false)
        };
        return listener;
    });
}
function parseMethods(cmpData) {
    if (invalidArrayData(cmpData.methods)) {
        return [];
    }
    return cmpData.methods.map(methodData => {
        const method = {
            name: methodData.name,
            internal: false,
            complexType: {
                signature: '(...args: any[]) => Promise<any>',
                parameters: [],
                return: 'Promise<any>',
                references: {}
            },
            docs: {
                text: '',
                tags: []
            }
        };
        return method;
    });
}
function convertType(type) {
    switch (type) {
        case 'String': return 'string';
        case 'Any': return 'any';
        case 'Number': return 'number';
        case 'Boolean': return 'boolean';
        default: return 'unknown';
    }
}
// function parseContextMember(cmpData: d.ComponentDataDeprecated, cmpMeta: d.ComponentCompilerMeta) {
//   if (invalidArrayData(cmpData.context)) {
//     return;
//   }
//   cmpData.context.forEach(methodData => {
//     if (methodData.id) {
//       cmpMeta.membersMeta = cmpMeta.membersMeta || {};
//       cmpMeta.membersMeta[methodData.name] = {
//         memberType: MEMBER_FLAGS.PropContext,
//         ctrlId: methodData.id
//       };
//     }
//   });
// }
// function parseConnectMember(cmpData: d.ComponentDataDeprecated, cmpMeta: d.ComponentCompilerMeta) {
//   if (invalidArrayData(cmpData.connect)) {
//     return;
//   }
//   cmpData.connect.forEach(methodData => {
//     if (methodData.tag) {
//       cmpMeta.membersMeta = cmpMeta.membersMeta || {};
//       cmpMeta.membersMeta[methodData.name] = {
//         memberType: MEMBER_FLAGS.PropConnect,
//         ctrlId: methodData.tag
//       };
//     }
//   });
// }
function parseHostElementMember(cmpData) {
    if (!cmpData.hostElement) {
        return undefined;
    }
    return cmpData.hostElement.name;
}
function parseEvents(cmpData) {
    const eventsData = cmpData.events;
    if (invalidArrayData(eventsData)) {
        return [];
    }
    return eventsData.map(eventData => {
        const event = {
            name: eventData.event,
            method: (eventData.method) ? eventData.method : eventData.event,
            bubbles: (eventData.bubbles !== false),
            cancelable: (eventData.cancelable !== false),
            composed: (eventData.composed !== false),
            internal: false,
            docs: {
                text: '',
                tags: []
            },
            complexType: {
                original: 'any',
                resolved: 'any',
                references: {}
            }
        };
        return event;
    });
}
function parseEncapsulation(cmpData) {
    if (cmpData.shadow === true) {
        return 'shadow';
    }
    else if (cmpData.scoped === true) {
        return 'scoped';
    }
    else {
        return 'none';
    }
}
function invalidArrayData(arr) {
    return (!arr || !Array.isArray(arr) || arr.length === 0);
}

function parseCollectionComponents(config, compilerCtx, buildCtx, collectionDir, collectionManifest, collection) {
    collection.moduleFiles = collection.moduleFiles || [];
    parseComponentsDeprecated(config, compilerCtx, collection, collectionDir, collectionManifest);
    if (collectionManifest.entries) {
        collectionManifest.entries.forEach(entryPath => {
            const componentPath = config.sys.path.join(collectionDir, entryPath);
            const sourceText = compilerCtx.fs.readFileSync(componentPath);
            transpileCollectionEntry(config, compilerCtx, buildCtx, collection, componentPath, sourceText);
        });
    }
}
function transpileCollectionEntry(config, compilerCtx, buildCtx, collection, inputFileName, sourceText) {
    const options = ts$1__default.getDefaultCompilerOptions();
    options.isolatedModules = true;
    options.suppressOutputPathCheck = true;
    options.allowNonTsExtensions = true;
    options.noLib = true;
    options.lib = undefined;
    options.types = undefined;
    options.noEmit = undefined;
    options.noEmitOnError = undefined;
    options.paths = undefined;
    options.rootDirs = undefined;
    options.declaration = undefined;
    options.composite = undefined;
    options.declarationDir = undefined;
    options.out = undefined;
    options.outFile = undefined;
    options.noResolve = true;
    options.module = ts$1__default.ModuleKind.ESNext;
    options.target = ts$1__default.ScriptTarget.ES2017;
    const sourceFile = ts$1__default.createSourceFile(inputFileName, sourceText, options.target);
    const compilerHost = {
        getSourceFile: fileName => fileName === inputFileName ? sourceFile : undefined,
        writeFile: noop,
        getDefaultLibFileName: () => 'lib.d.ts',
        useCaseSensitiveFileNames: () => false,
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => '',
        getNewLine: () => '',
        fileExists: fileName => fileName === inputFileName,
        readFile: () => '',
        directoryExists: () => true,
        getDirectories: () => []
    };
    const program = ts$1__default.createProgram([inputFileName], options, compilerHost);
    const typeChecker = program.getTypeChecker();
    program.emit(undefined, undefined, undefined, undefined, {
        after: [
            convertStaticToMeta(config, compilerCtx, buildCtx, typeChecker, collection, {
                coreImportPath: '@stencil/core',
                componentExport: null,
                componentMetadata: null,
                proxy: null,
                style: 'static'
            })
        ]
    });
}

const parseCollectionManifest = (config, compilerCtx, buildCtx, collectionName, collectionDir, collectionJsonStr) => {
    const collectionManifest = JSON.parse(collectionJsonStr);
    const compilerVersion = collectionManifest.compiler || {};
    const collection = {
        collectionName: collectionName,
        dependencies: parseCollectionDependencies(collectionManifest),
        compiler: {
            name: compilerVersion.name || '',
            version: compilerVersion.version || '',
            typescriptVersion: compilerVersion.typescriptVersion || ''
        },
        bundles: parseBundles(collectionManifest),
        global: parseGlobal(config, compilerCtx, collectionDir, collectionManifest)
    };
    parseCollectionComponents(config, compilerCtx, buildCtx, collectionDir, collectionManifest, collection);
    return collection;
};
const parseCollectionDependencies = (collectionManifest) => {
    return (collectionManifest.collections || []).map(c => c.name);
};
const parseGlobal = (config, compilerCtx, collectionDir, collectionManifest) => {
    if (typeof collectionManifest.global !== 'string') {
        return undefined;
    }
    const sourceFilePath = normalizePath(config.sys.path.join(collectionDir, collectionManifest.global));
    const globalModule = getModule(config, compilerCtx, sourceFilePath);
    globalModule.jsFilePath = normalizePath(config.sys.path.join(collectionDir, collectionManifest.global));
    return globalModule;
};
const parseBundles = (collectionManifest) => {
    if (invalidArrayData$1(collectionManifest.bundles)) {
        return [];
    }
    return collectionManifest.bundles.map(b => {
        return {
            components: b.components.slice().sort()
        };
    });
};
const invalidArrayData$1 = (arr) => {
    return (!arr || !Array.isArray(arr) || arr.length === 0);
};

const parseCollection = (config, compilerCtx, buildCtx, pkgJsonFilePath, pkgData) => {
    // note this MUST be synchronous because this is used during transpile
    const collectionName = pkgData.name;
    let collection = compilerCtx.collections.find(c => c.collectionName === collectionName);
    if (collection != null) {
        // we've already cached the collection, no need for another resolve/readFile/parse
        // thought being that /node_modules/ isn't changing between watch builds
        return collection;
    }
    // get the root directory of the dependency
    const collectionPackageRootDir = config.sys.path.dirname(pkgJsonFilePath);
    // figure out the full path to the collection collection file
    const collectionFilePath = config.sys.path.join(collectionPackageRootDir, pkgData.collection);
    const relPath = config.sys.path.relative(config.rootDir, collectionFilePath);
    config.logger.debug(`load collection: ${collectionName}, ${relPath}`);
    // we haven't cached the collection yet, let's read this file
    // sync on purpose :(
    const collectionJsonStr = compilerCtx.fs.readFileSync(collectionFilePath);
    // get the directory where the collection collection file is sitting
    const collectionDir = normalizePath(config.sys.path.dirname(collectionFilePath));
    // parse the json string into our collection data
    collection = parseCollectionManifest(config, compilerCtx, buildCtx, collectionName, collectionDir, collectionJsonStr);
    if (pkgData.module && pkgData.module !== pkgData.main) {
        collection.hasExports = true;
    }
    // remember the source of this collection node_module
    collection.moduleDir = collectionPackageRootDir;
    // cache it for later yo
    compilerCtx.collections.push(collection);
    return collection;
};

const addExternalImport = (config, compilerCtx, buildCtx, moduleFile, resolveFromDir, moduleId) => {
    moduleFile.externalImports = moduleFile.externalImports || [];
    if (!moduleFile.externalImports.includes(moduleId)) {
        moduleFile.externalImports.push(moduleId);
        moduleFile.externalImports.sort();
    }
    compilerCtx.resolvedCollections = compilerCtx.resolvedCollections || new Set();
    if (compilerCtx.resolvedCollections.has(moduleId)) {
        // we've already handled this collection moduleId before
        return;
    }
    // cache that we've already parsed this
    compilerCtx.resolvedCollections.add(moduleId);
    let pkgJsonFilePath;
    try {
        // get the full package.json file path
        pkgJsonFilePath = normalizePath(config.sys.resolveModule(resolveFromDir, moduleId));
    }
    catch (e) {
        // it's someone else's job to handle unresolvable paths
        return;
    }
    if (pkgJsonFilePath === 'package.json') {
        // the resolved package is actually this very same package, so whatever
        return;
    }
    // open up and parse the package.json
    // sync on purpose :(
    const pkgJsonStr = compilerCtx.fs.readFileSync(pkgJsonFilePath);
    const pkgData = JSON.parse(pkgJsonStr);
    if (typeof pkgData.collection !== 'string' || !pkgData.collection.endsWith('.json')) {
        // this import is not a stencil collection
        return;
    }
    if (typeof pkgData.types !== 'string' || !pkgData.types.endsWith('.d.ts')) {
        // this import should have types
        return;
    }
    // this import is a stencil collection
    // let's parse it and gather all the module data about it
    // internally it'll cached collection data if we've already done this
    const collection = parseCollection(config, compilerCtx, buildCtx, pkgJsonFilePath, pkgData);
    // check if we already added this collection to the build context
    const alreadyHasCollection = buildCtx.collections.some(c => {
        return c.collectionName === collection.collectionName;
    });
    if (alreadyHasCollection) {
        // we already have this collection in our build context
        return;
    }
    // let's add the collection to the build context
    buildCtx.collections.push(collection);
    if (Array.isArray(collection.dependencies)) {
        // this collection has more collections
        // let's keep digging down and discover all of them
        collection.dependencies.forEach(dependencyModuleId => {
            const resolveFromDir = config.sys.path.dirname(pkgJsonFilePath);
            addExternalImport(config, compilerCtx, buildCtx, moduleFile, resolveFromDir, dependencyModuleId);
        });
    }
};

const parseImport = (config, compilerCtx, buildCtx, moduleFile, dirPath, importNode) => {
    if (importNode.moduleSpecifier && ts$1__default.isStringLiteral(importNode.moduleSpecifier)) {
        let importPath = importNode.moduleSpecifier.text;
        if (!moduleFile.originalImports.includes(importPath)) {
            moduleFile.originalImports.push(importPath);
        }
        if (config.sys.path.isAbsolute(importPath)) {
            // absolute import
            importPath = normalizePath(importPath);
            moduleFile.localImports.push(importPath);
        }
        else if (importPath.startsWith('.')) {
            // relative import
            importPath = normalizePath(config.sys.path.resolve(dirPath, importPath));
            moduleFile.localImports.push(importPath);
        }
        else {
            // node resolve side effect import
            addExternalImport(config, compilerCtx, buildCtx, moduleFile, config.rootDir, importPath);
            // test if this side effect import is a collection
            const isCollectionImport = compilerCtx.collections.some(c => {
                return c.collectionName === importPath;
            });
            if (!importNode.importClause && isCollectionImport) {
                // turns out this is a side effect import is a collection,
                // we actually don't want to include this in the JS output
                // we've already gather the types we needed, kthxbai
                return null;
            }
        }
    }
    return importNode;
};

const parseStaticMethods = (staticMembers) => {
    const parsedMethods = getStaticValue(staticMembers, 'methods');
    if (!parsedMethods) {
        return [];
    }
    const methodNames = Object.keys(parsedMethods);
    if (methodNames.length === 0) {
        return [];
    }
    return methodNames.map(methodName => {
        return {
            name: methodName,
            docs: parsedMethods[methodName].docs,
            complexType: parsedMethods[methodName].complexType,
            internal: isInternal(parsedMethods[methodName].docs)
        };
    });
};

const parseStaticListeners = (staticMembers) => {
    const parsedListeners = getStaticValue(staticMembers, 'listeners');
    if (!parsedListeners || parsedListeners.length === 0) {
        return [];
    }
    return parsedListeners.map(parsedListener => {
        return {
            name: parsedListener.name,
            method: parsedListener.method,
            capture: !!parsedListener.capture,
            passive: !!parsedListener.passive,
            target: parsedListener.target
        };
    });
};

const parseClassMethods = (cmpNode, cmpMeta) => {
    const classMembers = cmpNode.members;
    if (!classMembers || classMembers.length === 0) {
        return;
    }
    const classMethods = classMembers.filter(m => ts$1__default.isMethodDeclaration(m));
    if (classMethods.length === 0) {
        return;
    }
    const hasHostData = classMethods.some(m => isMethod(m, 'hostData'));
    cmpMeta.hasAttributeChangedCallbackFn = classMethods.some(m => isMethod(m, 'attributeChangedCallback'));
    cmpMeta.hasConnectedCallbackFn = classMethods.some(m => isMethod(m, 'connectedCallback'));
    cmpMeta.hasDisconnectedCallbackFn = classMethods.some(m => isMethod(m, 'disconnectedCallback'));
    cmpMeta.hasComponentWillLoadFn = classMethods.some(m => isMethod(m, 'componentWillLoad'));
    cmpMeta.hasComponentWillUpdateFn = classMethods.some(m => isMethod(m, 'componentWillUpdate'));
    cmpMeta.hasComponentWillRenderFn = classMethods.some(m => isMethod(m, 'componentWillRender'));
    cmpMeta.hasComponentDidRenderFn = classMethods.some(m => isMethod(m, 'componentDidRender'));
    cmpMeta.hasComponentDidLoadFn = classMethods.some(m => isMethod(m, 'componentDidLoad'));
    cmpMeta.hasComponentShouldUpdateFn = classMethods.some(m => isMethod(m, 'componentShouldUpdate'));
    cmpMeta.hasComponentDidUpdateFn = classMethods.some(m => isMethod(m, 'componentDidUpdate'));
    cmpMeta.hasComponentDidUnloadFn = classMethods.some(m => isMethod(m, 'componentDidUnload'));
    cmpMeta.hasLifecycle = (cmpMeta.hasComponentWillLoadFn || cmpMeta.hasComponentDidLoadFn || cmpMeta.hasComponentWillUpdateFn || cmpMeta.hasComponentDidUpdateFn);
    cmpMeta.hasRenderFn = classMethods.some(m => isMethod(m, 'render')) || hasHostData;
    cmpMeta.hasVdomRender = cmpMeta.hasVdomRender || hasHostData;
};

const parseStaticElementRef = (staticMembers) => {
    const parsedElementRef = getStaticValue(staticMembers, 'elementRef');
    if (typeof parsedElementRef === 'string') {
        return parsedElementRef;
    }
    return null;
};

const parseStaticEncapsulation = (staticMembers) => {
    let encapsulation = getStaticValue(staticMembers, 'encapsulation');
    if (typeof encapsulation === 'string') {
        encapsulation = encapsulation.toLowerCase().trim();
        if (encapsulation === 'shadow' || encapsulation === 'scoped') {
            return encapsulation;
        }
    }
    return 'none';
};

const parseStaticEvents = (staticMembers) => {
    const parsedEvents = getStaticValue(staticMembers, 'events');
    if (!parsedEvents || parsedEvents.length === 0) {
        return [];
    }
    return parsedEvents.map(parsedEvent => {
        return {
            name: parsedEvent.name,
            method: parsedEvent.method,
            bubbles: parsedEvent.bubbles,
            cancelable: parsedEvent.cancelable,
            composed: parsedEvent.composed,
            docs: parsedEvent.docs,
            complexType: parsedEvent.complexType,
            internal: isInternal(parsedEvent.docs)
        };
    });
};

const parseStaticProps = (staticMembers) => {
    const parsedProps = getStaticValue(staticMembers, 'properties');
    if (!parsedProps) {
        return [];
    }
    const propNames = Object.keys(parsedProps);
    if (propNames.length === 0) {
        return [];
    }
    return propNames.map(propName => {
        const val = parsedProps[propName];
        return {
            name: propName,
            type: val.type,
            attribute: val.attribute ? val.attribute.toLowerCase() : undefined,
            reflect: (typeof val.reflect === 'boolean' ? val.reflect : (typeof val.reflect === 'boolean' ? val.reflect : false)),
            mutable: !!val.mutable,
            required: !!val.required,
            optional: !!val.optional,
            defaultValue: val.defaultValue,
            complexType: val.complexType,
            docs: val.docs,
            internal: isInternal(val.docs)
        };
    });
};

const parseStaticStates = (staticMembers) => {
    const parsedStates = getStaticValue(staticMembers, 'states');
    if (!parsedStates) {
        return [];
    }
    const stateNames = Object.keys(parsedStates);
    if (stateNames.length === 0) {
        return [];
    }
    return stateNames.map(stateName => {
        return {
            name: stateName,
        };
    });
};

const parseStaticWatchers = (staticMembers) => {
    const parsedWatchers = getStaticValue(staticMembers, 'watchers');
    if (!parsedWatchers || parsedWatchers.length === 0) {
        return [];
    }
    return parsedWatchers.map(parsedWatch => {
        return {
            propName: parsedWatch.propName,
            methodName: parsedWatch.methodName
        };
    });
};

const normalizeStyles = (config, tagName, componentFilePath, styles) => {
    styles.forEach(style => {
        if (style.modeName === DEFAULT_STYLE_MODE) {
            style.styleId = tagName.toUpperCase();
        }
        else {
            style.styleId = `${tagName.toUpperCase()}#${style.modeName}`;
        }
        if (Array.isArray(style.externalStyles)) {
            style.externalStyles.forEach(externalStyle => {
                normalizeExternalStyle(config, componentFilePath, externalStyle);
            });
        }
    });
};
const normalizeExternalStyle = (config, componentFilePath, externalStyle) => {
    if (typeof externalStyle.originalComponentPath !== 'string' || externalStyle.originalComponentPath.trim().length === 0) {
        return;
    }
    // get the absolute path of the directory which the component is sitting in
    const componentDir = config.sys.path.dirname(componentFilePath);
    if (config.sys.path.isAbsolute(externalStyle.originalComponentPath)) {
        // this path is absolute already!
        // add to our list of style absolute paths
        externalStyle.absolutePath = normalizePath(externalStyle.originalComponentPath);
        // if this is an absolute path already, let's convert it to be relative
        externalStyle.relativePath = normalizePath(config.sys.path.relative(componentDir, externalStyle.originalComponentPath));
    }
    else {
        // this path is relative to the component
        // add to our list of style relative paths
        externalStyle.relativePath = normalizePath(externalStyle.originalComponentPath);
        // create the absolute path to the style file
        externalStyle.absolutePath = normalizePath(config.sys.path.join(componentDir, externalStyle.originalComponentPath));
    }
};

const parseStaticStyles = (config, compilerCtx, tagName, componentFilePath, isCollectionDependency, staticMembers) => {
    const styles = [];
    const styleUrlsProp = isCollectionDependency ? 'styleUrls' : 'originalStyleUrls';
    const parsedStyleUrls = getStaticValue(staticMembers, styleUrlsProp);
    let parsedStyle = getStaticValue(staticMembers, 'styles');
    if (parsedStyle) {
        if (typeof parsedStyle === 'string') {
            // styles: 'div { padding: 10px }'
            parsedStyle = parsedStyle.trim();
            if (parsedStyle.length > 0) {
                styles.push({
                    modeName: DEFAULT_STYLE_MODE,
                    styleId: null,
                    styleStr: parsedStyle,
                    styleIdentifier: null,
                    compiledStyleText: null,
                    compiledStyleTextScoped: null,
                    compiledStyleTextScopedCommented: null,
                    externalStyles: []
                });
                compilerCtx.styleModeNames.add(DEFAULT_STYLE_MODE);
            }
        }
        else if (parsedStyle.__identifier) {
            styles.push(parseStyleIdentifier(parsedStyle));
            compilerCtx.styleModeNames.add(DEFAULT_STYLE_MODE);
        }
    }
    if (parsedStyleUrls && typeof parsedStyleUrls === 'object') {
        Object.keys(parsedStyleUrls).forEach(modeName => {
            const externalStyles = [];
            const styleObj = parsedStyleUrls[modeName];
            styleObj.forEach(styleUrl => {
                if (typeof styleUrl === 'string' && styleUrl.trim().length > 0) {
                    externalStyles.push({
                        absolutePath: null,
                        relativePath: null,
                        originalComponentPath: styleUrl.trim()
                    });
                }
            });
            if (externalStyles.length > 0) {
                const style = {
                    modeName: modeName,
                    styleId: null,
                    styleStr: null,
                    styleIdentifier: null,
                    compiledStyleText: null,
                    compiledStyleTextScoped: null,
                    compiledStyleTextScopedCommented: null,
                    externalStyles: externalStyles
                };
                styles.push(style);
                compilerCtx.styleModeNames.add(modeName);
            }
        });
    }
    normalizeStyles(config, tagName, componentFilePath, styles);
    return sortBy(styles, s => s.modeName);
};
const parseStyleIdentifier = (parsedStyle) => {
    const style = {
        modeName: DEFAULT_STYLE_MODE,
        styleId: null,
        styleStr: null,
        styleIdentifier: parsedStyle.__escapedText,
        compiledStyleText: null,
        compiledStyleTextScoped: null,
        compiledStyleTextScopedCommented: null,
        externalStyles: []
    };
    return style;
};

const parseStringLiteral = (m, node) => {
    if (typeof node.text === 'string' && node.text.includes('</')) {
        if (node.text.includes('<slot')) {
            m.htmlTagNames.push('slot');
        }
        if (node.text.includes('<svg')) {
            m.htmlTagNames.push('svg');
        }
    }
};

const parseStaticComponentMeta = (config, compilerCtx, typeChecker, cmpNode, moduleFile, nodeMap, transformOpts, fileCmpNodes) => {
    if (cmpNode.members == null) {
        return cmpNode;
    }
    const staticMembers = cmpNode.members.filter(isStaticGetter);
    const tagName = getComponentTagName(staticMembers);
    if (tagName == null) {
        return cmpNode;
    }
    const symbol = typeChecker.getSymbolAtLocation(cmpNode.name);
    const docs = serializeSymbol(typeChecker, symbol);
    const isCollectionDependency = moduleFile.isCollectionDependency;
    const cmp = {
        isLegacy: false,
        tagName: tagName,
        excludeFromCollection: moduleFile.excludeFromCollection,
        isCollectionDependency,
        componentClassName: (cmpNode.name ? cmpNode.name.text : ''),
        elementRef: parseStaticElementRef(staticMembers),
        encapsulation: parseStaticEncapsulation(staticMembers),
        properties: parseStaticProps(staticMembers),
        virtualProperties: parseVirtualProps(docs),
        states: parseStaticStates(staticMembers),
        methods: parseStaticMethods(staticMembers),
        listeners: parseStaticListeners(staticMembers),
        events: parseStaticEvents(staticMembers),
        watchers: parseStaticWatchers(staticMembers),
        styles: parseStaticStyles(config, compilerCtx, tagName, moduleFile.sourceFilePath, isCollectionDependency, staticMembers),
        legacyConnect: getStaticValue(staticMembers, 'connectProps') || [],
        legacyContext: getStaticValue(staticMembers, 'contextProps') || [],
        internal: isInternal(docs),
        assetsDirs: parseAssetsDirs(config, staticMembers, moduleFile.jsFilePath),
        styleDocs: [],
        docs,
        jsFilePath: moduleFile.jsFilePath,
        sourceFilePath: moduleFile.sourceFilePath,
        hasAttributeChangedCallbackFn: false,
        hasComponentWillLoadFn: false,
        hasComponentDidLoadFn: false,
        hasComponentShouldUpdateFn: false,
        hasComponentWillUpdateFn: false,
        hasComponentDidUpdateFn: false,
        hasComponentWillRenderFn: false,
        hasComponentDidRenderFn: false,
        hasComponentDidUnloadFn: false,
        hasConnectedCallbackFn: false,
        hasDisconnectedCallbackFn: false,
        hasElement: false,
        hasEvent: false,
        hasLifecycle: false,
        hasListener: false,
        hasListenerTarget: false,
        hasListenerTargetWindow: false,
        hasListenerTargetDocument: false,
        hasListenerTargetBody: false,
        hasListenerTargetParent: false,
        hasMember: false,
        hasMethod: false,
        hasMode: false,
        hasAttribute: false,
        hasProp: false,
        hasPropNumber: false,
        hasPropBoolean: false,
        hasPropString: false,
        hasPropMutable: false,
        hasReflect: false,
        hasRenderFn: false,
        hasState: false,
        hasStyle: false,
        hasVdomAttribute: false,
        hasVdomXlink: false,
        hasVdomClass: false,
        hasVdomFunctional: false,
        hasVdomKey: false,
        hasVdomListener: false,
        hasVdomRef: false,
        hasVdomRender: false,
        hasVdomStyle: false,
        hasVdomText: false,
        hasWatchCallback: false,
        isPlain: false,
        htmlAttrNames: [],
        htmlTagNames: [],
        isUpdateable: false,
        potentialCmpRefs: []
    };
    const visitComponentChildNode = (node) => {
        if (ts$1__default.isCallExpression(node)) {
            parseCallExpression(cmp, node);
        }
        else if (ts$1__default.isStringLiteral(node)) {
            parseStringLiteral(cmp, node);
        }
        node.forEachChild(visitComponentChildNode);
    };
    visitComponentChildNode(cmpNode);
    parseClassMethods(cmpNode, cmp);
    cmp.legacyConnect.forEach(({ connect }) => {
        cmp.htmlTagNames.push(connect);
        if (connect.includes('-')) {
            cmp.potentialCmpRefs.push(connect);
        }
    });
    cmp.htmlAttrNames = unique(cmp.htmlAttrNames);
    cmp.htmlTagNames = unique(cmp.htmlTagNames);
    cmp.potentialCmpRefs = unique(cmp.potentialCmpRefs);
    setComponentBuildConditionals(cmp);
    if (transformOpts.componentMetadata === 'compilerstatic') {
        cmpNode = addComponentMetaStatic(cmpNode, cmp);
    }
    // add to module map
    moduleFile.cmps.push(cmp);
    // add to node map
    nodeMap.set(cmpNode, cmp);
    fileCmpNodes.push(cmpNode);
    return cmpNode;
};
const parseVirtualProps = (docs) => {
    return docs.tags
        .filter(({ name }) => name === 'virtualProp')
        .map(parseVirtualProp)
        .filter(prop => !!prop);
};
const parseVirtualProp = (tag) => {
    const results = /^\s*(?:\{([^}]+)\}\s+)?(\w+)\s+-\s+(.*)$/.exec(tag.text);
    if (!results) {
        return undefined;
    }
    const [, type, name, docs] = results;
    return {
        type: type == null ? 'any' : type.trim(),
        name: name.trim(),
        docs: docs.trim()
    };
};
const parseAssetsDirs = (config, staticMembers, componentFilePath) => {
    const dirs = getStaticValue(staticMembers, 'assetsDirs') || [];
    const componentDir = normalizePath(config.sys.path.dirname(componentFilePath));
    return dirs.map(dir => {
        // get the relative path from the component file to the assets directory
        dir = normalizePath(dir.trim());
        let absolutePath = dir;
        let cmpRelativePath = dir;
        if (config.sys.path.isAbsolute(dir)) {
            // if this is an absolute path already, let's convert it to be relative
            cmpRelativePath = config.sys.path.relative(componentDir, dir);
        }
        else {
            // create the absolute path to the asset dir
            absolutePath = config.sys.path.join(componentDir, dir);
        }
        return {
            absolutePath,
            cmpRelativePath,
            originalComponentPath: dir,
        };
    });
};

const convertStaticToMeta = (config, compilerCtx, buildCtx, typeChecker, collection, transformOpts) => {
    return transformCtx => {
        let dirPath;
        let moduleFile;
        const fileCmpNodes = [];
        const visitNode = (node) => {
            if (ts$1__default.isClassDeclaration(node)) {
                return parseStaticComponentMeta(config, compilerCtx, typeChecker, node, moduleFile, compilerCtx.nodeMap, transformOpts, fileCmpNodes);
            }
            else if (ts$1__default.isImportDeclaration(node)) {
                return parseImport(config, compilerCtx, buildCtx, moduleFile, dirPath, node);
            }
            else if (ts$1__default.isCallExpression(node)) {
                parseCallExpression(moduleFile, node);
            }
            else if (ts$1__default.isStringLiteral(node)) {
                parseStringLiteral(moduleFile, node);
            }
            return ts$1__default.visitEachChild(node, visitNode, transformCtx);
        };
        return tsSourceFile => {
            dirPath = config.sys.path.dirname(tsSourceFile.fileName);
            moduleFile = getModule(config, compilerCtx, tsSourceFile.fileName);
            resetModule(moduleFile);
            if (collection != null) {
                moduleFile.isCollectionDependency = true;
                moduleFile.collectionName = collection.collectionName;
                collection.moduleFiles.push(moduleFile);
            }
            else {
                moduleFile.isCollectionDependency = false;
                moduleFile.collectionName = null;
            }
            return visitNode(tsSourceFile);
        };
    };
};

const updateStencilCoreImports = (updatedCoreImportPath) => {
    return transformCtx => {
        const visit = (tsSourceFile, node) => {
            if (ts$1__default.isImportDeclaration(node)) {
                return updateStencilCoreImport(node, updatedCoreImportPath);
            }
            return ts$1__default.visitEachChild(node, node => visit(tsSourceFile, node), transformCtx);
        };
        return tsSourceFile => {
            return visit(tsSourceFile, tsSourceFile);
        };
    };
};
const updateStencilCoreImport = (importNode, updatedCoreImportPath) => {
    if (importNode.moduleSpecifier != null && ts$1__default.isStringLiteral(importNode.moduleSpecifier)) {
        if (importNode.moduleSpecifier.text === '@stencil/core') {
            if (importNode.importClause && importNode.importClause.namedBindings && importNode.importClause.namedBindings.kind === ts$1__default.SyntaxKind.NamedImports) {
                const origImports = importNode.importClause.namedBindings.elements;
                const keepImports = origImports
                    .map(e => e.getText())
                    .filter(name => KEEP_IMPORTS.has(name));
                if (keepImports.length > 0) {
                    return ts$1__default.updateImportDeclaration(importNode, undefined, undefined, ts$1__default.createImportClause(undefined, ts$1__default.createNamedImports(keepImports.map(name => ts$1__default.createImportSpecifier(undefined, ts$1__default.createIdentifier(name))))), ts$1__default.createStringLiteral(updatedCoreImportPath));
                }
            }
            return null;
        }
    }
    return importNode;
};
const KEEP_IMPORTS = new Set([
    'h',
    'setMode',
    'getMode',
    'Build',
    'Host',
    'getAssetPath',
    'writeTask',
    'readTask',
    'getElement'
]);

/**
 * Mainly used as the typescript preprocessor for unit tests
 */
const transpileModule = (config, input, transformOpts, sourceFilePath) => {
    const compilerCtx = new CompilerContext(config);
    const buildCtx = new BuildContext(config, compilerCtx);
    if (typeof sourceFilePath === 'string') {
        sourceFilePath = normalizePath(sourceFilePath);
    }
    else {
        sourceFilePath = (transformOpts.jsx ? `module.tsx` : `module.ts`);
    }
    const results = {
        sourceFilePath: sourceFilePath,
        code: null,
        map: null,
        diagnostics: [],
        moduleFile: null,
        build: {}
    };
    if ((sourceFilePath.endsWith('.tsx') || sourceFilePath.endsWith('.jsx')) && transformOpts.jsx == null) {
        // ensure we're setup for JSX in typescript
        transformOpts.jsx = ts$1__default.JsxEmit.React;
    }
    if (transformOpts.jsx != null && typeof transformOpts.jsxFactory !== 'string') {
        transformOpts.jsxFactory = 'h';
    }
    const sourceFile = ts$1__default.createSourceFile(sourceFilePath, input, transformOpts.target);
    // Create a compilerHost object to allow the compiler to read and write files
    const compilerHost = {
        getSourceFile: fileName => {
            return normalizePath(fileName) === normalizePath(sourceFilePath) ? sourceFile : undefined;
        },
        writeFile: (name, text) => {
            if (name.endsWith('.map')) {
                results.map = text;
            }
            else {
                results.code = text;
            }
        },
        getDefaultLibFileName: () => `lib.d.ts`,
        useCaseSensitiveFileNames: () => false,
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => '',
        getNewLine: () => ts$1__default.sys.newLine,
        fileExists: fileName => normalizePath(fileName) === normalizePath(sourceFilePath),
        readFile: () => '',
        directoryExists: () => true,
        getDirectories: () => []
    };
    const program = ts$1__default.createProgram([sourceFilePath], transformOpts, compilerHost);
    const typeChecker = program.getTypeChecker();
    const after = [
        convertStaticToMeta(config, compilerCtx, buildCtx, typeChecker, null, transformOpts)
    ];
    if (transformOpts.componentExport === 'customelement' || transformOpts.componentExport === 'native') {
        after.push(nativeComponentTransform(compilerCtx, transformOpts));
    }
    else {
        after.push(lazyComponentTransform(compilerCtx, transformOpts));
    }
    program.emit(undefined, undefined, undefined, false, {
        before: [
            convertDecoratorsToStatic(config, buildCtx.diagnostics, typeChecker),
            updateStencilCoreImports(transformOpts.coreImportPath)
        ],
        after
    });
    const tsDiagnostics = [...program.getSyntacticDiagnostics()];
    if (config.validateTypes) {
        tsDiagnostics.push(...program.getOptionsDiagnostics());
    }
    buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(tsDiagnostics));
    results.diagnostics.push(...buildCtx.diagnostics);
    results.moduleFile = compilerCtx.moduleMap.get(results.sourceFilePath);
    return results;
};

const compile = async (code, opts = {}) => {
    const r = {
        diagnostics: [],
        code: (typeof code === 'string' ? code : ''),
        map: null,
        inputFilePath: (typeof opts.file === 'string' ? opts.file.trim() : 'module.tsx'),
        outputFilePath: null,
        inputOptions: null,
        imports: [],
        componentMeta: []
    };
    try {
        const config = getCompilerConfig();
        r.inputOptions = getCompileOptions(opts, r.inputFilePath);
        if (r.inputOptions.type === 'tsx' || r.inputOptions.type === 'ts' || r.inputOptions.type === 'jsx') {
            initTypescript();
            const transformOpts = getTransformOptions(r.inputOptions);
            const transpileResults = transpileModule(config, code, transformOpts, r.inputFilePath);
            r.diagnostics.push(...transpileResults.diagnostics);
            if (typeof transpileResults.code === 'string') {
                r.code = transpileResults.code;
            }
            r.map = transpileResults.map;
            if (typeof transpileResults.sourceFilePath === 'string') {
                r.inputFilePath = transpileResults.sourceFilePath;
            }
            const moduleFile = transpileResults.moduleFile;
            if (moduleFile) {
                r.outputFilePath = moduleFile.jsFilePath;
                moduleFile.cmps.forEach(cmp => {
                    r.componentMeta.push(getPublicCompilerMeta(cmp));
                });
                moduleFile.originalImports.forEach(originalImport => {
                    r.imports.push({
                        path: originalImport
                    });
                });
            }
        }
        else if (r.inputOptions.type === 'dts') {
            r.code = '';
            r.map = null;
        }
        else if (r.inputOptions.type === 'css') {
            const styleData = opts.data;
            const cssResults = transformCssToEsm(config, code, r.inputFilePath, styleData.tag, styleData.encapsulation, styleData.mode);
            r.code = cssResults.code;
            r.map = cssResults.map;
        }
    }
    catch (e) {
        catchError(r.diagnostics, e);
    }
    return r;
};

const createCompiler = () => {
    const stencilResolved = new Map();
    const diagnostics = [];
    const defaultOpts = {};
    const reset = () => {
        stencilResolved.clear();
        diagnostics.length = 0;
    };
    const getResolvedData = (id) => {
        return stencilResolved.get(id);
    };
    const setResolvedData = (id, r) => {
        return stencilResolved.set(id, r);
    };
    return {
        resolveId(importee, importer) {
            // import Css from 'stencil?tag=cmp-a&scopeId=sc-cmp-a-md&mode=md!./filepath.css
            const r = parseStencilImportPath(importee, importer);
            if (r != null) {
                setResolvedData(r.resolvedId, r);
                return r;
            }
            return null;
        },
        getLoadPath(filePath) {
            if (typeof filePath === 'string') {
                return filePath.split('?')[0];
            }
            return null;
        },
        async transform(code, filePath, opts) {
            const r = getResolvedData(filePath);
            if (r != null) {
                const compileOpts = Object.assign({}, defaultOpts, opts);
                compileOpts.type = r.type;
                compileOpts.file = r.resolvedFilePath;
                compileOpts.data = r.data;
                const results = await compile(code, compileOpts);
                return {
                    code: results.code,
                    map: results.map,
                    diagnostics: results.diagnostics
                };
            }
            return null;
        },
        writeBuild() {
            reset();
        },
        reset,
        getResolvedData,
        setResolvedData,
    };
};

function parseStyleDocs(styleDocs, styleText) {
    if (typeof styleText !== 'string') {
        return;
    }
    let startIndex;
    while ((startIndex = styleText.indexOf(CSS_DOC_START)) > -1) {
        styleText = styleText.substring(startIndex + CSS_DOC_START.length);
        const endIndex = styleText.indexOf(CSS_DOC_END);
        if (endIndex === -1) {
            break;
        }
        const comment = styleText.substring(0, endIndex);
        parseCssComment(styleDocs, comment);
        styleText = styleText.substring(endIndex + CSS_DOC_END.length);
    }
}
function parseCssComment(styleDocs, comment) {
    /**
     * @prop --max-width: Max width of the alert
     */
    const lines = comment.split(/\r?\n/).map(line => {
        line = line.trim();
        while (line.startsWith('*')) {
            line = line.substring(1).trim();
        }
        return line;
    });
    comment = lines.join(' ').replace(/\t/g, ' ').trim();
    while (comment.includes('  ')) {
        comment = comment.replace('  ', ' ');
    }
    const docs = comment.split(CSS_PROP_ANNOTATION);
    docs.forEach(d => {
        const doc = d.trim();
        if (!doc.startsWith(`--`)) {
            return;
        }
        const splt = doc.split(`:`);
        const cssDoc = {
            name: splt[0].trim(),
            docs: (splt.shift() && splt.join(`:`)).trim(),
            annotation: 'prop'
        };
        if (!styleDocs.some(c => c.name === cssDoc.name && c.annotation === 'prop')) {
            styleDocs.push(cssDoc);
        }
    });
    return styleDocs;
}
const CSS_DOC_START = `/**`;
const CSS_DOC_END = `*/`;
const CSS_PROP_ANNOTATION = `@prop`;

async function parseCssImports(config, compilerCtx, buildCtx, srcFilePath, resolvedFilePath, styleText, styleDocs) {
    const isCssEntry = resolvedFilePath.toLowerCase().endsWith('.css');
    return cssImports(config, compilerCtx, buildCtx, isCssEntry, srcFilePath, resolvedFilePath, styleText, [], styleDocs);
}
async function cssImports(config, compilerCtx, buildCtx, isCssEntry, srcFilePath, resolvedFilePath, styleText, noLoop, styleDocs) {
    if (noLoop.includes(resolvedFilePath)) {
        return styleText;
    }
    noLoop.push(resolvedFilePath);
    if (styleDocs != null) {
        parseStyleDocs(styleDocs, styleText);
    }
    const cssImports = getCssImports$1(config, buildCtx, resolvedFilePath, styleText);
    if (cssImports.length === 0) {
        return styleText;
    }
    await Promise.all(cssImports.map(async (cssImportData) => {
        await concatCssImport(config, compilerCtx, buildCtx, isCssEntry, srcFilePath, cssImportData, noLoop, styleDocs);
    }));
    return replaceImportDeclarations(styleText, cssImports, isCssEntry);
}
async function concatCssImport(config, compilerCtx, buildCtx, isCssEntry, srcFilePath, cssImportData, noLoop, styleDocs) {
    cssImportData.styleText = await loadStyleText(compilerCtx, cssImportData);
    if (typeof cssImportData.styleText === 'string') {
        cssImportData.styleText = await cssImports(config, compilerCtx, buildCtx, isCssEntry, cssImportData.filePath, cssImportData.filePath, cssImportData.styleText, noLoop, styleDocs);
    }
    else {
        const err = buildError(buildCtx.diagnostics);
        err.messageText = `Unable to read css import: ${cssImportData.srcImport}`;
        err.absFilePath = srcFilePath;
    }
}
async function loadStyleText(compilerCtx, cssImportData) {
    let styleText = null;
    try {
        styleText = await compilerCtx.fs.readFile(cssImportData.filePath);
    }
    catch (e) {
        if (cssImportData.altFilePath) {
            try {
                styleText = await compilerCtx.fs.readFile(cssImportData.filePath);
            }
            catch (e) { }
        }
    }
    return styleText;
}
function getCssImports$1(config, buildCtx, filePath, styleText) {
    const imports = [];
    if (!styleText.includes('@import')) {
        // no @import at all, so don't bother
        return imports;
    }
    styleText = stripComments$1(styleText);
    const dir = config.sys.path.dirname(filePath);
    const importeeExt = filePath.split('.').pop().toLowerCase();
    let r;
    while (r = IMPORT_RE.exec(styleText)) {
        const cssImportData = {
            srcImport: r[0],
            url: r[4].replace(/[\"\'\)]/g, '')
        };
        if (!isLocalCssImport$1(cssImportData.srcImport)) {
            // do nothing for @import url(http://external.css)
            config.logger.debug(`did not resolve external css @import: ${cssImportData.srcImport}`);
            continue;
        }
        if (isCssNodeModule$1(cssImportData.url)) {
            // node resolve this path cuz it starts with ~
            resolveCssNodeModule(config, buildCtx.diagnostics, filePath, cssImportData);
        }
        else if (config.sys.path.isAbsolute(cssImportData.url)) {
            // absolute path already
            cssImportData.filePath = normalizePath(cssImportData.url);
        }
        else {
            // relative path
            cssImportData.filePath = normalizePath(config.sys.path.join(dir, cssImportData.url));
        }
        if (importeeExt !== 'css' && !cssImportData.filePath.toLowerCase().endsWith('.css')) {
            cssImportData.filePath += `.${importeeExt}`;
            if (importeeExt === 'scss') {
                const fileName = '_' + config.sys.path.basename(cssImportData.filePath);
                const dirPath = config.sys.path.dirname(cssImportData.filePath);
                cssImportData.altFilePath = config.sys.path.join(dirPath, fileName);
            }
        }
        if (typeof cssImportData.filePath === 'string') {
            imports.push(cssImportData);
        }
    }
    return imports;
}
const IMPORT_RE = /(@import)\s+(url\()?\s?(.*?)\s?\)?([^;]*);?/gi;
function isCssNodeModule$1(url) {
    return url.startsWith('~');
}
function resolveCssNodeModule(config, diagnostics, filePath, cssImportData) {
    try {
        const dir = config.sys.path.dirname(filePath);
        const moduleId = getModuleId(cssImportData.url);
        cssImportData.filePath = config.sys.resolveModule(dir, moduleId, { manuallyResolve: true });
        cssImportData.filePath = config.sys.path.dirname(cssImportData.filePath);
        cssImportData.filePath += normalizePath(cssImportData.url.substring(moduleId.length + 1));
        cssImportData.updatedImport = `@import "${cssImportData.filePath}";`;
    }
    catch (e) {
        const d = buildError(diagnostics);
        d.messageText = `Unable to resolve node module for CSS @import: ${cssImportData.url}`;
        d.absFilePath = filePath;
    }
}
function isLocalCssImport$1(srcImport) {
    srcImport = srcImport.toLowerCase();
    if (srcImport.includes('url(')) {
        srcImport = srcImport.replace(/\"/g, '');
        srcImport = srcImport.replace(/\'/g, '');
        srcImport = srcImport.replace(/\s/g, '');
        if (srcImport.includes('url(http') || srcImport.includes('url(//')) {
            return false;
        }
    }
    return true;
}
function getModuleId(orgImport) {
    if (orgImport.startsWith('~')) {
        orgImport = orgImport.substring(1);
    }
    const splt = orgImport.split('/');
    if (orgImport.startsWith('@')) {
        if (splt.length > 1) {
            return splt.slice(0, 2).join('/');
        }
    }
    return splt[0];
}
function replaceImportDeclarations(styleText, cssImports, isCssEntry) {
    cssImports.forEach(cssImportData => {
        if (isCssEntry) {
            if (typeof cssImportData.styleText === 'string') {
                styleText = styleText.replace(cssImportData.srcImport, cssImportData.styleText);
            }
        }
        else if (typeof cssImportData.updatedImport === 'string') {
            styleText = styleText.replace(cssImportData.srcImport, cssImportData.updatedImport);
        }
    });
    return styleText;
}

async function runPluginResolveId(pluginCtx, importee) {
    for (const plugin of pluginCtx.config.plugins) {
        if (typeof plugin.resolveId === 'function') {
            try {
                const results = plugin.resolveId(importee, null, pluginCtx);
                if (results != null) {
                    if (typeof results.then === 'function') {
                        const promiseResults = await results;
                        if (promiseResults != null) {
                            return promiseResults;
                        }
                    }
                    else if (typeof results === 'string') {
                        return results;
                    }
                }
            }
            catch (e) {
                catchError(pluginCtx.diagnostics, e);
            }
        }
    }
    // default resolvedId
    return importee;
}
async function runPluginLoad(pluginCtx, id) {
    for (const plugin of pluginCtx.config.plugins) {
        if (typeof plugin.load === 'function') {
            try {
                const results = plugin.load(id, pluginCtx);
                if (results != null) {
                    if (typeof results.then === 'function') {
                        const promiseResults = await results;
                        if (promiseResults != null) {
                            return promiseResults;
                        }
                    }
                    else if (typeof results === 'string') {
                        return results;
                    }
                }
            }
            catch (e) {
                catchError(pluginCtx.diagnostics, e);
            }
        }
    }
    // default load()
    return pluginCtx.fs.readFile(id);
}
async function runPluginTransforms(config, compilerCtx, buildCtx, id, cmp) {
    const pluginCtx = {
        config: config,
        sys: config.sys,
        fs: compilerCtx.fs,
        cache: compilerCtx.cache,
        diagnostics: []
    };
    const resolvedId = await runPluginResolveId(pluginCtx, id);
    const sourceText = await runPluginLoad(pluginCtx, resolvedId);
    const transformResults = {
        code: sourceText,
        id: id
    };
    const isRawCssFile = transformResults.id.toLowerCase().endsWith('.css');
    const shouldParseCssDocs = (cmp != null && config.outputTargets.some(isOutputTargetDocs));
    if (isRawCssFile) {
        // concat all css @imports into one file
        // when the entry file is a .css file (not .scss)
        // do this BEFORE transformations on css files
        if (shouldParseCssDocs && cmp != null) {
            cmp.styleDocs = cmp.styleDocs || [];
            transformResults.code = await parseCssImports(config, compilerCtx, buildCtx, id, id, transformResults.code, cmp.styleDocs);
        }
        else {
            transformResults.code = await parseCssImports(config, compilerCtx, buildCtx, id, id, transformResults.code);
        }
    }
    for (const plugin of pluginCtx.config.plugins) {
        if (typeof plugin.transform === 'function') {
            try {
                let pluginTransformResults;
                const results = plugin.transform(transformResults.code, transformResults.id, pluginCtx);
                if (results != null) {
                    if (typeof results.then === 'function') {
                        pluginTransformResults = await results;
                    }
                    else {
                        pluginTransformResults = results;
                    }
                    if (pluginTransformResults != null) {
                        if (typeof pluginTransformResults === 'string') {
                            transformResults.code = pluginTransformResults;
                        }
                        else {
                            if (typeof pluginTransformResults.code === 'string') {
                                transformResults.code = pluginTransformResults.code;
                            }
                            if (typeof pluginTransformResults.id === 'string') {
                                transformResults.id = pluginTransformResults.id;
                            }
                        }
                    }
                }
            }
            catch (e) {
                catchError(buildCtx.diagnostics, e);
            }
        }
    }
    buildCtx.diagnostics.push(...pluginCtx.diagnostics);
    if (!isRawCssFile) {
        // sass precompiler just ran and converted @import "my.css" into @import url("my.css")
        // because of the ".css" extension. Sass did NOT concat the ".css" files into the output
        // but only updated it to use url() instead. Let's go ahead and concat the url() css
        // files into one file like we did for raw .css files.
        // do this AFTER transformations on non-css files
        if (shouldParseCssDocs && cmp != null) {
            cmp.styleDocs = cmp.styleDocs || [];
            transformResults.code = await parseCssImports(config, compilerCtx, buildCtx, id, transformResults.id, transformResults.code, cmp.styleDocs);
        }
        else {
            transformResults.code = await parseCssImports(config, compilerCtx, buildCtx, id, transformResults.id, transformResults.code);
        }
    }
    return transformResults;
}
const runPluginTransformsEsmImports = async (config, compilerCtx, buildCtx, sourceText, id) => {
    const pluginCtx = {
        config: config,
        sys: config.sys,
        fs: compilerCtx.fs,
        cache: compilerCtx.cache,
        diagnostics: []
    };
    const transformResults = {
        code: sourceText,
        id: id
    };
    for (const plugin of pluginCtx.config.plugins) {
        if (typeof plugin.transform === 'function') {
            try {
                let pluginTransformResults;
                const results = plugin.transform(transformResults.code, transformResults.id, pluginCtx);
                if (results != null) {
                    if (typeof results.then === 'function') {
                        pluginTransformResults = await results;
                    }
                    else {
                        pluginTransformResults = results;
                    }
                    if (pluginTransformResults != null) {
                        if (typeof pluginTransformResults === 'string') {
                            transformResults.code = pluginTransformResults;
                        }
                        else {
                            if (typeof pluginTransformResults.code === 'string') {
                                transformResults.code = pluginTransformResults.code;
                            }
                            if (typeof pluginTransformResults.id === 'string') {
                                transformResults.id = pluginTransformResults.id;
                            }
                        }
                    }
                }
            }
            catch (e) {
                catchError(buildCtx.diagnostics, e);
            }
        }
    }
    buildCtx.diagnostics.push(...pluginCtx.diagnostics);
    return transformResults;
};

const cssTransformer = (config, compilerCtx, buildCtx) => {
    const compiler = createCompiler();
    return {
        name: 'cssTransformer',
        resolveId(importee, importer) {
            const r = compiler.resolveId(importee, importer);
            if (r != null && r.type === 'css') {
                if (KNOWN_PREPROCESSOR_EXTS.has(r.importerExt) && r.importerExt !== r.resolvedFileExt) {
                    // basically for sass paths without an extension
                    r.resolvedFileExt = r.importerExt;
                    r.resolvedFileName += '.' + r.resolvedFileExt;
                    r.resolvedFilePath += '.' + r.resolvedFileExt;
                    r.resolvedId = `${r.resolvedFilePath}?${r.params}`;
                    compiler.setResolvedData(r.resolvedId, r);
                }
                return r.resolvedId;
            }
            return null;
        },
        async transform(code, id) {
            const r = compiler.getResolvedData(id);
            if (r != null) {
                const pluginTransforms = await runPluginTransformsEsmImports(config, compilerCtx, buildCtx, code, id);
                const results = await compiler.transform(pluginTransforms.code, id);
                if (results != null) {
                    buildCtx.diagnostics.push(...results.diagnostics);
                    return results;
                }
            }
            return null;
        }
    };
};
const KNOWN_PREPROCESSOR_EXTS = new Set(['sass', 'scss', 'styl', 'less', 'pcss']);

function hasGlobalScriptPaths(config, compilerCtx) {
    if (typeof config.globalScript === 'string') {
        const mod = compilerCtx.moduleMap.get(config.globalScript);
        if (mod != null && mod.jsFilePath) {
            return true;
        }
    }
    return compilerCtx.collections.some(collection => {
        return (collection.global != null && typeof collection.global.jsFilePath === 'string');
    });
}
function globalScriptsPlugin(config, compilerCtx) {
    const globalPaths = [];
    if (typeof config.globalScript === 'string') {
        const mod = compilerCtx.moduleMap.get(config.globalScript);
        if (mod != null && mod.jsFilePath) {
            globalPaths.push(normalizePath(mod.jsFilePath));
        }
    }
    compilerCtx.collections.forEach(collection => {
        if (collection.global != null && typeof collection.global.jsFilePath === 'string') {
            globalPaths.push(normalizePath(collection.global.jsFilePath));
        }
    });
    return {
        name: 'globalScriptsPlugin',
        resolveId(id) {
            if (id === GLOBAL_ID) {
                return {
                    id,
                };
            }
            return null;
        },
        load(id) {
            if (id === GLOBAL_ID) {
                const imports = globalPaths
                    .map((path, i) => `import global${i} from '${path}';`);
                return [
                    ...imports,
                    `const globals = () => {`,
                    ...globalPaths.map((_, i) => `  global${i}();`),
                    `};`,
                    `export default globals;`
                ].join('\n');
            }
            return null;
        },
        transform(code, id) {
            id = normalizePath(id);
            if (globalPaths.includes(id)) {
                const program = this.parse(code, {});
                const needsDefault = !program.body.some(s => s.type === 'ExportDefaultDeclaration');
                const defaultExport = needsDefault
                    ? '\nexport const globalFn = () => {};\nexport default globalFn;'
                    : '';
                return INJECT_CONTEXT + code + defaultExport;
            }
            return null;
        }
    };
}
const INJECT_CONTEXT = `import { Context } from '@stencil/core';\n`;
const GLOBAL_ID = '@stencil/core/global-scripts';

function loaderPlugin(entries) {
    return {
        name: 'stencilLoaderPlugin',
        resolveId(id) {
            if (id in entries) {
                return {
                    id,
                };
            }
            return null;
        },
        load(id) {
            if (id in entries) {
                return entries[id];
            }
            return null;
        }
    };
}

const mimeTypes = {
    '.svg': 'image/svg+xml',
};
function imagePlugin(config, buildCtx) {
    return {
        name: 'image',
        async load(id) {
            if (/\0/.test(id)) {
                return null;
            }
            id = normalizePath(id);
            const mime = mimeTypes[config.sys.path.extname(id)];
            if (!mime) {
                return null;
            }
            try {
                const data = await config.sys.fs.readFile(id, 'base64');
                if (config.devMode && data.length > MAX_IMAGE_SIZE) {
                    const warn = buildWarn(buildCtx.diagnostics);
                    warn.messageText = 'Importing big images will bloat your bundle, please use assets instead.';
                    warn.absFilePath = id;
                }
                return `const img = 'data:${mime};base64,${data}'; export default img;`;
            }
            catch (e) { }
            return null;
        }
    };
}
const MAX_IMAGE_SIZE = 4 * 1024; // 4KiB

function inMemoryFsRead(config, compilerCtx) {
    const path = config.sys.path;
    const compilerOptions = compilerCtx.compilerOptions;
    return {
        name: 'inMemoryFsRead',
        async resolveId(importee, importer) {
            if (typeof importee !== 'string' || /\0/.test(importee)) {
                // ignore IDs with null character, these belong to other plugins
                return null;
            }
            // resolve path that matches a path alias from the compiler options
            if (compilerOptions.paths && hasMatchingPathAlias(importee, compilerOptions)) {
                return resolveWithPathAlias(importee, importer, compilerCtx, path);
            }
            // skip non-paths
            if (importee[0] !== '.' && importee[0] !== '/' && importee[1] !== ':') {
                return null;
            }
            // resolve absolute path
            if (!path.isAbsolute(importee)) {
                importee = path.resolve(importer ? path.dirname(importer) : path.resolve(), importee);
            }
            importee = normalizePath(importee);
            // 1. load(importee)
            let accessData = await compilerCtx.fs.accessData(importee);
            if (accessData.exists && accessData.isFile) {
                // exact importee file path exists
                return importee;
            }
            // 2. load(importee.js)
            const jsFilePath = importee + '.js';
            accessData = await compilerCtx.fs.accessData(jsFilePath);
            if (accessData.exists) {
                return jsFilePath;
            }
            // 3. load(importee.mjs)
            const mjsFilePath = importee + '.mjs';
            accessData = await compilerCtx.fs.accessData(mjsFilePath);
            if (accessData.exists) {
                return mjsFilePath;
            }
            // 4. load(importee/index.js)
            const indexJsFilePath = path.join(importee, 'index.js');
            accessData = await compilerCtx.fs.accessData(indexJsFilePath);
            if (accessData.exists) {
                return indexJsFilePath;
            }
            // 5. load(importee/index.mjs)
            const indexMjsFilePath = path.join(importee, 'index.mjs');
            accessData = await compilerCtx.fs.accessData(indexMjsFilePath);
            if (accessData.exists) {
                return indexMjsFilePath;
            }
            return null;
        },
        async load(sourcePath) {
            if (/\.tsx?$/i.test(sourcePath)) {
                this.warn({
                    message: `An import was resolved to a Typescript file (${sourcePath}) but Rollup treated it as Javascript. You should instead resolve to the absolute path of its transpiled Javascript equivalent (${path.resolve(sourcePath.replace(/\.tsx?/i, '.js'))}).`,
                });
            }
            sourcePath = sourcePath.split('?')[0];
            return compilerCtx.fs.readFile(sourcePath);
        }
    };
}
/**
 * Check whether an importee has a matching path alias.
 */
const hasMatchingPathAlias = (importee, compilerOptions) => Object.keys(compilerOptions.paths).some(path => new RegExp(path.replace('*', '\\w*')).test(importee));
/**
 * Resolve an import using the path aliases of the compiler options.
 *
 * @returns the `.js` file corresponding to the resolved `.ts` file, or `null`
 * if the import can't be resolved
 */
const resolveWithPathAlias = async (importee, importer, compilerCtx, path) => {
    const { resolvedModule } = ts$1.nodeModuleNameResolver(importee, importer, compilerCtx.compilerOptions, {
        readFile: compilerCtx.fs.readFileSync,
        fileExists: fileName => compilerCtx.fs.statSync(fileName).isFile,
    });
    if (!resolvedModule) {
        return null;
    }
    const { resolvedFileName } = resolvedModule; // this is the .ts(x) path
    if (!resolvedFileName || resolvedFileName.endsWith('.d.ts')) {
        return null;
    }
    // check whether the .js counterpart exists
    const jsFilePath = path.resolve(resolvedFileName.replace(/\.tsx?$/i, '.js'));
    const { exists } = await compilerCtx.fs.accessData(jsFilePath);
    return exists ? jsFilePath : null;
};

function pluginHelper(config, builtCtx) {
    return {
        name: 'pluginHelper',
        resolveId(importee, importer) {
            if (/\0/.test(importee)) {
                // ignore IDs with null character, these belong to other plugins
                return null;
            }
            if (importee.endsWith('/')) {
                importee = importee.slice(0, -1);
            }
            if (builtIns.has(importee)) {
                let fromMsg = '';
                if (importer) {
                    fromMsg = ` from ${config.sys.path.relative(config.rootDir, importer)}`;
                }
                const diagnostic = buildError(builtCtx.diagnostics);
                diagnostic.header = `Node Polyfills Required`;
                diagnostic.messageText = `For the import "${importee}" to be bundled${fromMsg}, ensure the "rollup-plugin-node-polyfills" plugin is installed and added to the stencil config plugins. Please see the bundling docs for more information.
        Further information: https://stenciljs.com/docs/module-bundling`;
            }
            return null;
        }
    };
}
const builtIns = new Set([
    'child_process',
    'cluster',
    'dgram',
    'dns',
    'module',
    'net',
    'readline',
    'repl',
    'tls',
    'assert',
    'console',
    'constants',
    'domain',
    'events',
    'path',
    'punycode',
    'querystring',
    '_stream_duplex',
    '_stream_passthrough',
    '_stream_readable',
    '_stream_writable',
    '_stream_transform',
    'string_decoder',
    'sys',
    'tty',
    'crypto',
    'fs',
    'Buffer',
    'buffer',
    'global',
    'http',
    'https',
    'os',
    'process',
    'stream',
    'timers',
    'url',
    'util',
    'vm',
    'zlib'
]);

function stencilBuildConditionalsPlugin(build, namespace) {
    const buildData = `
export const BUILD = ${JSON.stringify(build)};
export const NAMESPACE = '${namespace}';
`;
    return {
        resolveId(id) {
            if (id === '@stencil/core/build-conditionals') {
                return {
                    id,
                };
            }
            return null;
        },
        load(id) {
            if (id === '@stencil/core/build-conditionals') {
                return buildData;
            }
            return null;
        }
    };
}

function stencilClientPlugin(config) {
    return {
        name: 'stencilClientEntryPointPlugin',
        resolveId(id) {
            if (id === '@stencil/core/platform') {
                return {
                    id: config.sys.path.join(config.sys.compiler.distDir, 'client', 'index.mjs'),
                };
            }
            return null;
        },
        resolveImportMeta(prop, { format }) {
            if (prop === 'url' && format === 'es') {
                return '""';
            }
            return null;
        }
    };
}

function stencilExternalRuntimePlugin(externalRuntime) {
    return {
        name: 'stencilExternalRuntimePlugin',
        resolveId(id) {
            if (externalRuntime !== undefined && id === '@stencil/core') {
                return { id: externalRuntime, external: true, moduleSideEffects: false };
            }
            return null;
        }
    };
}

const bundleApp = async (config, compilerCtx, buildCtx, build, bundleAppOptions) => {
    const external = bundleAppOptions.skipDeps
        ? getDependencies(buildCtx)
        : [];
    try {
        const treeshake = !config.devMode && config.rollupConfig.inputOptions.treeshake !== false
            ? {
                unknownGlobalSideEffects: false,
                propertyReadSideEffects: false,
                tryCatchDeoptimization: false,
            }
            : false;
        const rollupOptions = Object.assign(Object.assign({}, config.rollupConfig.inputOptions), { input: bundleAppOptions.inputs, plugins: [
                stencilExternalRuntimePlugin(bundleAppOptions.externalRuntime),
                loaderPlugin(Object.assign({ '@stencil/core': DEFAULT_CORE, '@core-entrypoint': DEFAULT_ENTRY }, bundleAppOptions.loader)),
                stencilClientPlugin(config),
                stencilBuildConditionalsPlugin(build, config.fsNamespace),
                globalScriptsPlugin(config, compilerCtx),
                componentEntryPlugin(config, compilerCtx, buildCtx, build, buildCtx.entryModules),
                config.sys.rollup.plugins.commonjs(Object.assign({ include: /node_modules/, sourceMap: false }, config.commonjs)),
                ...config.rollupPlugins,
                pluginHelper(config, buildCtx),
                config.sys.rollup.plugins.nodeResolve(Object.assign({ mainFields: ['collection:main', 'jsnext:main', 'es2017', 'es2015', 'module', 'main'], browser: true }, config.nodeResolve)),
                config.sys.rollup.plugins.json(),
                imagePlugin(config, buildCtx),
                cssTransformer(config, compilerCtx, buildCtx),
                inMemoryFsRead(config, compilerCtx),
                config.sys.rollup.plugins.replace({
                    'process.env.NODE_ENV': config.devMode ? '"development"' : '"production"'
                }),
            ], treeshake, cache: bundleAppOptions.cache, onwarn: createOnWarnFn(buildCtx.diagnostics), external });
        const rollupBuild = await config.sys.rollup.rollup(rollupOptions);
        return rollupBuild;
    }
    catch (e) {
        if (!buildCtx.hasError) {
            loadRollupDiagnostics(compilerCtx, buildCtx, e);
        }
    }
    return undefined;
};
const generateRollupOutput = async (build, options, config, entryModules) => {
    if (build == null) {
        return null;
    }
    const { output } = await build.generate(options);
    return output
        .filter(chunk => !('isAsset' in chunk))
        .map((chunk) => {
        const isCore = Object.keys(chunk.modules).includes('@stencil/core');
        return {
            fileName: chunk.fileName,
            code: chunk.code,
            moduleFormat: options.format,
            entryKey: chunk.name,
            imports: chunk.imports,
            isEntry: !!chunk.isEntry,
            isComponent: !!chunk.isEntry && entryModules.some(m => m.entryKey === chunk.name),
            isBrowserLoader: chunk.isEntry && chunk.name === config.fsNamespace,
            isIndex: chunk.isEntry && chunk.name === 'index',
            isCore,
        };
    });
};
const DEFAULT_CORE = `
export * from '@stencil/core/platform';
import globals from '@stencil/core/global-scripts';
export { globals };
`;
const DEFAULT_ENTRY = `
export * from '@stencil/core';
`;

function getBuildFeatures(cmps) {
    const slot = cmps.some(c => c.htmlTagNames.includes('slot'));
    const f = {
        allRenderFn: cmps.every(c => c.hasRenderFn),
        cmpDidLoad: cmps.some(c => c.hasComponentDidLoadFn),
        cmpShouldUpdate: cmps.some(c => c.hasComponentShouldUpdateFn),
        cmpDidUnload: cmps.some(c => c.hasComponentDidUnloadFn),
        cmpDidUpdate: cmps.some(c => c.hasComponentDidUpdateFn),
        cmpDidRender: cmps.some(c => c.hasComponentDidRenderFn),
        cmpWillLoad: cmps.some(c => c.hasComponentWillLoadFn),
        cmpWillUpdate: cmps.some(c => c.hasComponentWillUpdateFn),
        cmpWillRender: cmps.some(c => c.hasComponentWillRenderFn),
        connectedCallback: cmps.some(c => c.hasConnectedCallbackFn),
        disconnectedCallback: cmps.some(c => c.hasDisconnectedCallbackFn),
        element: cmps.some(c => c.hasElement),
        event: cmps.some(c => c.hasEvent),
        hasRenderFn: cmps.some(c => c.hasRenderFn),
        lifecycle: cmps.some(c => c.hasLifecycle),
        asyncLoading: false,
        hostListener: cmps.some(c => c.hasListener),
        hostListenerTargetWindow: cmps.some(c => c.hasListenerTargetWindow),
        hostListenerTargetDocument: cmps.some(c => c.hasListenerTargetDocument),
        hostListenerTargetBody: cmps.some(c => c.hasListenerTargetBody),
        hostListenerTargetParent: cmps.some(c => c.hasListenerTargetParent),
        hostListenerTarget: cmps.some(c => c.hasListenerTarget),
        member: cmps.some(c => c.hasMember),
        method: cmps.some(c => c.hasMethod),
        mode: cmps.some(c => c.hasMode),
        noVdomRender: cmps.every(c => !c.hasVdomRender),
        observeAttribute: cmps.some(c => c.hasAttribute),
        prop: cmps.some(c => c.hasProp),
        propBoolean: cmps.some(c => c.hasPropBoolean),
        propNumber: cmps.some(c => c.hasPropNumber),
        propString: cmps.some(c => c.hasPropString),
        propMutable: cmps.some(c => c.hasPropMutable),
        reflect: cmps.some(c => c.hasReflect),
        scoped: cmps.some(c => c.encapsulation === 'scoped'),
        shadowDom: cmps.some(c => c.encapsulation === 'shadow'),
        slot,
        slotRelocation: slot,
        state: cmps.some(c => c.hasState),
        style: cmps.some(c => c.hasStyle),
        svg: cmps.some(c => c.htmlTagNames.includes('svg')),
        updatable: cmps.some(c => c.isUpdateable),
        vdomAttribute: cmps.some(c => c.hasVdomAttribute),
        vdomXlink: cmps.some(c => c.hasVdomXlink),
        vdomClass: cmps.some(c => c.hasVdomClass),
        vdomFunctional: cmps.some(c => c.hasVdomFunctional),
        vdomKey: cmps.some(c => c.hasVdomKey),
        vdomListener: cmps.some(c => c.hasVdomListener),
        vdomRef: cmps.some(c => c.hasVdomRef),
        vdomRender: cmps.some(c => c.hasVdomRender),
        vdomStyle: cmps.some(c => c.hasVdomStyle),
        vdomText: cmps.some(c => c.hasVdomText),
        watchCallback: cmps.some(c => c.hasWatchCallback),
        taskQueue: true,
    };
    f.asyncLoading = f.cmpWillUpdate || f.cmpWillLoad || f.cmpWillRender;
    return f;
}
function updateComponentBuildConditionals(moduleMap, cmps) {
    cmps.forEach(cmp => {
        const importedModules = getModuleImports(moduleMap, cmp.sourceFilePath, []);
        importedModules.forEach(importedModule => {
            // if the component already has a boolean true value it'll keep it
            // otherwise we get the boolean value from the imported module
            cmp.hasVdomAttribute = cmp.hasVdomAttribute || importedModule.hasVdomAttribute;
            cmp.hasVdomXlink = cmp.hasVdomXlink || importedModule.hasVdomXlink;
            cmp.hasVdomClass = cmp.hasVdomClass || importedModule.hasVdomClass;
            cmp.hasVdomFunctional = cmp.hasVdomFunctional || importedModule.hasVdomFunctional;
            cmp.hasVdomKey = cmp.hasVdomKey || importedModule.hasVdomKey;
            cmp.hasVdomListener = cmp.hasVdomListener || importedModule.hasVdomListener;
            cmp.hasVdomRef = cmp.hasVdomRef || importedModule.hasVdomRef;
            cmp.hasVdomRender = cmp.hasVdomRender || importedModule.hasVdomRender;
            cmp.hasVdomStyle = cmp.hasVdomStyle || importedModule.hasVdomStyle;
            cmp.hasVdomText = cmp.hasVdomText || importedModule.hasVdomText;
            cmp.htmlAttrNames.push(...importedModule.htmlAttrNames);
            cmp.htmlTagNames.push(...importedModule.htmlTagNames);
            cmp.potentialCmpRefs.push(...importedModule.potentialCmpRefs);
        });
    });
}
function getModuleImports(moduleMap, filePath, importedModules) {
    let moduleFile = moduleMap.get(filePath);
    if (moduleFile == null) {
        moduleFile = moduleMap.get(filePath + '.tsx');
        if (moduleFile == null) {
            moduleFile = moduleMap.get(filePath + '.ts');
            if (moduleFile == null) {
                moduleFile = moduleMap.get(filePath + '.js');
            }
        }
    }
    if (moduleFile != null && !importedModules.some(m => m.sourceFilePath === moduleFile.sourceFilePath)) {
        importedModules.push(moduleFile);
        moduleFile.localImports.forEach(localImport => {
            getModuleImports(moduleMap, localImport, importedModules);
        });
    }
    return importedModules;
}
function updateBuildConditionals(config, b) {
    b.isDebug = (config.logLevel === 'debug');
    b.isDev = !!config.devMode;
    b.devTools = b.isDev;
    b.lifecycleDOMEvents = !!(b.isDebug || config._isTesting || config._lifecycleDOMEvents);
    b.profile = !!(config.profile);
    b.hotModuleReplacement = !!(config.devMode && config.devServer && config.devServer.reloadStrategy === 'hmr' && !config._isTesting);
    b.updatable = (b.updatable || b.hydrateClientSide || b.hotModuleReplacement);
    b.member = (b.member || b.updatable || b.mode || b.lifecycle);
    b.constructableCSS = !b.hotModuleReplacement || !!config._isTesting;
    b.asyncLoading = !!(b.asyncLoading || b.lazyLoad || b.taskQueue || b.initializeNextTick);
    b.cssAnnotations = true;
}

async function writeLazyModule(config, compilerCtx, destinations, entryModule, shouldHash, code, modeName, sufix) {
    code = replaceStylePlaceholders(entryModule.cmps, modeName, code);
    const bundleId = await getBundleId(config, entryModule.entryKey, shouldHash, code, modeName, sufix);
    const fileName = `${bundleId}.entry.js`;
    await Promise.all(destinations.map(dst => compilerCtx.fs.writeFile(config.sys.path.join(dst, fileName), code)));
    return {
        bundleId,
        fileName,
        code,
        modeName,
    };
}
async function getBundleId(config, entryKey, shouldHash, code, modeName, sufix) {
    if (shouldHash) {
        const hash = await config.sys.generateContentHash(code, config.hashedFileNameLength);
        return `p-${hash}${sufix}`;
    }
    const components = entryKey.split('.');
    let bundleId = components[0];
    if (components.length > 2) {
        bundleId = `${bundleId}_${components.length - 1}`;
    }
    if (modeName !== DEFAULT_STYLE_MODE) {
        bundleId += '-' + modeName;
    }
    return bundleId + sufix;
}

async function transpileToEs5Main(config, compilerCtx, input, inlineHelpers = true) {
    if (config.sys.transpileToEs5 == null) {
        return null;
    }
    const cacheKey = await compilerCtx.cache.createKey('transpileToEs5', COMPILER_BUILD.transpiler, input);
    const cachedContent = await compilerCtx.cache.get(cacheKey);
    if (cachedContent != null) {
        const results = {
            code: cachedContent,
            diagnostics: [],
            build: {},
            map: null,
            sourceFilePath: null,
            moduleFile: null
        };
        return results;
    }
    const results = await config.sys.transpileToEs5(config.cwd, input, inlineHelpers);
    if (results.diagnostics.length === 0) {
        await compilerCtx.cache.put(cacheKey, results.code);
    }
    return results;
}

async function generateLazyModules(config, compilerCtx, buildCtx, destinations, rollupResults, sourceTarget, isBrowserBuild, sufix) {
    if (destinations.length === 0) {
        return [];
    }
    const shouldMinify = config.minifyJs && isBrowserBuild;
    const entryComponentsResults = rollupResults.filter(rollupResult => rollupResult.isComponent);
    const chunkResults = rollupResults.filter(rollupResult => !rollupResult.isComponent && !rollupResult.isEntry);
    const [bundleModules] = await Promise.all([
        Promise.all(entryComponentsResults.map(rollupResult => {
            return generateLazyEntryModule(config, compilerCtx, buildCtx, rollupResult, destinations, sourceTarget, shouldMinify, isBrowserBuild, sufix);
        })),
        Promise.all(chunkResults.map(rollupResult => {
            return writeLazyChunk(config, compilerCtx, buildCtx, rollupResult, destinations, sourceTarget, shouldMinify, isBrowserBuild);
        }))
    ]);
    const lazyRuntimeData = formatLazyBundlesRuntimeMeta(bundleModules);
    config.logger.debug(`Upfront metadata is ${lazyRuntimeData.length} bytes`);
    const entryResults = rollupResults.filter(rollupResult => !rollupResult.isComponent && rollupResult.isEntry);
    await Promise.all(entryResults.map(rollupResult => {
        return writeLazyEntry(config, compilerCtx, buildCtx, rollupResult, destinations, lazyRuntimeData, sourceTarget, shouldMinify, isBrowserBuild);
    }));
    return bundleModules;
}
async function generateLazyEntryModule(config, compilerCtx, buildCtx, rollupResult, destinations, sourceTarget, shouldMinify, isBrowserBuild, sufix) {
    const entryModule = buildCtx.entryModules.find(entryModule => entryModule.entryKey === rollupResult.entryKey);
    const code = await convertChunk(config, compilerCtx, buildCtx, sourceTarget, shouldMinify, false, isBrowserBuild, rollupResult.code);
    const shouldHash = config.hashFileNames && isBrowserBuild;
    const outputs = await Promise.all(entryModule.modeNames.map(modeName => writeLazyModule(config, compilerCtx, destinations, entryModule, shouldHash, code, modeName, sufix)));
    return {
        rollupResult,
        entryKey: rollupResult.entryKey,
        modeNames: entryModule.modeNames.slice(),
        cmps: entryModule.cmps,
        outputs: sortBy(outputs, o => o.modeName)
    };
}
async function writeLazyChunk(config, compilerCtx, buildCtx, rollupResult, destinations, sourceTarget, shouldMinify, isBrowserBuild) {
    const code = await convertChunk(config, compilerCtx, buildCtx, sourceTarget, shouldMinify, rollupResult.isCore, isBrowserBuild, rollupResult.code);
    await Promise.all(destinations.map(dst => {
        const filePath = config.sys.path.join(dst, rollupResult.fileName);
        return compilerCtx.fs.writeFile(filePath, code);
    }));
}
async function writeLazyEntry(config, compilerCtx, buildCtx, rollupResult, destinations, lazyRuntimeData, sourceTarget, shouldMinify, isBrowserBuild) {
    if (isBrowserBuild && ['loader'].includes(rollupResult.entryKey)) {
        return;
    }
    let code = rollupResult.code.replace(`[/*!__STENCIL_LAZY_DATA__*/]`, `${lazyRuntimeData}`);
    code = await convertChunk(config, compilerCtx, buildCtx, sourceTarget, shouldMinify, false, isBrowserBuild, code);
    await Promise.all(destinations.map(dst => {
        const filePath = config.sys.path.join(dst, rollupResult.fileName);
        return compilerCtx.fs.writeFile(filePath, code);
    }));
}
function formatLazyBundlesRuntimeMeta(bundleModules) {
    const sortedBundles = bundleModules.slice().sort(sortBundleModules);
    const lazyBundles = sortedBundles.map(formatLazyRuntimeBundle);
    return stringifyRuntimeData(lazyBundles);
}
function formatLazyRuntimeBundle(bundleModule) {
    let bundleId;
    if (bundleModule.outputs.length === 0) {
        throw new Error('bundleModule.output must be at least one');
    }
    if (bundleModule.outputs[0].modeName !== DEFAULT_STYLE_MODE) {
        // more than one mode, object of bundleIds with the mode as a key
        bundleId = {};
        bundleModule.outputs.forEach(output => {
            bundleId[output.modeName] = output.bundleId;
        });
    }
    else {
        // only one default mode, bundleId is a string
        bundleId = bundleModule.outputs[0].bundleId;
    }
    const bundleCmps = bundleModule.cmps.slice().sort(sortBundleComponents);
    return [
        bundleId,
        bundleCmps.map(cmp => formatComponentRuntimeMeta(cmp, true))
    ];
}
function sortBundleModules(a, b) {
    const aDependents = a.cmps.reduce((dependents, cmp) => {
        dependents.push(...cmp.dependents);
        return dependents;
    }, []);
    const bDependents = b.cmps.reduce((dependents, cmp) => {
        dependents.push(...cmp.dependents);
        return dependents;
    }, []);
    if (a.cmps.some(cmp => bDependents.includes(cmp.tagName)))
        return 1;
    if (b.cmps.some(cmp => aDependents.includes(cmp.tagName)))
        return -1;
    const aDependencies = a.cmps.reduce((dependencies, cmp) => {
        dependencies.push(...cmp.dependencies);
        return dependencies;
    }, []);
    const bDependencies = b.cmps.reduce((dependencies, cmp) => {
        dependencies.push(...cmp.dependencies);
        return dependencies;
    }, []);
    if (a.cmps.some(cmp => bDependencies.includes(cmp.tagName)))
        return -1;
    if (b.cmps.some(cmp => aDependencies.includes(cmp.tagName)))
        return 1;
    if (aDependents.length < bDependents.length)
        return -1;
    if (aDependents.length > bDependents.length)
        return 1;
    if (aDependencies.length > bDependencies.length)
        return -1;
    if (aDependencies.length < bDependencies.length)
        return 1;
    const aTags = a.cmps.map(cmp => cmp.tagName);
    const bTags = b.cmps.map(cmp => cmp.tagName);
    if (aTags.length > bTags.length)
        return -1;
    if (aTags.length < bTags.length)
        return 1;
    const aTagsStr = aTags.sort().join('.');
    const bTagsStr = bTags.sort().join('.');
    if (aTagsStr < bTagsStr)
        return -1;
    if (aTagsStr > bTagsStr)
        return 1;
    return 0;
}
function sortBundleComponents(a, b) {
    // <cmp-a>
    //   <cmp-b>
    //     <cmp-c></cmp-c>
    //   </cmp-b>
    // </cmp-a>
    // cmp-c is a dependency of cmp-a and cmp-b
    // cmp-c is a directDependency of cmp-b
    // cmp-a is a dependant of cmp-b and cmp-c
    // cmp-a is a directDependant of cmp-b
    if (a.directDependents.includes(b.tagName))
        return 1;
    if (b.directDependents.includes(a.tagName))
        return -1;
    if (a.directDependencies.includes(b.tagName))
        return 1;
    if (b.directDependencies.includes(a.tagName))
        return -1;
    if (a.dependents.includes(b.tagName))
        return 1;
    if (b.dependents.includes(a.tagName))
        return -1;
    if (a.dependencies.includes(b.tagName))
        return 1;
    if (b.dependencies.includes(a.tagName))
        return -1;
    if (a.dependents.length < b.dependents.length)
        return -1;
    if (a.dependents.length > b.dependents.length)
        return 1;
    if (a.dependencies.length > b.dependencies.length)
        return -1;
    if (a.dependencies.length < b.dependencies.length)
        return 1;
    if (a.tagName < b.tagName)
        return -1;
    if (a.tagName > b.tagName)
        return 1;
    return 0;
}
async function convertChunk(config, compilerCtx, buildCtx, sourceTarget, shouldMinify, isCore, isBrowserBuild, code) {
    if (sourceTarget === 'es5') {
        const inlineHelpers = isBrowserBuild || !hasDependency(buildCtx, 'tslib');
        const transpileResults = await transpileToEs5Main(config, compilerCtx, code, inlineHelpers);
        if (transpileResults != null) {
            buildCtx.diagnostics.push(...transpileResults.diagnostics);
            if (transpileResults.diagnostics.length === 0) {
                code = transpileResults.code;
            }
        }
    }
    if (shouldMinify) {
        const optimizeResults = await optimizeModule(config, compilerCtx, sourceTarget, isCore, code);
        buildCtx.diagnostics.push(...optimizeResults.diagnostics);
        if (optimizeResults.diagnostics.length === 0 && typeof optimizeResults.output === 'string') {
            code = optimizeResults.output;
        }
    }
    return code;
}

async function generateEsm(config, compilerCtx, buildCtx, rollupBuild, outputTargets) {
    const esmEs5Outputs = config.buildEs5 ? outputTargets.filter(o => !!o.esmEs5Dir && !o.isBrowserBuild) : [];
    const esmOutputs = outputTargets.filter(o => !!o.esmDir && !o.isBrowserBuild);
    if (esmOutputs.length + esmEs5Outputs.length > 0) {
        const esmOpts = {
            format: 'esm',
            entryFileNames: '[name].mjs',
            preferConst: true
        };
        const output = await generateRollupOutput(rollupBuild, esmOpts, config, buildCtx.entryModules);
        if (output != null) {
            const es2017destinations = esmOutputs.map(o => o.esmDir);
            await generateLazyModules(config, compilerCtx, buildCtx, es2017destinations, output, 'es2017', false, '');
            const es5destinations = esmEs5Outputs.map(o => o.esmEs5Dir);
            await generateLazyModules(config, compilerCtx, buildCtx, es5destinations, output, 'es5', false, '');
            await copyPolyfills(config, compilerCtx, esmOutputs);
            await generateShortcuts(config, compilerCtx, outputTargets, output);
        }
    }
}
async function copyPolyfills(config, compilerCtx, outputTargets) {
    const destinations = outputTargets.filter(o => o.polyfills).map(o => o.esmDir);
    if (destinations.length === 0) {
        return;
    }
    const src = config.sys.getClientPath('polyfills');
    const files = await compilerCtx.fs.readdir(src);
    await Promise.all(destinations.map(dest => {
        return Promise.all(files.map(f => {
            return compilerCtx.fs.copyFile(f.absPath, config.sys.path.join(dest, 'polyfills', f.relPath));
        }));
    }));
}
function generateShortcuts(config, compilerCtx, outputTargets, rollupResult) {
    const indexFilename = rollupResult.find(r => r.isIndex).fileName;
    return Promise.all(outputTargets.map(async (o) => {
        if (o.esmDir && o.esmIndexFile) {
            const entryPointPath = config.buildEs5 && o.esmEs5Dir
                ? config.sys.path.join(o.esmEs5Dir, indexFilename)
                : config.sys.path.join(o.esmDir, indexFilename);
            const relativePath = relativeImport(config, o.esmIndexFile, entryPointPath);
            const shortcutContent = `export * from '${relativePath}';`;
            await compilerCtx.fs.writeFile(o.esmIndexFile, shortcutContent);
        }
    }));
}

async function generateEsmBrowser(config, compilerCtx, buildCtx, rollupBuild, outputTargets) {
    const esmOutputs = outputTargets.filter(o => !!o.esmDir && !!o.isBrowserBuild);
    if (esmOutputs.length) {
        const esmOpts = {
            format: 'esm',
            entryFileNames: '[name].esm.js',
            chunkFileNames: config.hashFileNames ? 'p-[hash].js' : '[name]-[hash].js',
            preferConst: true,
            // This is needed until Firefox 67, which ships native dynamic imports
            dynamicImportFunction: getDynamicImportFunction(config.fsNamespace)
        };
        const output = await generateRollupOutput(rollupBuild, esmOpts, config, buildCtx.entryModules);
        if (output != null) {
            const es2017destinations = esmOutputs.map(o => o.esmDir);
            const componentBundle = await generateLazyModules(config, compilerCtx, buildCtx, es2017destinations, output, 'es2017', true, '');
            return componentBundle;
        }
    }
    return undefined;
}

async function getClientPolyfill(config, polyfillFile) {
    const staticName = config.sys.path.join('polyfills', polyfillFile);
    return config.sys.getClientCoreFile({ staticName: staticName });
}
async function getAppBrowserCorePolyfills(config) {
    // read all the polyfill content, in this particular order
    const results = await Promise.all(INLINE_POLYFILLS
        .map(polyfillFile => getClientPolyfill(config, polyfillFile)));
    // concat the polyfills
    return results.join('\n').trim();
}
// order of the polyfills matters!! test test test
// actual source of the polyfills are found in /src/client/polyfills/
const INLINE_POLYFILLS = [
    'promise.js',
    'core-js.js',
    'dom.js',
    'es5-html-element.js',
    'system.js',
    'css-shim.js'
];

async function generateSystem(config, compilerCtx, buildCtx, rollupBuild, outputTargets) {
    const systemOutputs = outputTargets.filter(o => !!o.systemDir);
    if (systemOutputs.length > 0) {
        const esmOpts = {
            format: 'system',
            entryFileNames: config.hashFileNames ? 'p-[hash].system.js' : '[name].system.js',
            chunkFileNames: config.hashFileNames ? 'p-[hash].system.js' : '[name]-[hash].system.js',
            preferConst: true
        };
        const results = await generateRollupOutput(rollupBuild, esmOpts, config, buildCtx.entryModules);
        if (results != null) {
            const destinations = systemOutputs.map(o => o.esmDir);
            await generateLazyModules(config, compilerCtx, buildCtx, destinations, results, 'es5', true, '.system');
            await generateSystemLoaders(config, compilerCtx, results, systemOutputs);
        }
    }
}
function generateSystemLoaders(config, compilerCtx, rollupResult, systemOutputs) {
    const loaderFilename = rollupResult.find(r => r.isBrowserLoader).fileName;
    return Promise.all(systemOutputs.map((o) => writeSystemLoader(config, compilerCtx, loaderFilename, o)));
}
async function writeSystemLoader(config, compilerCtx, loaderFilename, outputTarget) {
    if (outputTarget.systemLoaderFile) {
        const entryPointPath = config.sys.path.join(outputTarget.systemDir, loaderFilename);
        const relativePath = relativeImport(config, outputTarget.systemLoaderFile, entryPointPath);
        const loaderContent = await getSystemLoader(config, relativePath, outputTarget.polyfills);
        await compilerCtx.fs.writeFile(outputTarget.systemLoaderFile, loaderContent);
    }
}
async function getSystemLoader(config, corePath, includePolyfills) {
    const polyfills = includePolyfills ? await getAppBrowserCorePolyfills(config) : '';
    return `
'use strict';
(function () {
  var doc = document;
  var currentScript = doc.currentScript;

  // Safari 10 support type="module" but still download and executes the nomodule script
  if (!currentScript || !currentScript.hasAttribute('nomodule') || !('onbeforeload' in currentScript)) {

    ${polyfills}

    // Figure out currentScript (for IE11, since it does not support currentScript)
    var regex = /\\/${config.fsNamespace}(\\.esm)?\\.js($|\\?|#)/;
    var scriptElm = currentScript || Array.from(doc.querySelectorAll('script')).find(function(s) {
      return regex.test(s.src) || s.getAttribute('data-stencil-namespace') === "${config.fsNamespace}";
    });

    var resourcesUrl = scriptElm ? scriptElm.getAttribute('data-resources-url') || scriptElm.src : '';
    var start = function() {
      var url = new URL('${corePath}', resourcesUrl);
      System.import(url.href);
    };

    if (win.__stencil_cssshim) {
      win.__stencil_cssshim.initShim().then(start);
    } else {
      start();
    }

    // Note: using .call(window) here because the self-executing function needs
    // to be scoped to the window object for the ES6Promise polyfill to work
  }
}).call(window);
`;
}

async function generateCjs(config, compilerCtx, buildCtx, rollupBuild, outputTargets) {
    const cjsOutputs = outputTargets.filter(o => !!o.cjsDir);
    if (cjsOutputs.length > 0) {
        const esmOpts = {
            format: 'cjs',
            entryFileNames: '[name].cjs.js',
            preferConst: true
        };
        const results = await generateRollupOutput(rollupBuild, esmOpts, config, buildCtx.entryModules);
        if (results != null) {
            const destinations = cjsOutputs.map(o => o.cjsDir);
            await generateLazyModules(config, compilerCtx, buildCtx, destinations, results, 'es2017', false, '.cjs');
            await generateShortcuts$1(config, compilerCtx, results, cjsOutputs);
        }
    }
}
function generateShortcuts$1(config, compilerCtx, rollupResult, outputTargets) {
    const indexFilename = rollupResult.find(r => r.isIndex).fileName;
    return Promise.all(outputTargets.map(async (o) => {
        if (o.cjsIndexFile) {
            const entryPointPath = config.sys.path.join(o.cjsDir, indexFilename);
            const relativePath = relativeImport(config, o.cjsIndexFile, entryPointPath);
            const shortcutContent = `module.exports = require('${relativePath}');`;
            await compilerCtx.fs.writeFile(o.cjsIndexFile, shortcutContent);
        }
    }));
}

function generateModuleGraph(cmps, bundleModules) {
    const cmpMap = new Map();
    cmps.forEach(cmp => {
        const bundle = bundleModules.find(b => b.cmps.includes(cmp));
        if (bundle) {
            // add default case for no mode
            cmpMap.set(getScopeId(cmp.tagName), bundle.rollupResult.imports);
            // add modes cases
            bundle.outputs.map(o => {
                cmpMap.set(getScopeId(cmp.tagName, o.modeName), [
                    ...bundle.rollupResult.imports,
                    o.fileName
                ]);
            });
        }
    });
    return cmpMap;
}

async function generateLazyLoadedApp(config, compilerCtx, buildCtx, outputTargets) {
    if (canSkipLazyBuild(buildCtx)) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`bundling components started`);
    const cmps = buildCtx.components;
    const build = getBuildConditionals$1(config, cmps);
    const rollupBuild = await bundleLazyApp(config, compilerCtx, buildCtx, build);
    if (buildCtx.hasError) {
        return;
    }
    await buildCtx.stylesPromise;
    const [componentBundle] = await Promise.all([
        generateEsmBrowser(config, compilerCtx, buildCtx, rollupBuild, outputTargets),
        generateEsm(config, compilerCtx, buildCtx, rollupBuild, outputTargets),
        generateSystem(config, compilerCtx, buildCtx, rollupBuild, outputTargets),
        generateCjs(config, compilerCtx, buildCtx, rollupBuild, outputTargets),
    ]);
    await generateLegacyLoader(config, compilerCtx, outputTargets);
    timespan.finish(`bundling components finished`);
    buildCtx.componentGraph = generateModuleGraph(buildCtx.components, componentBundle);
}
function getBuildConditionals$1(config, cmps) {
    const build = getBuildFeatures(cmps);
    build.lazyLoad = true;
    build.hydrateServerSide = false;
    build.cssVarShim = true;
    build.initializeNextTick = true;
    build.taskQueue = true;
    const hasHydrateOutputTargets = config.outputTargets.some(isOutputTargetHydrate);
    build.hydrateClientSide = hasHydrateOutputTargets;
    updateBuildConditionals(config, build);
    return build;
}
async function bundleLazyApp(config, compilerCtx, buildCtx, build) {
    const loader = {
        '@core-entrypoint': BROWSER_ENTRY,
        '@external-entrypoint': EXTERNAL_ENTRY,
    };
    // Provide an empty index.js if the projects does not provide one
    const usersIndexJsPath = config.sys.path.join(config.srcDir, 'index.js');
    const hasUserDefinedIndex = await compilerCtx.fs.access(usersIndexJsPath);
    if (!hasUserDefinedIndex) {
        // We can use the loader rollup plugin to inject content to the "index" chunk
        loader[usersIndexJsPath] = `//! Autogenerated index`;
    }
    const bundleAppOptions = {
        loader,
        inputs: {
            [config.fsNamespace]: '@core-entrypoint',
            'loader': '@external-entrypoint',
            'index': usersIndexJsPath
        },
        cache: compilerCtx.rollupCacheLazy
    };
    buildCtx.entryModules.forEach(entryModule => {
        bundleAppOptions.inputs[entryModule.entryKey] = entryModule.entryKey;
    });
    const rollupBuild = await bundleApp(config, compilerCtx, buildCtx, build, bundleAppOptions);
    if (rollupBuild != null) {
        compilerCtx.rollupCacheLazy = rollupBuild.cache;
    }
    else {
        compilerCtx.rollupCacheLazy = null;
    }
    return rollupBuild;
}
const BROWSER_ENTRY = `
import { bootstrapLazy, patchBrowser, globals } from '@stencil/core';
patchBrowser().then(options => {
  globals();
  return bootstrapLazy([/*!__STENCIL_LAZY_DATA__*/], options);
});
`;
// This is for webpack
const EXTERNAL_ENTRY = `
import { bootstrapLazy, patchEsm, globals } from '@stencil/core';

export const defineCustomElements = (win, options) => {
  return patchEsm().then(() => {
    globals();
    bootstrapLazy([/*!__STENCIL_LAZY_DATA__*/], options);
  });
};
`;
function generateLegacyLoader(config, compilerCtx, outputTargets) {
    return Promise.all(outputTargets.map(async (o) => {
        if (o.legacyLoaderFile) {
            const loaderContent = getLegacyLoader(config);
            await compilerCtx.fs.writeFile(o.legacyLoaderFile, loaderContent);
        }
    }));
}
function getLegacyLoader(config) {
    const namespace = config.fsNamespace;
    return `
(function(doc){
  var scriptElm = doc.scripts[doc.scripts.length - 1];
  var warn = ['[${namespace}] Deprecated script, please remove: ' + scriptElm.outerHTML];

  warn.push('To improve performance it is recommended to set the differential scripts in the head as follows:')

  var parts = scriptElm.src.split('/');
  parts.pop();
  parts.push('${namespace}');
  var url = parts.join('/');

  var scriptElm = doc.createElement('script');
  scriptElm.setAttribute('type', 'module');
  scriptElm.src = url + '/${namespace}.esm.js';
  warn.push(scriptElm.outerHTML);
  scriptElm.setAttribute('data-stencil-namespace', '${namespace}');
  doc.head.appendChild(scriptElm);

  scriptElm = doc.createElement('script');
  scriptElm.setAttribute('nomodule', '');
  scriptElm.src = url + '/${namespace}.js';
  warn.push(scriptElm.outerHTML);
  scriptElm.setAttribute('data-stencil-namespace', '${namespace}');
  doc.head.appendChild(scriptElm);

  console.warn(warn.join('\\n'));

})(document);`;
}
function canSkipLazyBuild(buildCtx) {
    if (buildCtx.requiresFullBuild) {
        return false;
    }
    if (buildCtx.isRebuild && (buildCtx.hasScriptChanges || buildCtx.hasStyleChanges)) {
        return false;
    }
    return true;
}

async function outputApp(config, compilerCtx, buildCtx, _webComponentsModule) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistLazy);
    if (outputTargets.length === 0) {
        return;
    }
    await generateLazyLoadedApp(config, compilerCtx, buildCtx, outputTargets);
}

async function outputCollections(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistCollection);
    if (outputTargets.length === 0) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate collections started`, true);
    const moduleFiles = buildCtx.moduleFiles.filter(m => !m.isCollectionDependency && m.jsFilePath);
    await Promise.all([
        writeJsFiles(config, compilerCtx, moduleFiles, outputTargets),
        writeManifests(config, compilerCtx, buildCtx, outputTargets)
    ]);
    timespan.finish(`generate collections finished`);
}
function writeJsFiles(config, compilerCtx, moduleFiles, outputTargets) {
    return Promise.all(moduleFiles
        .map(moduleFile => writeModuleFile(config, compilerCtx, moduleFile, outputTargets)));
}
async function writeModuleFile(config, compilerCtx, moduleFile, outputTargets) {
    const relPath = config.sys.path.relative(config.srcDir, moduleFile.jsFilePath);
    const jsContent = await compilerCtx.fs.readFile(moduleFile.jsFilePath);
    await Promise.all(outputTargets.map(o => {
        const outputFilePath = config.sys.path.join(o.collectionDir, relPath);
        return compilerCtx.fs.writeFile(outputFilePath, jsContent);
    }));
}
async function writeManifests(config, compilerCtx, buildCtx, outputTargets) {
    const collectionData = JSON.stringify(serializeCollectionManifest(config, compilerCtx, buildCtx), null, 2);
    return Promise.all(outputTargets.map(o => writeManifest(config, compilerCtx, collectionData, o)));
}
// this maps the json data to our internal data structure
// apping is so that the internal data structure "could"
// change, but the external user data will always use the same api
// over the top lame mapping functions is basically so we can loosly
// couple core component meta data between specific versions of the compiler
async function writeManifest(config, compilerCtx, collectionData, outputTarget) {
    // get the absolute path to the directory where the collection will be saved
    const collectionDir = normalizePath(outputTarget.collectionDir);
    // create an absolute file path to the actual collection json file
    const collectionFilePath = normalizePath(config.sys.path.join(collectionDir, COLLECTION_MANIFEST_FILE_NAME));
    // don't bother serializing/writing the collection if we're not creating a distribution
    await compilerCtx.fs.writeFile(collectionFilePath, collectionData);
}
function serializeCollectionManifest(config, compilerCtx, buildCtx) {
    // create the single collection we're going to fill up with data
    const collectionManifest = {
        entries: buildCtx.moduleFiles
            .filter(mod => !mod.isCollectionDependency && mod.cmps.length > 0)
            .map(mod => config.sys.path.relative(config.srcDir, mod.jsFilePath)),
        compiler: {
            name: config.sys.compiler.name,
            version: config.sys.compiler.version,
            typescriptVersion: config.sys.compiler.typescriptVersion
        },
        collections: serializeCollectionDependencies(compilerCtx),
        bundles: config.bundles.map(b => ({
            components: b.components.slice().sort()
        }))
    };
    if (config.globalScript) {
        const mod = compilerCtx.moduleMap.get(normalizePath(config.globalScript));
        if (mod) {
            collectionManifest.global = config.sys.path.relative(config.srcDir, mod.jsFilePath);
        }
    }
    return collectionManifest;
}
function serializeCollectionDependencies(compilerCtx) {
    const collectionDeps = compilerCtx.collections.map(c => ({
        name: c.collectionName,
        tags: flatOne(c.moduleFiles.map(m => m.cmps)).map(cmp => cmp.tagName).sort()
    }));
    return sortBy(collectionDeps, item => item.name);
}

function stencilHydratePlugin(config) {
    return {
        name: 'stencil-hydrate-plugin',
        resolveId(id) {
            if (id === '@stencil/core/platform') {
                return {
                    id: config.sys.path.join(config.sys.compiler.distDir, 'hydrate', 'platform.mjs'),
                };
            }
            if (id === '@stencil/core/runtime') {
                return {
                    id: config.sys.path.join(config.sys.compiler.distDir, 'runtime', 'index.mjs'),
                };
            }
            if (id === '@stencil/core/utils') {
                return {
                    id: config.sys.path.join(config.sys.compiler.distDir, 'utils', 'index.mjs'),
                };
            }
            if (id === '@stencil/core') {
                return {
                    id: config.sys.path.join(config.sys.compiler.distDir, 'hydrate', 'platform.mjs'),
                };
            }
            return null;
        }
    };
}

const bundleHydrateApp = async (config, compilerCtx, buildCtx, build, appEntryCode) => {
    try {
        const treeshake = !config.devMode && config.rollupConfig.inputOptions.treeshake !== false
            ? {
                propertyReadSideEffects: false,
                tryCatchDeoptimization: false,
            }
            : false;
        const rollupOptions = Object.assign(Object.assign({}, config.rollupConfig.inputOptions), { input: '@app-entry', inlineDynamicImports: true, plugins: [
                loaderPlugin({
                    '@app-entry': appEntryCode
                }),
                stencilHydratePlugin(config),
                stencilBuildConditionalsPlugin(build, config.fsNamespace),
                globalScriptsPlugin(config, compilerCtx),
                componentEntryPlugin(config, compilerCtx, buildCtx, build, buildCtx.entryModules),
                config.sys.rollup.plugins.commonjs(Object.assign({ include: /node_modules/, sourceMap: false }, config.commonjs)),
                ...config.rollupPlugins,
                pluginHelper(config, buildCtx),
                config.sys.rollup.plugins.nodeResolve(Object.assign({ mainFields: ['collection:main', 'jsnext:main', 'es2017', 'es2015', 'module', 'main'] }, config.nodeResolve)),
                config.sys.rollup.plugins.json(),
                inMemoryFsRead(config, compilerCtx),
                config.sys.rollup.plugins.replace({
                    'process.env.NODE_ENV': config.devMode ? '"development"' : '"production"'
                }),
            ], treeshake, cache: compilerCtx.rollupCacheHydrate, onwarn: createOnWarnFn(buildCtx.diagnostics) });
        const rollupBuild = await config.sys.rollup.rollup(rollupOptions);
        if (rollupBuild != null) {
            compilerCtx.rollupCacheHydrate = rollupBuild.cache;
        }
        else {
            compilerCtx.rollupCacheHydrate = null;
        }
        return rollupBuild;
    }
    catch (e) {
        if (!buildCtx.hasError) {
            loadRollupDiagnostics(compilerCtx, buildCtx, e);
        }
    }
    return undefined;
};

function writeHydrateOutputs(config, compilerCtx, buildCtx, outputTargets, rollupOutput) {
    return Promise.all(outputTargets.map(outputTarget => {
        return writeHydrateOutput(config, compilerCtx, buildCtx, outputTarget, rollupOutput);
    }));
}
async function writeHydrateOutput(config, compilerCtx, buildCtx, outputTarget, rollupOutput) {
    const hydrateAppFileName = getHydrateAppFileName(config);
    const hydratePackageName = await getHydratePackageName(config, compilerCtx);
    const hydrateAppDirPath = outputTarget.dir;
    const hydrateCoreIndexPath = config.sys.path.join(hydrateAppDirPath, 'index.js');
    const hydrateCoreIndexDtsFilePath = config.sys.path.join(hydrateAppDirPath, 'index.d.ts');
    const pkgJsonPath = config.sys.path.join(hydrateAppDirPath, 'package.json');
    const pkgJsonCode = getHydratePackageJson(config, hydrateCoreIndexPath, hydrateCoreIndexDtsFilePath, hydratePackageName);
    const writePromises = [
        copyHydrateRunner(config, compilerCtx, hydrateAppDirPath, hydrateAppFileName, hydratePackageName),
        compilerCtx.fs.writeFile(pkgJsonPath, pkgJsonCode)
    ];
    rollupOutput.output.forEach(output => {
        if (output.type === 'chunk') {
            const filePath = config.sys.path.join(hydrateAppDirPath, output.fileName);
            writePromises.push(compilerCtx.fs.writeFile(filePath, output.code));
        }
    });
    // always remember a path to the hydrate app that the prerendering may need later on
    buildCtx.hydrateAppFilePath = hydrateCoreIndexPath;
    return Promise.all(writePromises);
}
function getHydratePackageJson(config, hydrateAppFilePath, hydrateDtsFilePath, hydratePackageName) {
    const pkg = {
        name: hydratePackageName,
        description: `${config.namespace} component hydration app built for a NodeJS environment.`,
        main: config.sys.path.basename(hydrateAppFilePath),
        types: config.sys.path.basename(hydrateDtsFilePath)
    };
    return JSON.stringify(pkg, null, 2);
}
async function getHydratePackageName(config, compilerCtx) {
    try {
        const rootPkgFilePath = config.sys.path.join(config.rootDir, 'package.json');
        const pkgStr = await compilerCtx.fs.readFile(rootPkgFilePath);
        const pkgData = JSON.parse(pkgStr);
        return `${pkgData.name}/hydrate`;
    }
    catch (e) { }
    return `${config.fsNamespace}/hydrate`;
}
function getHydrateAppFileName(config) {
    return `${config.fsNamespace}-hydrate.js`;
}
async function copyHydrateRunner(config, compilerCtx, hydrateAppDirPath, hydrateAppFileName, hydratePackageName) {
    const srcHydrateDir = config.sys.path.join(config.sys.compiler.distDir, 'hydrate');
    const runnerIndexFileName = 'index.js';
    const runnerDtsFileName = 'index.d.ts';
    const runnerSrcPath = config.sys.path.join(srcHydrateDir, runnerIndexFileName);
    const runnerDtsSrcPath = config.sys.path.join(srcHydrateDir, runnerDtsFileName);
    const runnerDestPath = config.sys.path.join(hydrateAppDirPath, runnerIndexFileName);
    const runnerDtsDestPath = config.sys.path.join(hydrateAppDirPath, runnerDtsFileName);
    let runnerSrcCode = await compilerCtx.fs.readFile(runnerSrcPath);
    runnerSrcCode = runnerSrcCode.replace('$$HYDRATE_APP_FILENAME$$', hydrateAppFileName);
    runnerSrcCode = runnerSrcCode.replace('$$HYDRATE_APP_PACKAGE_NAME$$', hydratePackageName);
    await Promise.all([
        compilerCtx.fs.writeFile(runnerDestPath, runnerSrcCode),
        compilerCtx.fs.copyFile(runnerDtsSrcPath, runnerDtsDestPath)
    ]);
}

const addHydrateRuntimeCmpMeta = (classMembers, cmp) => {
    const compactMeta = formatComponentRuntimeMeta(cmp, true);
    const cmpMeta = {
        $flags$: compactMeta[0],
        $tagName$: compactMeta[1],
        $members$: compactMeta[2],
        $listeners$: compactMeta[3],
        $lazyBundleIds$: fakeBundleIds(cmp),
        $attrsToReflect$: []
    };
    // We always need shadow-dom shim in hydrate runtime
    if (cmpMeta.$flags$ & 1 /* shadowDomEncapsulation */) {
        cmpMeta.$flags$ |= 8 /* needsShadowDomShim */;
    }
    const staticMember = createStaticGetter('cmpMeta', convertValueToLiteral(cmpMeta));
    classMembers.push(staticMember);
};
const fakeBundleIds = (cmp) => {
    if (cmp.hasMode) {
        const modes = {};
        cmp.styles.forEach(s => {
            modes[s.modeName] = '-';
        });
        return modes;
    }
    return '-';
};

const updateHydrateComponentClass = (classNode, moduleFile, cmp) => {
    return ts$1__default.updateClassDeclaration(classNode, classNode.decorators, classNode.modifiers, classNode.name, classNode.typeParameters, classNode.heritageClauses, updateHydrateHostComponentMembers(classNode, moduleFile, cmp));
};
const updateHydrateHostComponentMembers = (classNode, moduleFile, cmp) => {
    const classMembers = removeStaticMetaProperties(classNode);
    updateLazyComponentConstructor(classMembers, moduleFile, cmp);
    addLazyElementGetter(classMembers, moduleFile, cmp);
    addWatchers(classMembers, cmp);
    addHydrateRuntimeCmpMeta(classMembers, cmp);
    transformHostData(classMembers, moduleFile);
    return classMembers;
};

const transformToHydrateComponentText = (compilerCtx, buildCtx, cmp, inputJsText) => {
    let outputText = null;
    try {
        const transformOpts = {
            coreImportPath: '@stencil/core',
            componentExport: null,
            componentMetadata: null,
            proxy: null,
            style: 'static'
        };
        const transpileOpts = {
            compilerOptions: {
                module: ts$1__default.ModuleKind.ESNext,
                target: getScriptTarget(),
                skipLibCheck: true,
                noResolve: true,
                noLib: true,
            },
            fileName: cmp.jsFilePath,
            transformers: {
                after: [
                    hydrateComponentTransform(compilerCtx, transformOpts)
                ]
            }
        };
        const transpileOutput = ts$1__default.transpileModule(inputJsText, transpileOpts);
        buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(transpileOutput.diagnostics));
        if (!buildCtx.hasError && typeof transpileOutput.outputText === 'string') {
            outputText = transpileOutput.outputText;
        }
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    return outputText;
};
const hydrateComponentTransform = (compilerCtx, transformOpts) => {
    return transformCtx => {
        return tsSourceFile => {
            const moduleFile = getModuleFromSourceFile(compilerCtx, tsSourceFile);
            const visitNode = (node) => {
                if (ts$1__default.isClassDeclaration(node)) {
                    const cmp = getComponentMeta(compilerCtx, tsSourceFile, node);
                    if (cmp != null) {
                        return updateHydrateComponentClass(node, moduleFile, cmp);
                    }
                }
                return ts$1__default.visitEachChild(node, visitNode, transformCtx);
            };
            tsSourceFile = ts$1__default.visitEachChild(tsSourceFile, visitNode, transformCtx);
            if (moduleFile.isLegacy) {
                addLegacyApis(moduleFile);
            }
            tsSourceFile = addImports(transformOpts, tsSourceFile, moduleFile.coreRuntimeApis, transformOpts.coreImportPath);
            return tsSourceFile;
        };
    };
};

async function updateToHydrateComponents(config, compilerCtx, buildCtx, cmps) {
    const hydrateCmps = await Promise.all(cmps.map(cmp => updateToHydrateComponent(config, compilerCtx, buildCtx, cmp)));
    return sortBy(hydrateCmps, c => c.cmp.componentClassName);
}
async function updateToHydrateComponent(config, compilerCtx, buildCtx, cmp) {
    const inputFilePath = cmp.jsFilePath;
    const inputFileDir = config.sys.path.dirname(inputFilePath);
    const inputFileName = config.sys.path.basename(inputFilePath);
    const inputJsText = await compilerCtx.fs.readFile(inputFilePath);
    const cacheKey = await compilerCtx.cache.createKey('hydrate', COMPILER_BUILD.id, COMPILER_BUILD.transpiler, inputJsText);
    const outputFileName = `${cacheKey}-${inputFileName}`;
    const outputFilePath = config.sys.path.join(inputFileDir, outputFileName);
    const cmpData = {
        filePath: outputFilePath,
        exportLine: ``,
        cmp: cmp,
        uniqueComponentClassName: ``,
        importLine: ``
    };
    const pascalCasedClassName = dashToPascalCase(toTitleCase(cmp.tagName));
    if (cmp.componentClassName !== pascalCasedClassName) {
        cmpData.uniqueComponentClassName = pascalCasedClassName;
        cmpData.importLine = `import { ${cmp.componentClassName} as ${cmpData.uniqueComponentClassName} } from '${cmpData.filePath}';`;
    }
    else {
        cmpData.uniqueComponentClassName = cmp.componentClassName;
        cmpData.importLine = `import { ${cmpData.uniqueComponentClassName} } from '${cmpData.filePath}';`;
    }
    let outputJsText = await compilerCtx.cache.get(cacheKey);
    if (outputJsText == null) {
        outputJsText = transformToHydrateComponentText(compilerCtx, buildCtx, cmp, inputJsText);
        await compilerCtx.cache.put(cacheKey, outputJsText);
    }
    await compilerCtx.fs.writeFile(outputFilePath, outputJsText, { inMemoryOnly: true });
    return cmpData;
}

async function generateHydrateApp(config, compilerCtx, buildCtx, outputTargets) {
    try {
        const cmps = buildCtx.components;
        const build = getBuildConditionals$2(config, cmps);
        const appEntryCode = await generateHydrateAppCore(config, compilerCtx, buildCtx);
        const rollupAppBuild = await bundleHydrateApp(config, compilerCtx, buildCtx, build, appEntryCode);
        if (rollupAppBuild != null) {
            const rollupOutput = await rollupAppBuild.generate({
                format: 'cjs',
                file: getHydrateAppFileName(config),
                chunkFileNames: '[name].js',
            });
            if (!buildCtx.hasError && rollupOutput != null && Array.isArray(rollupOutput.output)) {
                await writeHydrateOutputs(config, compilerCtx, buildCtx, outputTargets, rollupOutput);
            }
        }
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
}
async function generateHydrateAppCore(config, compilerCtx, buildCtx) {
    const cmps = buildCtx.components;
    const coreText = [];
    const hydrateCmps = await updateToHydrateComponents(config, compilerCtx, buildCtx, cmps);
    coreText.push(`import { bootstrapHydrate, registerComponents, styles } from '@stencil/core/platform';`);
    coreText.push(`import globals from '@stencil/core/global-scripts';`);
    hydrateCmps.forEach(cmpData => coreText.push(cmpData.importLine));
    coreText.push(`globals();`);
    coreText.push(`const cmps = [`);
    hydrateCmps.forEach(cmpData => {
        coreText.push(`  ${cmpData.uniqueComponentClassName},`);
    });
    coreText.push(`];`);
    coreText.push(`registerComponents(cmps);`);
    await buildCtx.stylesPromise;
    hydrateCmps.forEach(cmpData => {
        cmpData.cmp.styles.forEach(style => {
            let scopeId = 'sc-' + cmpData.cmp.tagName;
            if (style.modeName !== DEFAULT_STYLE_MODE) {
                scopeId += `-${style.modeName}`;
            }
            if (typeof style.compiledStyleTextScopedCommented === 'string') {
                coreText.push(`styles.set('${scopeId}','${style.compiledStyleTextScopedCommented}');`);
            }
            else {
                coreText.push(`styles.set('${scopeId}','${style.compiledStyleTextScoped}');`);
            }
        });
    });
    coreText.push(`export { bootstrapHydrate }`);
    return coreText.join('\n');
}
function getBuildConditionals$2(config, cmps) {
    const build = getBuildFeatures(cmps);
    build.lazyLoad = true;
    build.hydrateClientSide = false;
    build.hydrateServerSide = true;
    updateBuildConditionals(config, build);
    build.lifecycleDOMEvents = false;
    build.devTools = false;
    build.hotModuleReplacement = false;
    return build;
}

async function outputHydrate(config, compilerCtx, buildCtx) {
    if (config.devMode && !config.flags.prerender) {
        return;
    }
    const hydrateOutputTargets = config.outputTargets.filter(isOutputTargetHydrate);
    if (hydrateOutputTargets.length === 0) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate hydrate app started`);
    await generateHydrateApp(config, compilerCtx, buildCtx, hydrateOutputTargets);
    timespan.finish(`generate hydrate app finished`);
}

async function outputModule(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistModule);
    if (outputTargets.length === 0) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate webcomponents module started`);
    await generateModuleWebComponents(config, compilerCtx, buildCtx, outputTargets);
    timespan.finish(`generate webcomponents module finished`);
}
async function generateModuleWebComponents(config, compilerCtx, buildCtx, outputTargets) {
    await buildCtx.stylesPromise;
    const timespan = buildCtx.createTimeSpan(`generate module web components started`, true);
    await Promise.all([
        bundleRawComponents(config, compilerCtx, buildCtx, outputTargets.filter(o => o.externalRuntime), true),
        bundleRawComponents(config, compilerCtx, buildCtx, outputTargets.filter(o => !o.externalRuntime), false),
    ]);
    timespan.finish(`generate module web components finished`);
}
async function bundleRawComponents(config, compilerCtx, buildCtx, outputTargets, externalRuntime) {
    const cmps = buildCtx.components;
    const build = getBuildConditionals$3(config, cmps);
    const rollupResults = await bundleNativeModule(config, compilerCtx, buildCtx, build, externalRuntime);
    if (Array.isArray(rollupResults) && !buildCtx.hasError) {
        await Promise.all(rollupResults.map(async (result) => {
            let code = result.code;
            if (!externalRuntime && config.minifyJs) {
                const optimizeResults = await optimizeModule(config, compilerCtx, 'es2017', true, code);
                buildCtx.diagnostics.push(...optimizeResults.diagnostics);
                if (optimizeResults.diagnostics.length === 0 && typeof optimizeResults.output === 'string') {
                    code = optimizeResults.output;
                }
            }
            await Promise.all(outputTargets.map(async (outputTarget) => {
                const filePath = config.sys.path.join(outputTarget.dir, result.fileName);
                await compilerCtx.fs.writeFile(filePath, code);
            }));
        }));
    }
}
function getBuildConditionals$3(config, cmps) {
    const build = getBuildFeatures(cmps);
    build.lazyLoad = false;
    build.hydrateClientSide = false;
    build.hydrateServerSide = false;
    build.taskQueue = false;
    updateBuildConditionals(config, build);
    build.devTools = false;
    return build;
}
async function bundleNativeModule(config, compilerCtx, buildCtx, build, externalRuntime) {
    const bundleAppOptions = {
        inputs: {
            'index': '@core-entrypoint'
        },
        loader: {
            '@core-entrypoint': generateEntryPoint(config, compilerCtx, buildCtx.entryModules)
        },
        // TODO: fix dist-module rollup caching
        // cache: compilerCtx.rollupCacheNative,
        externalRuntime: externalRuntime ? '@stencil/core/runtime' : undefined,
        skipDeps: true
    };
    const rollupBuild = await bundleApp(config, compilerCtx, buildCtx, build, bundleAppOptions);
    if (rollupBuild != null) {
        compilerCtx.rollupCacheNative = rollupBuild.cache;
    }
    else {
        compilerCtx.rollupCacheNative = null;
    }
    return generateRollupOutput(rollupBuild, { format: 'esm' }, config, buildCtx.entryModules);
}
function generateEntryPoint(config, compilerCtx, entryModules) {
    const imports = [];
    const exports = [];
    const statements = [];
    const hasGlobal = hasGlobalScriptPaths(config, compilerCtx);
    if (hasGlobal) {
        imports.push(`import { proxyNative, globals } from '@stencil/core';`);
        statements.push(`globals();`);
    }
    else {
        imports.push(`import { proxyNative } from '@stencil/core';`);
    }
    entryModules.forEach(entry => entry.cmps.forEach(cmp => {
        const exportName = dashToPascalCase(cmp.tagName);
        if (cmp.isPlain) {
            exports.push(`export { ${exportName} } from '${entry.entryKey}';`);
        }
        else {
            const meta = stringifyRuntimeData(formatComponentRuntimeMeta(cmp, false));
            const importAs = `$Cmp${exportName}`;
            imports.push(`import { ${exportName} as ${importAs} } from '${entry.entryKey}';`);
            exports.push(`export const ${exportName} = /*@__PURE__*/proxyNative(${importAs}, ${meta});`);
        }
    }));
    return [
        ...imports,
        ...exports,
        ...statements
    ].join('\n');
}

function updateStencilTypesImports(path, typesDir, dtsFilePath, dtsContent) {
    const dir = path.dirname(dtsFilePath);
    const relPath = path.relative(dir, typesDir);
    let coreDtsPath = path.join(relPath, CORE_FILENAME);
    if (!coreDtsPath.startsWith('.')) {
        coreDtsPath = `./${coreDtsPath}`;
    }
    coreDtsPath = normalizePath(coreDtsPath);
    if (dtsContent.includes('@stencil/core')) {
        dtsContent = dtsContent.replace(/(from\s*(:?'|"))@stencil\/core\/internal('|")/g, `$1${coreDtsPath}$2`);
        dtsContent = dtsContent.replace(/(from\s*(:?'|"))@stencil\/core('|")/g, `$1${coreDtsPath}$2`);
    }
    return dtsContent;
}
async function copyStencilCoreDts(config, compilerCtx) {
    const typesOutputTargets = config.outputTargets
        .filter(isOutputTargetDist)
        .filter(o => o.typesDir);
    const srcStencilCoreDts = await config.sys.getClientCoreFile({
        staticName: 'declarations/stencil.core.d.ts'
    });
    return Promise.all(typesOutputTargets.map(outputTarget => {
        const coreDtsFilePath = config.sys.path.join(outputTarget.typesDir, CORE_DTS);
        return compilerCtx.fs.writeFile(coreDtsFilePath, srcStencilCoreDts);
    }));
}
const CORE_FILENAME = `stencil.core`;
const CORE_DTS = `${CORE_FILENAME}.d.ts`;

const COMPONENTS_DTS_HEADER = `/* eslint-disable */
/* tslint:disable */
/**
 * This is an autogenerated file created by the Stencil compiler.
 * It contains typing information for all components that exist in this project.
 */`;
function indentTypes(code) {
    const INDENT_STRING = '  ';
    let indentSize = 0;
    return code
        .split('\n')
        .map(cl => {
        let newCode = cl.trim();
        if (newCode.length === 0) {
            return newCode;
        }
        if (newCode.startsWith('}') && indentSize > 0) {
            indentSize -= 1;
        }
        newCode = INDENT_STRING.repeat(indentSize) + newCode;
        if (newCode.endsWith('{')) {
            indentSize += 1;
        }
        return newCode;
    })
        .join('\n');
}
function sortImportNames(a, b) {
    const aName = a.localName.toLowerCase();
    const bName = b.localName.toLowerCase();
    if (aName < bName)
        return -1;
    if (aName > bName)
        return 1;
    if (a.localName < b.localName)
        return -1;
    if (a.localName > b.localName)
        return 1;
    return 0;
}

function generateEventTypes(cmpEvents) {
    return cmpEvents.map(cmpEvent => {
        const name = `on${toTitleCase(cmpEvent.name)}`;
        const type = (cmpEvent.complexType.original) ? `(event: CustomEvent<${cmpEvent.complexType.original}>) => void` : `CustomEvent`;
        return {
            name,
            type,
            optional: false,
            required: false,
            public: isDocsPublic(cmpEvent.docs),
            jsdoc: getTextDocs(cmpEvent.docs),
        };
    });
}

function generateMethodTypes(cmpMethods) {
    return cmpMethods.map(cmpMethod => ({
        name: cmpMethod.name,
        type: cmpMethod.complexType.signature,
        optional: false,
        required: false,
        public: isDocsPublic(cmpMethod.docs),
        jsdoc: getTextDocs(cmpMethod.docs),
    }));
}

function generatePropTypes(cmpMeta) {
    return [
        ...cmpMeta.properties.map(cmpProp => ({
            name: cmpProp.name,
            type: cmpProp.complexType.original,
            optional: cmpProp.optional,
            required: cmpProp.required,
            public: isDocsPublic(cmpProp.docs),
            jsdoc: getTextDocs(cmpProp.docs),
        })),
        ...cmpMeta.virtualProperties.map(cmpProp => ({
            name: cmpProp.name,
            type: cmpProp.type,
            optional: true,
            required: false,
            jsdoc: cmpProp.docs,
            public: true
        }))
    ];
}

/**
 * Generate a string based on the types that are defined within a component.
 *
 * @param cmp the metadata for the component that a type definition string is generated for
 * @param importPath the path of the component file
 */
function generateComponentTypes(cmp) {
    const tagName = cmp.tagName.toLowerCase();
    const tagNameAsPascal = dashToPascalCase(tagName);
    const htmlElementName = `HTML${tagNameAsPascal}Element`;
    const propAttributes = generatePropTypes(cmp);
    const methodAttributes = generateMethodTypes(cmp.methods);
    const eventAttributes = generateEventTypes(cmp.events);
    const stencilComponentAttributes = attributesToMultiLineString([
        ...propAttributes,
        ...methodAttributes
    ], false);
    const isDep = cmp.isCollectionDependency;
    const stencilComponentJSXAttributes = attributesToMultiLineString([
        ...propAttributes,
        ...eventAttributes
    ], true);
    return {
        isDep,
        tagName,
        tagNameAsPascal,
        htmlElementName,
        component: `interface ${tagNameAsPascal} {${stencilComponentAttributes}}`,
        jsx: `interface ${tagNameAsPascal} {${stencilComponentJSXAttributes}}`,
        element: `
interface ${htmlElementName} extends Components.${tagNameAsPascal}, HTMLStencilElement {}
var ${htmlElementName}: {
  prototype: ${htmlElementName};
  new (): ${htmlElementName};
};`,
    };
}
function attributesToMultiLineString(attributes, jsxAttributes, paddingString = '') {
    const attributesStr = sortBy(attributes, a => a.name)
        .filter(type => type.public || !jsxAttributes)
        .reduce((fullList, type) => {
        if (type.jsdoc) {
            fullList.push(`/**`);
            fullList.push(...type.jsdoc.split('\n').map(line => '  * ' + line));
            fullList.push(` */`);
        }
        const optional = (jsxAttributes)
            ? !type.required
            : type.optional;
        fullList.push(`'${type.name}'${optional ? '?' : ''}: ${type.type};`);
        return fullList;
    }, [])
        .map(item => `${paddingString}${item}`)
        .join(`\n`);
    return attributesStr !== '' ? `\n${attributesStr}\n` : '';
}

/**
 * Find all referenced types by a component and add them to the importDataObj and return the newly
 * updated importDataObj
 *
 * @param importDataObj key/value of type import file, each value is an array of imported types
 * @param cmpMeta the metadata for the component that is referencing the types
 * @param filePath the path of the component file
 * @param config general config that all of stencil uses
 */
function updateReferenceTypeImports(config, importDataObj, allTypes, cmp, filePath) {
    const updateImportReferences = updateImportReferenceFactory(config, allTypes, filePath);
    return [
        ...cmp.properties,
        ...cmp.events,
        ...cmp.methods,
    ]
        .filter(cmpProp => cmpProp.complexType && cmpProp.complexType.references)
        .reduce((obj, cmpProp) => {
        return updateImportReferences(obj, cmpProp.complexType.references);
    }, importDataObj);
}
function updateImportReferenceFactory(config, allTypes, filePath) {
    function getIncrementTypeName(name) {
        const counter = allTypes.get(name);
        if (counter === undefined) {
            allTypes.set(name, 1);
            return name;
        }
        allTypes.set(name, counter + 1);
        return `${name}${counter}`;
    }
    return (obj, typeReferences) => {
        Object.keys(typeReferences).map(typeName => {
            return [typeName, typeReferences[typeName]];
        }).forEach(([typeName, type]) => {
            let importFileLocation;
            // If global then there is no import statement needed
            if (type.location === 'global') {
                return;
                // If local then import location is the current file
            }
            else if (type.location === 'local') {
                importFileLocation = filePath;
            }
            else if (type.location === 'import') {
                importFileLocation = type.path;
            }
            // If this is a relative path make it absolute
            if (importFileLocation.startsWith('.')) {
                importFileLocation =
                    config.sys.path.resolve(config.sys.path.dirname(filePath), importFileLocation);
            }
            obj[importFileLocation] = obj[importFileLocation] || [];
            // If this file already has a reference to this type move on
            if (obj[importFileLocation].find(df => df.localName === typeName)) {
                return;
            }
            const newTypeName = getIncrementTypeName(typeName);
            obj[importFileLocation].push({
                localName: typeName,
                importName: newTypeName
            });
        });
        return obj;
    };
}

async function generateAppTypes(config, compilerCtx, buildCtx, destination) {
    // only gather components that are still root ts files we've found and have component metadata
    // the compilerCtx cache may still have files that may have been deleted/renamed
    const timespan = buildCtx.createTimeSpan(`generated app types started`, true);
    // Generate d.ts files for component types
    let componentTypesFileContent = await generateComponentTypesFile(config, buildCtx);
    // immediately write the components.d.ts file to disk and put it into fs memory
    let componentsDtsFilePath = getComponentsDtsSrcFilePath(config);
    if (destination !== 'src') {
        componentsDtsFilePath = config.sys.path.resolve(destination, GENERATED_DTS);
        componentTypesFileContent = updateStencilTypesImports(config.sys.path, destination, componentsDtsFilePath, componentTypesFileContent);
    }
    await compilerCtx.fs.writeFile(componentsDtsFilePath, componentTypesFileContent, { immediateWrite: true });
    timespan.finish(`generated app types finished: ${config.sys.path.relative(config.rootDir, componentsDtsFilePath)}`);
}
/**
 * Generate the component.d.ts file that contains types for all components
 * @param config the project build configuration
 * @param options compiler options from tsconfig
 */
async function generateComponentTypesFile(config, buildCtx, _destination) {
    let typeImportData = {};
    const allTypes = new Map();
    const needsJSXElementHack = buildCtx.components.some(cmp => cmp.isLegacy);
    const components = buildCtx.components.filter(m => !m.isCollectionDependency);
    const modules = components.map(cmp => {
        typeImportData = updateReferenceTypeImports(config, typeImportData, allTypes, cmp, cmp.sourceFilePath);
        return generateComponentTypes(cmp);
    });
    const jsxAugmentation = `
declare module "@stencil/core" {
  export namespace JSX {
    interface IntrinsicElements {
      ${modules.map(m => `'${m.tagName}': LocalJSX.${m.tagNameAsPascal} & JSXBase.HTMLAttributes<${m.htmlElementName}>;`).join('\n')}
    }
  }
}
`;
    const jsxElementGlobal = !needsJSXElementHack ? '' : `
// Adding a global JSX for backcompatibility with legacy dependencies
export namespace JSX {
  export interface Element {}
}
`;
    const componentsFileString = `
export namespace Components {
  ${modules.map(m => `${m.component}`).join('\n').trim()}
}

declare global {
  ${jsxElementGlobal}
  ${modules.map(m => m.element).join('\n')}
  interface HTMLElementTagNameMap {
    ${modules.map(m => `'${m.tagName}': ${m.htmlElementName};`).join('\n')}
  }
}

declare namespace LocalJSX {
  ${modules.map(m => `${m.jsx}`).join('\n').trim()}

  interface IntrinsicElements {
    ${modules.map(m => `'${m.tagName}': ${m.tagNameAsPascal};`).join('\n')}
  }
}

export { LocalJSX as JSX };

${jsxAugmentation}
`;
    const typeImportString = Object.keys(typeImportData).map(filePath => {
        const typeData = typeImportData[filePath];
        let importFilePath;
        if (config.sys.path.isAbsolute(filePath)) {
            importFilePath = normalizePath('./' +
                config.sys.path.relative(config.srcDir, filePath)).replace(/\.(tsx|ts)$/, '');
        }
        else {
            importFilePath = filePath;
        }
        return `import {
${typeData.sort(sortImportNames).map(td => {
            if (td.localName === td.importName) {
                return `${td.importName},`;
            }
            else {
                return `${td.localName} as ${td.importName},`;
            }
        })
            .join('\n')}
} from '${importFilePath}';`;
    }).join('\n');
    const code = `
import { HTMLStencilElement, JSXBase } from '@stencil/core/internal';
${typeImportString}
${componentsFileString}
`;
    return `${COMPONENTS_DTS_HEADER}

${indentTypes(code)}`;
}

async function generateTypes(config, compilerCtx, buildCtx, pkgData, outputTarget) {
    if (!buildCtx.hasError) {
        await generateTypesOutput(config, compilerCtx, buildCtx, pkgData, outputTarget);
        if (typeof pkgData.types === 'string') {
            await copyStencilCoreDts(config, compilerCtx);
        }
    }
}
async function generateTypesOutput(config, compilerCtx, buildCtx, pkgData, outputTarget) {
    if (typeof pkgData.types !== 'string') {
        return;
    }
    const srcDirItems = await compilerCtx.fs.readdir(config.srcDir, { recursive: false });
    const srcDtsFiles = srcDirItems.filter(srcItem => srcItem.isFile && isDtsFile(srcItem.absPath));
    const distTypesDir = config.sys.path.dirname(pkgData.types);
    // Copy .d.ts files from src to dist
    // In addition, all references to @stencil/core are replaced
    await Promise.all(srcDtsFiles.map(async (srcDtsFile) => {
        const relPath = config.sys.path.relative(config.srcDir, srcDtsFile.absPath);
        const distPath = config.sys.path.join(config.rootDir, distTypesDir, relPath);
        const originalDtsContent = await compilerCtx.fs.readFile(srcDtsFile.absPath);
        const distDtsContent = updateStencilTypesImports(config.sys.path, outputTarget.typesDir, distPath, originalDtsContent);
        await compilerCtx.fs.writeFile(distPath, distDtsContent);
    }));
    const distPath = config.sys.path.join(config.rootDir, distTypesDir);
    await generateAppTypes(config, compilerCtx, buildCtx, distPath);
}

async function outputTypes(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistTypes);
    if (outputTargets.length === 0) {
        return;
    }
    const pkgData = buildCtx.packageJson;
    if (pkgData == null) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate types started`, true);
    await Promise.all(outputTargets.map(outputsTarget => {
        return generateTypes(config, compilerCtx, buildCtx, pkgData, outputsTarget);
    }));
    timespan.finish(`generate types finished`);
}

async function outputLazyLoader(config, compilerCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistLazyLoader);
    if (outputTargets.length === 0) {
        return;
    }
    await Promise.all(outputTargets.map(o => generateLoader(config, compilerCtx, o)));
}
async function generateLoader(config, compilerCtx, outputTarget) {
    const loaderPath = outputTarget.dir;
    const es2017Dir = outputTarget.esmDir;
    const es5Dir = outputTarget.esmEs5Dir || es2017Dir;
    const cjsDir = outputTarget.cjsDir;
    if (!loaderPath || !es2017Dir || !cjsDir) {
        return;
    }
    const es5HtmlElement = await getClientPolyfill(config, 'es5-html-element.js');
    const packageJsonContent = JSON.stringify({
        'name': config.fsNamespace + '-loader',
        'typings': './index.d.ts',
        'module': './index.mjs',
        'main': './index.cjs.js',
        'node:main': './node-main.js',
        'jsnext:main': './index.es2017.mjs',
        'es2015': './index.es2017.mjs',
        'es2017': './index.es2017.mjs',
        'unpkg': './cdn.js',
    }, null, 2);
    const es5EntryPoint = config.sys.path.join(es5Dir, 'loader.mjs');
    const es2017EntryPoint = config.sys.path.join(es2017Dir, 'loader.mjs');
    const polyfillsEntryPoint = config.sys.path.join(es2017Dir, 'polyfills/index.js');
    const cjsEntryPoint = config.sys.path.join(cjsDir, 'loader.cjs.js');
    const polyfillsExport = `export * from '${normalizePath(config.sys.path.relative(loaderPath, polyfillsEntryPoint))}';`;
    const indexContent = `
${es5HtmlElement}
${polyfillsExport}
export * from '${normalizePath(config.sys.path.relative(loaderPath, es5EntryPoint))}';
`;
    const indexES2017Content = `
${polyfillsExport}
export * from '${normalizePath(config.sys.path.relative(loaderPath, es2017EntryPoint))}';
`;
    const indexCjsContent = `
module.exports = require('${normalizePath(config.sys.path.relative(loaderPath, cjsEntryPoint))}');
module.exports.applyPolyfills = function() { return Promise.resolve() };
`;
    const nodeMainContent = `
module.exports.applyPolyfills = function() { return Promise.resolve() };
module.exports.defineCustomElements = function() { return Promise.resolve() };
`;
    const indexDtsPath = config.sys.path.join(loaderPath, 'index.d.ts');
    await Promise.all([
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'package.json'), packageJsonContent),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'index.d.ts'), generateIndexDts(config, indexDtsPath, outputTarget.componentDts)),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'index.mjs'), indexContent),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'index.cjs.js'), indexCjsContent),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'cdn.js'), indexCjsContent),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'index.es2017.mjs'), indexES2017Content),
        compilerCtx.fs.writeFile(config.sys.path.join(loaderPath, 'node-main.js'), nodeMainContent)
    ]);
}
function generateIndexDts(config, indexDtsPath, componentsDtsPath) {
    return `
export * from '${relativeImport(config, indexDtsPath, componentsDtsPath, '.d.ts')}';
export interface CustomElementsDefineOptions {
  exclude?: string[];
  resourcesUrl?: string;
  syncQueue?: boolean;
  jmp?: (c: Function) => any;
  raf?: (c: FrameRequestCallback) => number;
  ael?: (el: EventTarget, eventName: string, listener: EventListenerOrEventListenerObject, options: boolean | AddEventListenerOptions) => void;
  rel?: (el: EventTarget, eventName: string, listener: EventListenerOrEventListenerObject, options: boolean | AddEventListenerOptions) => void;
}
export declare function defineCustomElements(win: Window, opts?: CustomElementsDefineOptions): Promise<void>;
export declare function applyPolyfills(): Promise<void>;
`;
}

async function generateEs5DisabledMessage(config, compilerCtx, outputTarget) {
    // not doing an es5 right now
    // but it's possible during development the user
    // tests on a browser that doesn't support es2017
    const fileName = `${config.fsNamespace}.js`;
    const filePath = config.sys.path.join(outputTarget.buildDir, fileName);
    await compilerCtx.fs.writeFile(filePath, getDisabledMessageScript(config));
    return fileName;
}
function getDisabledMessageScript(config) {
    const style = `
<style>
body {
  display: block !important;
  font-family: sans-serif;
  padding: 20px;
  line-height:22px;
}
h1 {
  font-size: 18px;
}
h2 {
  font-size: 14px;
  margin-top: 40px;
}
</style>
`;
    const htmlLegacy = `
  ${style}

  <h1>This Stencil app is disabled for this browser.</h1>

  <h2>Developers:</h2>
  <ul>
    <li>ES5 builds are disabled <strong>during development</strong> to take advantage of 2x faster build times.</li>
    <li>Please see the example below or our <a href="https://stenciljs.com/docs/stencil-config" target="_blank" rel="noopener noreferrer">config docs</a> if you would like to develop on a browser that does not fully support ES2017 and custom elements.</li>
    <li>Note that by default, ES5 builds and polyfills are enabled during production builds.</li>
    <li>When testing browsers it is recommended to always test in production mode, and ES5 builds should always be enabled during production builds.</li>
    <li><em>This is only an experiement and if it slows down app development then we will revert this and enable ES5 builds during dev.</em></li>
  </ul>


  <h2>Enabling ES5 builds during development:</h2>
  <pre>
    <code>npm run dev --es5</code>
  </pre>
  <p>For stencil-component-starter, use:</p>
  <pre>
    <code>npm start --es5</code>
  </pre>


  <h2>Enabling full production builds during development:</h2>
  <pre>
    <code>npm run dev --prod</code>
  </pre>
  <p>For stencil-component-starter, use:</p>
  <pre>
    <code>npm start --prod</code>
  </pre>

  <h2>Current Browser's Support:</h2>
  <ul>
    <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import">ES Module Imports</a>: <span id="es-modules-test"></span></li>
    <li><a href="http://2ality.com/2017/01/import-operator.html">ES Dynamic Imports</a>: <span id="es-dynamic-modules-test"></span></li>
    <li><a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/customElements">Custom Elements</a>: <span id="custom-elements-test"></span></li>
    <li><a href="https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM">Shadow DOM</a>: <span id="shadow-dom-test"></span></li>
    <li><a href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API">fetch</a>: <span id="fetch-test"></span></li>
    <li><a href="https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_variables">CSS Variables</a>: <span id="css-variables-test"></span></li>
  </ul>

  <h2>Current Browser:</h2>
  <pre>
    <code id="current-browser-output"></code>
  </pre>
  `;
    const htmlUpdate = `
  ${style}

  <h1>Update src/index.html</h1>

  <p>Stencil recently changed how scripts are loaded in order to improve performance.</p>

  <h2>BEFORE:</h2>
  <p>Previously, a single script was included that handled loading the correct JavaScript based on browser support.</p>
  <pre>
    <code>${escapeHtml(`<script src="/build/${config.fsNamespace}.js"></script>
`)}</code>
  </pre>

  <h2 style="margin-top:0">AFTER:</h2>
  <p>The index.html should now include two scripts using the modern ES Module script pattern.
  Note that only one file will actually be requested and loaded based on the browser's native support for ES Modules.
  For more info, please see <a href="https://developers.google.com/web/fundamentals/primers/modules#browser" target="_blank" rel="noopener noreferrer">Using JavaScript modules on the web</a>.
  </p>
  <pre>
  <code>${escapeHtml(`<script`)} <span style="background:yellow">type="module"</span> src="/build/${config.fsNamespace}<span style="background:yellow">.esm</span>.js"${escapeHtml(`></script>`)}
  ${escapeHtml(`<script`)} <span style="background:yellow">nomodule</span> ${escapeHtml(`src="/build/${config.fsNamespace}.js"></script>`)}</code>
    </pre>
  `;
    const script = `
    function supportsDynamicImports() {
      try {
        new Function('import("")');
        return true;
      } catch (e) {}
      return false;
    }
    var supportsEsModules = !!('noModule' in document.createElement('script'));

    if (!supportsEsModules) {
      document.body.innerHTML = '${inlineHTML(htmlLegacy)}';

      document.getElementById('current-browser-output').textContent = window.navigator.userAgent;
      document.getElementById('es-modules-test').textContent = supportsEsModules;
      document.getElementById('es-dynamic-modules-test').textContent = supportsDynamicImports();
      document.getElementById('shadow-dom-test').textContent = !!(document.head.attachShadow);
      document.getElementById('custom-elements-test').textContent = !!(window.customElements);
      document.getElementById('css-variables-test').textContent = !!(window.CSS && window.CSS.supports && window.CSS.supports('color', 'var(--c)'));
      document.getElementById('fetch-test').textContent = !!(window.fetch);
    } else {
      document.body.innerHTML = '${inlineHTML(htmlUpdate)}';
    }
  `;
    // timeout just to ensure <body> is ready
    return `setTimeout(function(){ ${script} }, 10)`;
}
function inlineHTML(html) {
    return html.replace(/\n/g, '\\n').replace(/\'/g, `\\'`).trim();
}

function getAbsoluteBuildDir(config, outputTarget) {
    const relativeBuildDir = config.sys.path.relative(outputTarget.dir, outputTarget.buildDir);
    return config.sys.path.join('/', relativeBuildDir) + '/';
}

async function generateHashedCopy(config, compilerCtx, path) {
    try {
        const content = await compilerCtx.fs.readFile(path);
        const hash = await config.sys.generateContentHash(content, config.hashedFileNameLength);
        const hashedFileName = `p-${hash}${config.sys.path.extname(path)}`;
        await compilerCtx.fs.writeFile(config.sys.path.join(config.sys.path.dirname(path), hashedFileName), content);
        return hashedFileName;
    }
    catch (e) { }
    return undefined;
}

function optimizeCriticalPath(config, doc, criticalBundlers, outputTarget) {
    const buildDir = getAbsoluteBuildDir(config, outputTarget);
    const paths = criticalBundlers.map(path => config.sys.path.join(buildDir, path));
    injectModulePreloads(doc, paths);
}
function injectModulePreloads(doc, paths) {
    const existingLinks = Array.from(doc.querySelectorAll('link[rel=modulepreload]'))
        .map(link => link.getAttribute('href'));
    const addLinks = paths
        .filter(path => !existingLinks.includes(path))
        .map(path => createModulePreload(doc, path));
    const firstScript = doc.head.querySelector('script');
    if (firstScript) {
        addLinks.forEach(link => {
            doc.head.insertBefore(link, firstScript);
        });
    }
    else {
        addLinks.forEach(link => {
            doc.head.appendChild(link);
        });
    }
}
function createModulePreload(doc, href) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'modulepreload');
    link.setAttribute('href', href);
    return link;
}

async function optimizeEsmImport(config, compilerCtx, doc, outputTarget) {
    const resourcesUrl = getAbsoluteBuildDir(config, outputTarget);
    const entryFilename = `${config.fsNamespace}.esm.js`;
    const expectedSrc = config.sys.path.join(resourcesUrl, entryFilename);
    const script = Array.from(doc.querySelectorAll('script'))
        .find(s => s.getAttribute('type') === 'module' && s.getAttribute('src') === expectedSrc);
    if (!script) {
        return false;
    }
    const entryPath = config.sys.path.join(outputTarget.buildDir, entryFilename);
    let content = await compilerCtx.fs.readFile(entryPath);
    // If the script is too big, instead of inlining, we hash the file and change
    // the <script> to the new location
    if (content.length > MAX_JS_INLINE_SIZE) {
        const hashedFile = await generateHashedCopy(config, compilerCtx, entryPath);
        if (hashedFile) {
            const hashedPath = config.sys.path.join(resourcesUrl, hashedFile);
            script.setAttribute('src', hashedPath);
            script.setAttribute('data-resources-url', resourcesUrl);
            script.setAttribute('data-stencil-namespace', config.fsNamespace);
            injectModulePreloads(doc, [hashedPath]);
            return true;
        }
        return false;
    }
    // Let's try to inline, we have to fix all the relative paths of the imports
    const result = content.match(/import.*from\s*(?:'|")(.*)(?:'|");/);
    if (!result) {
        return false;
    }
    const corePath = result[1];
    const newPath = config.sys.path.join(config.sys.path.dirname(expectedSrc), corePath);
    content = content.replace(corePath, newPath);
    // insert inline script
    const inlinedScript = doc.createElement('script');
    inlinedScript.setAttribute('type', 'module');
    inlinedScript.setAttribute('data-resources-url', resourcesUrl);
    inlinedScript.setAttribute('data-stencil-namespace', config.fsNamespace);
    inlinedScript.innerHTML = content;
    doc.body.appendChild(inlinedScript);
    // remove original script
    script.remove();
    return true;
}
// https://twitter.com/addyosmani/status/1143938175926095872
const MAX_JS_INLINE_SIZE = 1 * 1024;

const URL_ = /*@__PURE__*/(function(){
  if (typeof URL === 'function') {
    return URL;
  }
  const requireFunc = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;
  if (typeof requireFunc === 'function') {
    try {
      return requireFunc('url').URL;
    } catch (e) {}
  }
  return function() {}
})();

function generateServiceWorkerUrl(config, outputTarget) {
    let swUrl = normalizePath(config.sys.path.relative(outputTarget.appDir, outputTarget.serviceWorker.swDest));
    if (swUrl.charAt(0) !== '/') {
        swUrl = '/' + swUrl;
    }
    const baseUrl = new URL_(outputTarget.baseUrl, 'http://config.stenciljs.com');
    let basePath = baseUrl.pathname;
    if (!basePath.endsWith('/')) {
        basePath += '/';
    }
    swUrl = basePath + swUrl.substring(1);
    return swUrl;
}

async function generateServiceWorker(config, buildCtx, workbox, outputTarget) {
    const serviceWorker = await getServiceWorker(outputTarget);
    if (serviceWorker.unregister) {
        await config.sys.fs.writeFile(serviceWorker.swDest, SELF_UNREGISTER_SW);
    }
    else if (serviceWorker.swSrc) {
        return Promise.all([
            copyLib(buildCtx, outputTarget, workbox),
            injectManifest(buildCtx, serviceWorker, workbox)
        ]);
    }
    else {
        return generateSW(buildCtx, serviceWorker, workbox);
    }
}
async function copyLib(buildCtx, outputTarget, workbox) {
    const timeSpan = buildCtx.createTimeSpan(`copy service worker library started`, true);
    try {
        await workbox.copyWorkboxLibraries(outputTarget.appDir);
    }
    catch (e) {
        const d = buildWarn(buildCtx.diagnostics);
        d.messageText = 'Service worker library already exists';
    }
    timeSpan.finish(`copy service worker library finished`);
}
async function generateSW(buildCtx, serviceWorker, workbox) {
    const timeSpan = buildCtx.createTimeSpan(`generate service worker started`);
    try {
        await workbox.generateSW(serviceWorker);
        timeSpan.finish(`generate service worker finished`);
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
}
async function injectManifest(buildCtx, serviceWorker, workbox) {
    const timeSpan = buildCtx.createTimeSpan(`inject manifest into service worker started`);
    try {
        await workbox.injectManifest(serviceWorker);
        timeSpan.finish('inject manifest into service worker finished');
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
}
function hasServiceWorkerChanges(config, buildCtx) {
    if (config.devMode && !config.flags.serviceWorker) {
        return false;
    }
    const wwwServiceOutputs = config.outputTargets
        .filter(isOutputTargetWww)
        .filter(o => o.serviceWorker && o.serviceWorker.swSrc);
    return wwwServiceOutputs.some(outputTarget => {
        return buildCtx.filesChanged.some(fileChanged => config.sys.path.basename(fileChanged).toLowerCase() === config.sys.path.basename(outputTarget.serviceWorker.swSrc).toLowerCase());
    });
}
async function getServiceWorker(outputTarget) {
    if (!outputTarget.serviceWorker) {
        return undefined;
    }
    const serviceWorker = Object.assign({}, outputTarget.serviceWorker);
    if (serviceWorker.unregister !== true) {
        delete serviceWorker.unregister;
    }
    return serviceWorker;
}
const INDEX_ORG = 'index-org.html';
function getRegisterSW(swUrl) {
    return `
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('${swUrl}')
      .then(function(reg) {
        reg.onupdatefound = function() {
          var installingWorker = reg.installing;
          installingWorker.onstatechange = function() {
            if (installingWorker.state === 'installed') {
              window.dispatchEvent(new Event('swUpdate'))
            }
          }
        }
      })
      .catch(function(err) { console.error('service worker error', err) });
  });
}`;
}
const UNREGISTER_SW = `
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // auto-unregister service worker during dev mode
  navigator.serviceWorker.getRegistration().then(function(registration) {
    if (registration) {
      registration.unregister().then(function() { location.reload(true) });
    }
  });
}
`;
const SELF_UNREGISTER_SW = `
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  self.registration.unregister()
    .then(function() {
      return self.clients.matchAll();
    })
    .then(function(clients) {
      clients.forEach(client => client.navigate(client.url))
    });
});
`;

async function updateIndexHtmlServiceWorker(config, buildCtx, doc, outputTarget) {
    const serviceWorker = outputTarget.serviceWorker;
    if ((serviceWorker && serviceWorker.unregister) || (!serviceWorker && config.devMode)) {
        injectUnregisterServiceWorker(doc);
    }
    else if (serviceWorker) {
        await injectRegisterServiceWorker(config, buildCtx, outputTarget, doc);
    }
}
async function injectRegisterServiceWorker(config, buildCtx, outputTarget, doc) {
    const swUrl = generateServiceWorkerUrl(config, outputTarget);
    const serviceWorker = getRegisterSwScript(doc, buildCtx, swUrl);
    doc.body.appendChild(serviceWorker);
}
function injectUnregisterServiceWorker(doc) {
    doc.body.appendChild(getUnregisterSwScript(doc));
}
function getRegisterSwScript(doc, buildCtx, swUrl) {
    const script = doc.createElement('script');
    script.setAttribute('data-build', `${buildCtx.timestamp}`);
    script.innerHTML = getRegisterSW(swUrl);
    return script;
}
function getUnregisterSwScript(doc) {
    const script = doc.createElement('script');
    script.innerHTML = UNREGISTER_SW;
    return script;
}

function updateGlobalStylesLink(config, doc, globalScriptFilename, outputTarget) {
    if (!globalScriptFilename) {
        return;
    }
    const buildDir = getAbsoluteBuildDir(config, outputTarget);
    const originalPath = config.sys.path.join(buildDir, config.fsNamespace + '.css');
    const newPath = config.sys.path.join(buildDir, globalScriptFilename);
    if (originalPath === newPath) {
        return;
    }
    const replacer = new RegExp(escapeRegExp(originalPath) + '$');
    Array.from(doc.querySelectorAll('link')).forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            const newHref = href.replace(replacer, newPath);
            if (newHref !== href) {
                link.setAttribute('href', newHref);
            }
        }
    });
}
function escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function inlineStyleSheets(config, compilerCtx, doc, maxSize, outputTarget) {
    const globalLinks = Array.from(doc.querySelectorAll('link[rel=stylesheet]'));
    return Promise.all(globalLinks.map(async (link) => {
        const href = link.getAttribute('href');
        if (typeof href !== 'string' || !href.startsWith('/') || link.getAttribute('media') !== null) {
            return;
        }
        try {
            const fsPath = config.sys.path.join(outputTarget.dir, href);
            const styles = await compilerCtx.fs.readFile(fsPath);
            if (styles.length > maxSize) {
                return;
            }
            // insert inline <style>
            const inlinedStyles = doc.createElement('style');
            inlinedStyles.innerHTML = styles;
            link.parentNode.insertBefore(inlinedStyles, link);
            link.remove();
        }
        catch (e) { }
    }));
}

async function outputWww(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetWww);
    if (outputTargets.length === 0) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate www started`, true);
    const criticalBundles = getCriticalPath(buildCtx);
    await Promise.all(outputTargets.map(outputTarget => generateWww(config, compilerCtx, buildCtx, criticalBundles, outputTarget)));
    timespan.finish(`generate www finished`);
}
function getCriticalPath(buildCtx) {
    const componentGraph = buildCtx.componentGraph;
    if (!buildCtx.indexDoc || !componentGraph) {
        return [];
    }
    return unique(flatOne(getUsedComponents(buildCtx.indexDoc, buildCtx.components)
        .map(tagName => getScopeId(tagName))
        .map(scopeId => buildCtx.componentGraph.get(scopeId) || []))).sort();
}
async function generateWww(config, compilerCtx, buildCtx, criticalPath, outputTarget) {
    if (!config.buildEs5) {
        await generateEs5DisabledMessage(config, compilerCtx, outputTarget);
    }
    // Copy global styles into the build directory
    // Process
    if (buildCtx.indexDoc && outputTarget.indexHtml) {
        await generateIndexHtml(config, compilerCtx, buildCtx, criticalPath, outputTarget);
    }
    await generateHostConfig(config, compilerCtx, outputTarget);
}
function generateHostConfig(config, compilerCtx, outputTarget) {
    const buildDir = getAbsoluteBuildDir(config, outputTarget);
    const hostConfigPath = config.sys.path.join(outputTarget.appDir, 'host.config.json');
    const hostConfigContent = JSON.stringify({
        'hosting': {
            'headers': [
                {
                    'source': config.sys.path.join(buildDir, '/p-*'),
                    'headers': [{
                            'key': 'Cache-Control',
                            'value': 'max-age=365000000, immutable'
                        }]
                }
            ]
        }
    }, null, '  ');
    return compilerCtx.fs.writeFile(hostConfigPath, hostConfigContent);
}
async function generateIndexHtml(config, compilerCtx, buildCtx, criticalPath, outputTarget) {
    if (compilerCtx.hasSuccessfulBuild && !buildCtx.hasHtmlChanges) {
        // no need to rebuild index.html if there were no app file changes
        return;
    }
    // get the source index html content
    try {
        const doc = config.sys.cloneDocument(buildCtx.indexDoc);
        // validateHtml(config, buildCtx, doc);
        await updateIndexHtmlServiceWorker(config, buildCtx, doc, outputTarget);
        if (!config.watch && !config.devMode) {
            const globalStylesFilename = await generateHashedCopy(config, compilerCtx, config.sys.path.join(outputTarget.buildDir, `${config.fsNamespace}.css`));
            const scriptFound = await optimizeEsmImport(config, compilerCtx, doc, outputTarget);
            await inlineStyleSheets(config, compilerCtx, doc, MAX_CSS_INLINE_SIZE, outputTarget);
            updateGlobalStylesLink(config, doc, globalStylesFilename, outputTarget);
            if (scriptFound) {
                optimizeCriticalPath(config, doc, criticalPath, outputTarget);
            }
        }
        if (config.sys.serializeNodeToHtml != null) {
            const indexContent = config.sys.serializeNodeToHtml(doc);
            await compilerCtx.fs.writeFile(outputTarget.indexHtml, indexContent);
            if (outputTarget.serviceWorker && config.flags.prerender) {
                await compilerCtx.fs.writeFile(config.sys.path.join(outputTarget.appDir, INDEX_ORG), indexContent);
            }
            buildCtx.debug(`generateIndexHtml, write: ${config.sys.path.relative(config.rootDir, outputTarget.indexHtml)}`);
        }
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
}
const MAX_CSS_INLINE_SIZE = 3 * 1024;

const AUTO_GENERATE_COMMENT = `<!-- Auto Generated Below -->`;
const NOTE = `*Built with [StencilJS](https://stenciljs.com/)*`;

async function generateDocData(config, compilerCtx, buildCtx) {
    return {
        timestamp: getBuildTimestamp(),
        compiler: {
            name: config.sys.compiler.name,
            version: config.sys.compiler.version,
            typescriptVersion: config.sys.compiler.typescriptVersion
        },
        components: await getComponents(config, compilerCtx, buildCtx)
    };
}
async function getComponents(config, compilerCtx, buildCtx) {
    const results = await Promise.all(buildCtx.moduleFiles.map(async (moduleFile) => {
        const filePath = moduleFile.sourceFilePath;
        const dirPath = normalizePath(config.sys.path.dirname(filePath));
        const readmePath = normalizePath(config.sys.path.join(dirPath, 'readme.md'));
        const usagesDir = normalizePath(config.sys.path.join(dirPath, 'usage'));
        const readme = await getUserReadmeContent(compilerCtx, readmePath);
        const usage = await generateUsages(config, compilerCtx, usagesDir);
        return moduleFile.cmps
            .filter(cmp => isDocsPublic(cmp.docs) && !cmp.isCollectionDependency)
            .map(cmp => ({
            dirPath,
            filePath: config.sys.path.relative(config.rootDir, filePath),
            fileName: config.sys.path.basename(filePath),
            readmePath,
            usagesDir,
            tag: cmp.tagName,
            readme,
            usage,
            docs: generateDocs(readme, cmp.docs),
            docsTags: cmp.docs.tags,
            encapsulation: getEncapsulation(cmp),
            dependents: cmp.directDependents,
            dependencies: cmp.directDependencies,
            dependencyGraph: buildDepGraph(cmp, buildCtx.components),
            deprecation: getDeprecation(cmp.docs.tags),
            props: getProperties(cmp),
            methods: getMethods(cmp.methods),
            events: getEvents(cmp.events),
            styles: getStyles(cmp),
            slots: getSlots(cmp.docs.tags)
        }));
    }));
    return sortBy(flatOne(results), cmp => cmp.tag);
}
function buildDepGraph(cmp, cmps) {
    const dependencies = {};
    function walk(tagName) {
        if (!dependencies[tagName]) {
            const cmp = cmps.find(c => c.tagName === tagName);
            const deps = cmp.directDependencies;
            if (deps.length > 0) {
                dependencies[tagName] = deps;
                deps.forEach(walk);
            }
        }
    }
    walk(cmp.tagName);
    // load dependents
    cmp.directDependents.forEach(tagName => {
        if (dependencies[tagName] && !dependencies[tagName].includes(tagName)) {
            dependencies[tagName].push(cmp.tagName);
        }
        else {
            dependencies[tagName] = [cmp.tagName];
        }
    });
    return dependencies;
}
function getEncapsulation(cmp) {
    if (cmp.encapsulation === 'shadow') {
        return 'shadow';
    }
    else if (cmp.encapsulation === 'scoped') {
        return 'scoped';
    }
    else {
        return 'none';
    }
}
function getProperties(cmpMeta) {
    return sortBy([
        ...getRealProperties(cmpMeta.properties),
        ...getVirtualProperties(cmpMeta.virtualProperties)
    ], p => p.name);
}
function getRealProperties(properties) {
    return properties.filter(member => isDocsPublic(member.docs))
        .map(member => ({
        name: member.name,
        type: member.complexType.resolved,
        mutable: member.mutable,
        attr: member.attribute,
        reflectToAttr: !!member.reflect,
        docs: member.docs.text,
        docsTags: member.docs.tags,
        default: member.defaultValue,
        deprecation: getDeprecation(member.docs.tags),
        values: parseTypeIntoValues(member.complexType.resolved),
        optional: member.optional,
        required: member.required,
    }));
}
function getVirtualProperties(virtualProps) {
    return virtualProps.map(member => ({
        name: member.name,
        type: member.type,
        mutable: false,
        attr: member.name,
        reflectToAttr: false,
        docs: member.docs,
        docsTags: [],
        default: undefined,
        deprecation: undefined,
        values: parseTypeIntoValues(member.type),
        optional: true,
        required: false,
    }));
}
function parseTypeIntoValues(type) {
    if (typeof type === 'string') {
        const unions = type.split('|').map(u => u.trim());
        const parsedUnions = [];
        unions.forEach(u => {
            if (u === 'true') {
                parsedUnions.push({
                    value: 'true',
                    type: 'boolean'
                });
                return;
            }
            if (u === 'false') {
                parsedUnions.push({
                    value: 'false',
                    type: 'boolean'
                });
                return;
            }
            if (!Number.isNaN(parseFloat(u))) {
                // union is a number
                parsedUnions.push({
                    value: u,
                    type: 'number'
                });
                return;
            }
            if (/^("|').+("|')$/gm.test(u)) {
                // ionic is a string
                parsedUnions.push({
                    value: u.slice(1, -1),
                    type: 'string'
                });
                return;
            }
            parsedUnions.push({
                type: u
            });
        });
        return parsedUnions;
    }
    return [];
}
function getMethods(methods) {
    return sortBy(methods, member => member.name)
        .filter(member => isDocsPublic(member.docs))
        .map(member => ({
        name: member.name,
        returns: {
            type: member.complexType.return,
            docs: member.docs.tags.filter(t => t.name === 'return').join('\n'),
        },
        signature: `${member.name}${member.complexType.signature}`,
        parameters: [],
        docs: member.docs.text,
        docsTags: member.docs.tags,
        deprecation: getDeprecation(member.docs.tags)
    }));
}
function getEvents(events) {
    return sortBy(events, eventMeta => eventMeta.name.toLowerCase())
        .filter(eventMeta => isDocsPublic(eventMeta.docs))
        .map(eventMeta => ({
        event: eventMeta.name,
        detail: eventMeta.complexType.resolved,
        bubbles: eventMeta.bubbles,
        cancelable: eventMeta.cancelable,
        composed: eventMeta.composed,
        docs: eventMeta.docs.text,
        docsTags: eventMeta.docs.tags,
        deprecation: getDeprecation(eventMeta.docs.tags)
    }));
}
function getStyles(cmpMeta) {
    if (!cmpMeta.styleDocs) {
        return [];
    }
    return sortBy(cmpMeta.styleDocs, o => o.name.toLowerCase()).map(styleDoc => {
        return {
            name: styleDoc.name,
            annotation: styleDoc.annotation || '',
            docs: styleDoc.docs || ''
        };
    });
}
function getDeprecation(tags) {
    const deprecation = tags.find(t => t.name === 'deprecated');
    if (deprecation) {
        return deprecation.text || '';
    }
    return undefined;
}
function getSlots(tags) {
    return sortBy(getNameText('slot', tags)
        .map(([name, docs]) => ({ name, docs })), a => a.name);
}
function getNameText(name, tags) {
    return tags
        .filter(tag => tag.name === name && tag.text)
        .map(({ text }) => {
        const [namePart, ...rest] = (' ' + text).split(' - ');
        return [
            namePart.trim(),
            rest.join(' - ').trim()
        ];
    });
}
async function getUserReadmeContent(compilerCtx, readmePath) {
    try {
        const existingContent = await compilerCtx.fs.readFile(readmePath);
        const userContentIndex = existingContent.indexOf(AUTO_GENERATE_COMMENT) - 1;
        if (userContentIndex >= 0) {
            return existingContent.substring(0, userContentIndex);
        }
    }
    catch (e) { }
    return undefined;
}
function generateDocs(readme, jsdoc) {
    const docs = jsdoc.text;
    if (docs !== '' || !readme) {
        return docs;
    }
    let isContent = false;
    const lines = readme.split('\n');
    const contentLines = [];
    for (const line of lines) {
        const isHeader = line.startsWith('#');
        if (isHeader && isContent) {
            break;
        }
        if (!isHeader && !isContent) {
            isContent = true;
        }
        if (isContent) {
            contentLines.push(line);
        }
    }
    return contentLines.join('\n').trim();
}
async function generateUsages(config, compilerCtx, usagesDir) {
    const rtn = {};
    try {
        const usageFilePaths = await compilerCtx.fs.readdir(usagesDir);
        const usages = {};
        await Promise.all(usageFilePaths.map(async (f) => {
            if (!f.isFile) {
                return;
            }
            const fileName = config.sys.path.basename(f.relPath);
            if (!fileName.toLowerCase().endsWith('.md')) {
                return;
            }
            const parts = fileName.split('.');
            parts.pop();
            const key = parts.join('.');
            usages[key] = await compilerCtx.fs.readFile(f.absPath);
        }));
        Object.keys(usages).sort().forEach(key => {
            rtn[key] = usages[key];
        });
    }
    catch (e) { }
    return rtn;
}

async function generateCustomDocs(config, docsData, outputTargets) {
    const customOutputTargets = outputTargets.filter(isOutputTargetDocsCustom);
    if (customOutputTargets.length === 0) {
        return;
    }
    await Promise.all(customOutputTargets.map(async (customOutput) => {
        try {
            await customOutput.generator(docsData);
        }
        catch (e) {
            config.logger.error(`uncaught custom docs error: ${e}`);
        }
    }));
}

class MarkdownTable {
    constructor() {
        this.rows = [];
    }
    addHeader(data) {
        this.addRow(data, true);
    }
    addRow(data, isHeader = false) {
        const colData = [];
        data.forEach(text => {
            const col = {
                text: escapeMarkdownTableColumn(text),
                width: text.length
            };
            colData.push(col);
        });
        this.rows.push({
            columns: colData,
            isHeader: isHeader
        });
    }
    toMarkdown() {
        return createTable(this.rows);
    }
}
function escapeMarkdownTableColumn(text) {
    text = text.replace(/\r?\n/g, ' ');
    text = text.replace(/\|/g, '\\|');
    return text;
}
function createTable(rows) {
    const content = [];
    if (rows.length === 0) {
        return content;
    }
    normalize(rows);
    const th = rows.find(r => r.isHeader);
    if (th) {
        const headerRow = createRow(th);
        content.push(headerRow);
        content.push(createBorder(th));
    }
    const tds = rows.filter(r => !r.isHeader);
    tds.forEach(td => {
        content.push(createRow(td));
    });
    return content;
}
function createBorder(th) {
    const border = {
        columns: [],
        isHeader: false
    };
    th.columns.forEach(c => {
        const borderCol = {
            text: '',
            width: c.width
        };
        while (borderCol.text.length < borderCol.width) {
            borderCol.text += '-';
        }
        border.columns.push(borderCol);
    });
    return createRow(border);
}
function createRow(row) {
    const content = ['| '];
    row.columns.forEach(c => {
        content.push(c.text);
        content.push(' | ');
    });
    return content.join('').trim();
}
function normalize(rows) {
    normalizeColumCount(rows);
    normalizeColumnWidth(rows);
}
function normalizeColumCount(rows) {
    let columnCount = 0;
    rows.forEach(r => {
        if (r.columns.length > columnCount) {
            columnCount = r.columns.length;
        }
    });
    rows.forEach(r => {
        while (r.columns.length < columnCount) {
            r.columns.push({
                text: ``,
                width: 0
            });
        }
    });
}
function normalizeColumnWidth(rows) {
    const columnCount = rows[0].columns.length;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        let longestText = 0;
        rows.forEach(r => {
            const col = r.columns[columnIndex];
            if (col.text.length > longestText) {
                longestText = col.text.length;
            }
        });
        rows.forEach(r => {
            const col = r.columns[columnIndex];
            col.width = longestText;
            while (col.text.length < longestText) {
                col.text += ' ';
            }
        });
    }
}

function propsToMarkdown(props) {
    const content = [];
    if (props.length === 0) {
        return content;
    }
    content.push(`## Properties`);
    content.push(``);
    const table = new MarkdownTable();
    table.addHeader([
        'Property',
        'Attribute',
        'Description',
        'Type',
        'Default'
    ]);
    props.forEach(prop => {
        table.addRow([
            getPropertyField(prop),
            getAttributeField(prop),
            getDocsField(prop),
            `\`${prop.type}\``,
            `\`${prop.default}\``
        ]);
    });
    content.push(...table.toMarkdown());
    content.push(``);
    content.push(``);
    return content;
}
function getPropertyField(prop) {
    return `\`${prop.name}\`${prop.required ? ' _(required)_' : ''}`;
}
function getAttributeField(prop) {
    return prop.attr ? `\`${prop.attr}\`` : '--';
}
function getDocsField(prop) {
    return `${prop.deprecation !== undefined
        ? `<span style="color:red">**[DEPRECATED]**</span> ${prop.deprecation}<br/><br/>`
        : ''}${prop.docs}`;
}

function eventsToMarkdown(events) {
    const content = [];
    if (events.length === 0) {
        return content;
    }
    content.push(`## Events`);
    content.push(``);
    const table = new MarkdownTable();
    table.addHeader([
        'Event',
        'Description',
        'Type'
    ]);
    events.forEach(ev => {
        table.addRow([
            `\`${ev.event}\``,
            getDocsField$1(ev),
            `\`CustomEvent<${ev.detail}>\``,
        ]);
    });
    content.push(...table.toMarkdown());
    content.push(``);
    content.push(``);
    return content;
}
function getDocsField$1(prop) {
    return `${prop.deprecation !== undefined
        ? `<span style="color:red">**[DEPRECATED]**</span> ${prop.deprecation}<br/><br/>`
        : ''}${prop.docs}`;
}

function methodsToMarkdown(methods) {
    const content = [];
    if (methods.length === 0) {
        return content;
    }
    content.push(`## Methods`);
    content.push(``);
    methods.forEach(method => {
        content.push(`### \`${method.signature}\``);
        content.push(``);
        content.push(getDocsField$2(method));
        content.push(``);
        if (method.parameters.length > 0) {
            const parmsTable = new MarkdownTable();
            parmsTable.addHeader(['Name', 'Type', 'Description']);
            method.parameters.forEach(({ name, type, docs }) => {
                parmsTable.addRow(['`' + name + '`', '`' + type + '`', docs]);
            });
            content.push(`#### Parameters`);
            content.push(``);
            content.push(...parmsTable.toMarkdown());
            content.push(``);
        }
        if (method.returns) {
            content.push(`#### Returns`);
            content.push(``);
            content.push(`Type: \`${method.returns.type}\``);
            content.push(``);
            content.push(method.returns.docs);
            content.push(``);
        }
    });
    content.push(``);
    return content;
}
function getDocsField$2(prop) {
    return `${prop.deprecation !== undefined
        ? `<span style="color:red">**[DEPRECATED]**</span> ${prop.deprecation}<br/><br/>`
        : ''}${prop.docs}`;
}

function usageToMarkdown(usages) {
    const content = [];
    const merged = mergeUsages(usages);
    if (merged.length === 0) {
        return content;
    }
    content.push(`## Usage`);
    merged.forEach(({ name, text }) => {
        content.push('');
        content.push(`### ${toTitleCase(name)}`);
        content.push('');
        content.push(text);
        content.push('');
    }),
        content.push('');
    content.push('');
    return content;
}
function mergeUsages(usages) {
    const keys = Object.keys(usages);
    const map = new Map();
    keys.forEach(key => {
        const usage = usages[key].trim();
        const array = map.get(usage) || [];
        array.push(key);
        map.set(usage, array);
    });
    const merged = [];
    map.forEach((value, key) => {
        merged.push({
            name: value.join(' / '),
            text: key
        });
    });
    return merged;
}

function stylesToMarkdown(styles) {
    const content = [];
    if (styles.length === 0) {
        return content;
    }
    content.push(`## CSS Custom Properties`);
    content.push(``);
    const table = new MarkdownTable();
    table.addHeader(['Name', 'Description']);
    styles.forEach(style => {
        table.addRow([
            `\`${style.name}\``,
            style.docs
        ]);
    });
    content.push(...table.toMarkdown());
    content.push(``);
    content.push(``);
    return content;
}

function slotsToMarkdown(slots) {
    const content = [];
    if (slots.length === 0) {
        return content;
    }
    content.push(`## Slots`);
    content.push(``);
    const table = new MarkdownTable();
    table.addHeader(['Slot', 'Description']);
    slots.forEach(style => {
        table.addRow([
            style.name === '' ? '' : `\`"${style.name}"\``,
            style.docs
        ]);
    });
    content.push(...table.toMarkdown());
    content.push(``);
    content.push(``);
    return content;
}

function depsToMarkdown(config, cmp, cmps) {
    const content = [];
    const deps = Object.entries(cmp.dependencyGraph);
    if (deps.length === 0) {
        return content;
    }
    content.push(`## Dependencies`);
    content.push(``);
    if (cmp.dependents.length > 0) {
        const usedBy = cmp.dependents
            .map(tag => ' - ' + getCmpLink(config, cmp, tag, cmps));
        content.push(`### Used by`);
        content.push(``);
        content.push(...usedBy);
        content.push(``);
    }
    if (cmp.dependencies.length > 0) {
        const dependsOn = cmp.dependencies
            .map(tag => '- ' + getCmpLink(config, cmp, tag, cmps));
        content.push(`### Depends on`);
        content.push(``);
        content.push(...dependsOn);
        content.push(``);
    }
    content.push(`### Graph`);
    content.push('```mermaid');
    content.push('graph TD;');
    deps.forEach(([key, deps]) => {
        deps.forEach(dep => {
            content.push(`  ${key} --> ${dep}`);
        });
    });
    content.push(`  style ${cmp.tag} fill:#f9f,stroke:#333,stroke-width:4px`);
    content.push('```');
    content.push(``);
    return content;
}
function getCmpLink(config, from, to, cmps) {
    const destCmp = cmps.find(c => c.tag === to);
    if (destCmp) {
        const cmpRelPath = normalizePath(config.sys.path.relative(from.dirPath, destCmp.dirPath));
        return `[${to}](${cmpRelPath})`;
    }
    return to;
}

async function generateReadme(config, compilerCtx, readmeOutputs, docsData, cmps) {
    const isUpdate = !!docsData.readme;
    const userContent = isUpdate ? docsData.readme : getDefaultReadme(docsData);
    await Promise.all(readmeOutputs.map(async (readmeOutput) => {
        if (readmeOutput.dir) {
            const readmeContent = generateMarkdown(config, userContent, docsData, cmps, readmeOutput.footer);
            const relPath = config.sys.path.relative(config.srcDir, docsData.readmePath);
            const absPath = config.sys.path.join(readmeOutput.dir, relPath);
            const results = await compilerCtx.fs.writeFile(absPath, readmeContent);
            if (results.changedContent) {
                if (isUpdate) {
                    config.logger.info(`updated readme docs: ${docsData.tag}`);
                }
                else {
                    config.logger.info(`created readme docs: ${docsData.tag}`);
                }
            }
        }
    }));
}
function generateMarkdown(config, userContent, cmp, cmps, footer) {
    return [
        userContent,
        AUTO_GENERATE_COMMENT,
        '',
        '',
        ...getDeprecation$1(cmp),
        ...usageToMarkdown(cmp.usage),
        ...propsToMarkdown(cmp.props),
        ...eventsToMarkdown(cmp.events),
        ...methodsToMarkdown(cmp.methods),
        ...slotsToMarkdown(cmp.slots),
        ...stylesToMarkdown(cmp.styles),
        ...depsToMarkdown(config, cmp, cmps),
        `----------------------------------------------`,
        '',
        footer,
        ''
    ].join('\n');
}
function getDeprecation$1(cmp) {
    if (cmp.deprecation !== undefined) {
        return [
            `> **[DEPRECATED]** ${cmp.deprecation}`,
            ''
        ];
    }
    return [];
}
function getDefaultReadme(docsData) {
    return [
        `# ${docsData.tag}`,
        '',
        '',
        ''
    ].join('\n');
}

async function generateReadmeDocs(config, compilerCtx, docsData, outputTargets) {
    const readmeOutputTargets = outputTargets.filter(isOutputTargetDocsReadme);
    if (readmeOutputTargets.length === 0) {
        return;
    }
    const strictCheck = readmeOutputTargets.some(o => o.strict);
    if (strictCheck) {
        strickCheckDocs(config, docsData);
    }
    await Promise.all(docsData.components.map(cmpData => {
        return generateReadme(config, compilerCtx, readmeOutputTargets, cmpData, docsData.components);
    }));
}
function strickCheckDocs(config, docsData) {
    docsData.components.forEach(component => {
        component.props.forEach(prop => {
            if (!prop.docs && prop.deprecation === undefined) {
                config.logger.warn(`Property "${prop.name}" of "${component.tag}" is not documented. ${component.filePath}`);
            }
        });
        component.methods.forEach(method => {
            if (!method.docs && method.deprecation === undefined) {
                config.logger.warn(`Method "${method.name}" of "${component.tag}" is not documented. ${component.filePath}`);
            }
        });
        component.events.forEach(ev => {
            if (!ev.docs && ev.deprecation === undefined) {
                config.logger.warn(`Event "${ev.event}" of "${component.tag}" is not documented. ${component.filePath}`);
            }
        });
    });
}

async function generateJsonDocs(config, compilerCtx, docsData, outputTargets) {
    const jsonOutputTargets = outputTargets.filter(isOutputTargetDocsJson);
    if (jsonOutputTargets.length === 0) {
        return;
    }
    const docsDtsPath = config.sys.path.join(config.sys.compiler.distDir, 'declarations', 'docs.d.ts');
    const docsDts = await compilerCtx.fs.readFile(docsDtsPath);
    const typesContent = `
/**
 * This is an autogenerated file created by the Stencil compiler.
 * DO NOT MODIFY IT MANUALLY
 */
${docsDts}
declare const _default: JsonDocs;
export default _default;
`;
    const json = Object.assign(Object.assign({}, docsData), { components: docsData.components.map(cmp => ({
            filePath: cmp.filePath,
            encapsulation: cmp.encapsulation,
            tag: cmp.tag,
            readme: cmp.readme,
            docs: cmp.docs,
            docsTags: cmp.docsTags,
            usage: cmp.usage,
            props: cmp.props,
            methods: cmp.methods,
            events: cmp.events,
            styles: cmp.styles,
            slots: cmp.slots,
            dependents: cmp.dependents,
            dependencies: cmp.dependencies,
            dependencyGraph: cmp.dependencyGraph,
            deprecation: cmp.deprecation,
        })) });
    const jsonContent = JSON.stringify(json, null, 2);
    await Promise.all(jsonOutputTargets.map(jsonOutput => {
        return writeDocsOutput(compilerCtx, jsonOutput, jsonContent, typesContent);
    }));
}
async function writeDocsOutput(compilerCtx, jsonOutput, jsonContent, typesContent) {
    return Promise.all([
        compilerCtx.fs.writeFile(jsonOutput.file, jsonContent),
        (jsonOutput.typesFile
            ? compilerCtx.fs.writeFile(jsonOutput.typesFile, typesContent)
            : Promise.resolve())
    ]);
}

async function generateVscodeDocs(compilerCtx, docsData, outputTargets) {
    const vsCodeOutputTargets = outputTargets.filter(isOutputTargetDocsVscode);
    if (vsCodeOutputTargets.length === 0) {
        return;
    }
    await Promise.all(vsCodeOutputTargets.map(async (outputTarget) => {
        const json = {
            'version': 1.1,
            'tags': docsData.components.map(cmp => ({
                'name': cmp.tag,
                'description': {
                    'kind': 'markdown',
                    'value': cmp.docs,
                },
                'attributes': cmp.props.filter(p => p.attr).map(serializeAttribute),
                'references': getReferences(cmp, outputTarget.sourceCodeBaseUrl)
            }))
        };
        const jsonContent = JSON.stringify(json, null, 2);
        await compilerCtx.fs.writeFile(outputTarget.file, jsonContent);
    }));
}
function getReferences(cmp, repoBaseUrl) {
    const references = getNameText('reference', cmp.docsTags)
        .map(([name, url]) => ({ name, url }));
    if (repoBaseUrl) {
        references.push({
            name: 'Source code',
            url: repoBaseUrl + cmp.filePath
        });
    }
    if (references.length > 0) {
        return references;
    }
    return undefined;
}
function serializeAttribute(prop) {
    const attribute = {
        'name': prop.attr,
        'description': prop.docs,
    };
    const values = prop.values
        .filter(({ type, value }) => type === 'string' && value !== undefined)
        .map(({ value }) => ({ name: value }));
    if (values.length > 0) {
        attribute.values = values;
    }
    return attribute;
}

async function outputCustom(config, compilerCtx, buildCtx, docs, outputTargets) {
    const customOutputTargets = outputTargets.filter(isOutputTargetCustom);
    if (customOutputTargets.length === 0) {
        return;
    }
    await Promise.all(customOutputTargets.map(async (o) => {
        const timespan = buildCtx.createTimeSpan(`generating ${o.name} started`);
        try {
            await o.generator(config, compilerCtx, buildCtx, docs);
        }
        catch (e) {
            catchError(buildCtx.diagnostics, e);
        }
        timespan.finish(`generate ${o.name} finished`);
    }));
}

async function outputDocs(config, compilerCtx, buildCtx) {
    if (!config.buildDocs) {
        return;
    }
    const docsOutputTargets = config.outputTargets.filter(o => (isOutputTargetCustom(o) ||
        isOutputTargetDocsReadme(o) ||
        isOutputTargetDocsJson(o) ||
        isOutputTargetDocsCustom(o) ||
        isOutputTargetDocsVscode(o)));
    // ensure all the styles are built first, which parses all the css docs
    await buildCtx.stylesPromise;
    const docsData = await generateDocData(config, compilerCtx, buildCtx);
    await Promise.all([
        generateReadmeDocs(config, compilerCtx, docsData, docsOutputTargets),
        generateJsonDocs(config, compilerCtx, docsData, docsOutputTargets),
        generateVscodeDocs(compilerCtx, docsData, docsOutputTargets),
        generateCustomDocs(config, docsData, docsOutputTargets),
        outputCustom(config, compilerCtx, buildCtx, docsData, docsOutputTargets)
    ]);
}

async function outputAngular(config, compilerCtx, buildCtx) {
    const angularOutputTargets = config.outputTargets.filter(isOutputTargetAngular);
    if (angularOutputTargets.length === 0) {
        return;
    }
    const timespan = buildCtx.createTimeSpan(`generate angular proxies started`, true);
    await Promise.all(angularOutputTargets.map(outputTarget => (angularDirectiveProxyOutput(config, compilerCtx, buildCtx, outputTarget))));
    timespan.finish(`generate angular proxies finished`);
}
function angularDirectiveProxyOutput(config, compilerCtx, buildCtx, outputTarget) {
    const filteredComponents = getFilteredComponents(outputTarget.excludeComponents, buildCtx.components);
    return Promise.all([
        generateProxies(config, compilerCtx, buildCtx, filteredComponents, outputTarget),
        generateAngularArray(config, compilerCtx, filteredComponents, outputTarget),
        generateAngularUtils(compilerCtx, outputTarget)
    ]);
}
function getFilteredComponents(excludeComponents = [], cmps) {
    return sortBy(cmps, cmp => cmp.tagName)
        .filter(c => !excludeComponents.includes(c.tagName) && !c.internal);
}
async function generateProxies(config, compilerCtx, buildCtx, components, outputTarget) {
    const proxies = getProxies(components);
    const pkgData = await readPackageJson(config, compilerCtx, buildCtx);
    const distTypesDir = config.sys.path.dirname(pkgData.types);
    const dtsFilePath = config.sys.path.join(config.rootDir, distTypesDir, GENERATED_DTS$1);
    const componentsTypeFile = relativeImport(config, outputTarget.directivesProxyFile, dtsFilePath, '.d.ts');
    const imports = `/* tslint:disable */
/* auto-generated angular directive proxies */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, NgZone } from '@angular/core';`;
    const sourceImports = !outputTarget.componentCorePackage ?
        `import { Components } from '${componentsTypeFile}';` :
        `import { Components } from '${outputTarget.componentCorePackage}';`;
    const final = [
        imports,
        getProxyUtils(config, outputTarget),
        sourceImports,
        proxies,
    ];
    const finalText = final.join('\n') + '\n';
    return compilerCtx.fs.writeFile(outputTarget.directivesProxyFile, finalText);
}
function getProxies(components) {
    return components
        .map(getProxy)
        .join('\n');
}
function getProxy(cmpMeta) {
    // Collect component meta
    const inputs = getInputs(cmpMeta);
    const outputs = getOutputs(cmpMeta);
    const methods = getMethods$1(cmpMeta);
    // Process meta
    const hasInputs = inputs.length > 0;
    const hasOutputs = outputs.length > 0;
    const hasMethods = methods.length > 0;
    // Generate Angular @Directive
    const directiveOpts = [
        `selector: \'${cmpMeta.tagName}\'`,
        `changeDetection: ChangeDetectionStrategy.OnPush`,
        `template: '<ng-content></ng-content>'`
    ];
    if (inputs.length > 0) {
        directiveOpts.push(`inputs: ['${inputs.join(`', '`)}']`);
    }
    const tagNameAsPascal = dashToPascalCase(cmpMeta.tagName);
    const lines = [`
export declare interface ${tagNameAsPascal} extends Components.${tagNameAsPascal} {}
@Component({ ${directiveOpts.join(', ')} })
export class ${tagNameAsPascal} {`];
    // Generate outputs
    outputs.forEach(output => {
        lines.push(`  ${output}!: EventEmitter<CustomEvent>;`);
    });
    lines.push('  protected el: HTMLElement;');
    lines.push(`  constructor(c: ChangeDetectorRef, r: ElementRef, protected z: NgZone) {
    c.detach();
    this.el = r.nativeElement;`);
    if (hasOutputs) {
        lines.push(`    proxyOutputs(this, this.el, ['${outputs.join(`', '`)}']);`);
    }
    lines.push(`  }`);
    lines.push(`}`);
    if (hasMethods) {
        lines.push(`proxyMethods(${tagNameAsPascal}, ['${methods.join(`', '`)}']);`);
    }
    if (hasInputs) {
        lines.push(`proxyInputs(${tagNameAsPascal}, ['${inputs.join(`', '`)}']);`);
    }
    return lines.join('\n');
}
function getInputs(cmpMeta) {
    return [
        ...cmpMeta.properties.filter(prop => !prop.internal).map(prop => prop.name),
        ...cmpMeta.virtualProperties.map(prop => prop.name)
    ].sort();
}
function getOutputs(cmpMeta) {
    return cmpMeta.events.filter(ev => !ev.internal).map(prop => prop.name);
}
function getMethods$1(cmpMeta) {
    return cmpMeta.methods.filter(method => !method.internal).map(prop => prop.name);
}
function getProxyUtils(config, outputTarget) {
    if (!outputTarget.directivesUtilsFile) {
        return PROXY_UTILS.replace(/export function/g, 'function');
    }
    else {
        const utilsPath = relativeImport(config, outputTarget.directivesProxyFile, outputTarget.directivesUtilsFile, '.ts');
        return `import { proxyInputs, proxyMethods, proxyOutputs } from '${utilsPath}';\n`;
    }
}
function generateAngularArray(config, compilerCtx, components, outputTarget) {
    if (!outputTarget.directivesArrayFile) {
        return Promise.resolve();
    }
    const proxyPath = relativeImport(config, outputTarget.directivesArrayFile, outputTarget.directivesProxyFile, '.ts');
    const directives = components
        .map(cmpMeta => dashToPascalCase(cmpMeta.tagName))
        .map(className => `d.${className}`)
        .join(',\n  ');
    const c = `
import * as d from '${proxyPath}';

export const DIRECTIVES = [
${directives}
];
`;
    return compilerCtx.fs.writeFile(outputTarget.directivesArrayFile, c);
}
async function generateAngularUtils(compilerCtx, outputTarget) {
    if (outputTarget.directivesUtilsFile) {
        await compilerCtx.fs.writeFile(outputTarget.directivesUtilsFile, '/* tslint:disable */\n' + PROXY_UTILS);
    }
}
const PROXY_UTILS = `import { fromEvent } from 'rxjs';

export const proxyInputs = (Cmp: any, inputs: string[]) => {
  const Prototype = Cmp.prototype;
  inputs.forEach(item => {
    Object.defineProperty(Prototype, item, {
      get() { return this.el[item]; },
      set(val: any) {
        this.z.runOutsideAngular(() => this.el[item] = val);
      },
    });
  });
};

export const proxyMethods = (Cmp: any, methods: string[]) => {
  const Prototype = Cmp.prototype;
  methods.forEach(methodName => {
    Prototype[methodName] = function() {
      const args = arguments;
      return this.z.runOutsideAngular(() => this.el[methodName].apply(this.el, args));
    };
  });
};

export const proxyOutputs = (instance: any, el: any, events: string[]) => {
  events.forEach(eventName => instance[eventName] = fromEvent(el, eventName));
};
`;
const GENERATED_DTS$1 = 'components.d.ts';

async function generateOutputTargets(config, compilerCtx, buildCtx) {
    if (canSkipOutputTargets(buildCtx)) {
        return;
    }
    await Promise.all([
        outputCollections(config, compilerCtx, buildCtx),
        outputModulesApp(config, compilerCtx, buildCtx),
        outputHydrate(config, compilerCtx, buildCtx),
        outputDocs(config, compilerCtx, buildCtx),
        outputAngular(config, compilerCtx, buildCtx),
        outputLazyLoader(config, compilerCtx),
        buildCtx.stylesPromise
    ]);
    // must run after all the other outputs
    // since it validates files were created
    await outputTypes(config, compilerCtx, buildCtx);
}
async function outputModulesApp(config, compilerCtx, buildCtx) {
    await outputModule(config, compilerCtx, buildCtx);
    await outputApp(config, compilerCtx, buildCtx);
    await outputWww(config, compilerCtx, buildCtx);
}

async function getComponentStylesCache(config, compilerCtx, buildCtx, cmp, styleMeta, commentOriginalSelector) {
    const cacheKey = getComponentStylesCacheKey(cmp, styleMeta.modeName);
    const cachedStyleMeta = compilerCtx.cachedStyleMeta.get(cacheKey);
    if (!cachedStyleMeta) {
        // don't have the cache to begin with, so can't continue
        return null;
    }
    if (isChangedTsFile(cmp.sourceFilePath, buildCtx) && hasDecoratorStyleChanges(compilerCtx, cmp, cacheKey)) {
        // this module is one of the changed ts files
        // and the changed ts file has different
        // styleUrls or styleStr in the component decorator
        return null;
    }
    if (!buildCtx.hasStyleChanges) {
        // doesn't look like there was any style changes to begin with
        // just return our cached data
        return cachedStyleMeta;
    }
    if (isChangedStyleEntryFile(buildCtx, styleMeta)) {
        // one of the files that's this components style url was one that changed
        return null;
    }
    const hasChangedImport = await isChangedStyleEntryImport(config, compilerCtx, buildCtx, styleMeta);
    if (hasChangedImport) {
        // one of the files that's imported by the style url changed
        return null;
    }
    if (commentOriginalSelector && typeof cachedStyleMeta.compiledStyleTextScopedCommented !== 'string') {
        return null;
    }
    // woot! let's use the cached data we already compiled
    return cachedStyleMeta;
}
function isChangedTsFile(sourceFilePath, buildCtx) {
    return (buildCtx.filesChanged.includes(sourceFilePath));
}
function hasDecoratorStyleChanges(compilerCtx, cmp, cacheKey) {
    const lastStyleInput = compilerCtx.lastComponentStyleInput.get(cacheKey);
    if (!lastStyleInput) {
        return true;
    }
    return (lastStyleInput !== getComponentStyleInputKey(cmp));
}
function isChangedStyleEntryFile(buildCtx, styleMeta) {
    if (!styleMeta.externalStyles) {
        return false;
    }
    return (buildCtx.filesChanged.some(f => {
        return styleMeta.externalStyles.some(s => s.absolutePath === f);
    }));
}
async function isChangedStyleEntryImport(config, compilerCtx, buildCtx, styleMeta) {
    if (!styleMeta.externalStyles) {
        return false;
    }
    const checkedFiles = [];
    const promises = styleMeta.externalStyles.map(externalStyle => {
        return hasChangedImportFile(config, compilerCtx, buildCtx, externalStyle.absolutePath, checkedFiles);
    });
    const results = await Promise.all(promises);
    return results.includes(true);
}
async function hasChangedImportFile(config, compilerCtx, buildCtx, filePath, checkedFiles) {
    if (checkedFiles.includes(filePath)) {
        // already checked
        return false;
    }
    checkedFiles.push(filePath);
    let rtn = false;
    try {
        const content = await compilerCtx.fs.readFile(filePath);
        rtn = await hasChangedImportContent(config, compilerCtx, buildCtx, filePath, content, checkedFiles);
    }
    catch (e) { }
    return rtn;
}
async function hasChangedImportContent(config, compilerCtx, buildCtx, filePath, content, checkedFiles) {
    const cssImports = getCssImports$1(config, buildCtx, filePath, content);
    if (cssImports.length === 0) {
        // don't bother
        return false;
    }
    const isChangedImport = buildCtx.filesChanged.some(changedFilePath => {
        return cssImports.some(c => c.filePath === changedFilePath || c.altFilePath === changedFilePath);
    });
    if (isChangedImport) {
        // one of the changed files is an import of this file
        return true;
    }
    // keep diggin'
    const promises = cssImports.map(async (cssImportData) => {
        let hasChanged = await hasChangedImportFile(config, compilerCtx, buildCtx, cssImportData.filePath, checkedFiles);
        if (!hasChanged && typeof cssImportData.altFilePath === 'string') {
            hasChanged = await hasChangedImportFile(config, compilerCtx, buildCtx, cssImportData.altFilePath, checkedFiles);
        }
        return hasChanged;
    });
    const results = await Promise.all(promises);
    return results.includes(true);
}
function getComponentStyleInputKey(cmp) {
    const input = [];
    if (Array.isArray(cmp.styles)) {
        cmp.styles.forEach(styleMeta => {
            input.push(styleMeta.modeName);
            if (typeof styleMeta.styleStr === 'string') {
                input.push(styleMeta.styleStr);
            }
            if (styleMeta.externalStyles) {
                styleMeta.externalStyles.forEach(s => {
                    input.push(s.absolutePath);
                });
            }
        });
    }
    return input.join(',');
}
function setComponentStylesCache(compilerCtx, cmp, styleMeta) {
    const cacheKey = getComponentStylesCacheKey(cmp, styleMeta.modeName);
    compilerCtx.cachedStyleMeta.set(cacheKey, styleMeta);
    const styleInput = getComponentStyleInputKey(cmp);
    compilerCtx.lastComponentStyleInput.set(cacheKey, styleInput);
}
function getComponentStylesCacheKey(cmp, modeName) {
    return `${cmp.sourceFilePath}#${cmp.tagName}#${modeName}`;
}
async function updateLastStyleComponetInputs(config, compilerCtx, buildCtx) {
    if (config.watch) {
        const promises = [];
        compilerCtx.moduleMap.forEach(m => {
            if (Array.isArray(m.cmps)) {
                promises.push(...m.cmps.map(async (cmp) => {
                    const cacheKey = cmp.tagName;
                    const currentInputHash = await getComponentDecoratorStyleHash(config, cmp);
                    if (cmp.styles == null || cmp.styles.length === 0) {
                        compilerCtx.styleModeNames.forEach(modeName => {
                            const lastInputHash = compilerCtx.lastComponentStyleInput.get(cacheKey);
                            if (lastInputHash !== currentInputHash) {
                                buildCtx.stylesUpdated.push({
                                    styleTag: cmp.tagName,
                                    styleText: '',
                                    styleMode: modeName
                                });
                                const cacheKey = getComponentStylesCacheKey(cmp, modeName);
                                compilerCtx.cachedStyleMeta.delete(cacheKey);
                                const styleId = getStyleId(cmp, modeName, false);
                                compilerCtx.lastBuildStyles.delete(styleId);
                            }
                        });
                    }
                    compilerCtx.lastComponentStyleInput.set(cacheKey, currentInputHash);
                }));
            }
        });
        await Promise.all(promises);
    }
}
function getComponentDecoratorStyleHash(config, cmp) {
    return config.sys.generateContentHash(getComponentStyleInputKey(cmp), 8);
}

async function optimizeCss(config, compilerCtx, diagnostics, styleText, filePath, legacyBuild) {
    if (typeof styleText !== 'string' || !styleText.length) {
        //  don't bother with invalid data
        return styleText;
    }
    if ((config.autoprefixCss === false || config.autoprefixCss === null) && !config.minifyCss) {
        // don't wanna autoprefix or minify, so just skip this
        return styleText;
    }
    if (typeof filePath === 'string') {
        filePath = normalizePath(filePath);
    }
    const opts = {
        css: styleText,
        filePath: filePath,
        autoprefixer: config.autoprefixCss,
        minify: config.minifyCss,
        legecyBuild: legacyBuild
    };
    const cacheKey = await compilerCtx.cache.createKey('optimizeCss', COMPILER_BUILD.optimizeCss, opts);
    const cachedContent = await compilerCtx.cache.get(cacheKey);
    if (cachedContent != null) {
        // let's use the cached data we already figured out
        return cachedContent;
    }
    const minifyResults = await config.sys.optimizeCss(opts);
    minifyResults.diagnostics.forEach(d => {
        // collect up any diagnostics from minifying
        diagnostics.push(d);
    });
    if (typeof minifyResults.css === 'string' && !hasError(diagnostics)) {
        // cool, we got valid minified output
        // only cache if we got a cache key, if not it probably has an @import
        await compilerCtx.cache.put(cacheKey, minifyResults.css);
        return minifyResults.css;
    }
    return styleText;
}

function generateComponentStyles(config, compilerCtx, buildCtx) {
    const commentOriginalSelector = config.outputTargets.some(isOutputTargetHydrate);
    return Promise.all(buildCtx.components.map(cmp => {
        return Promise.all(cmp.styles.map(style => {
            return generateComponentStylesMode(config, compilerCtx, buildCtx, cmp, style, style.modeName, commentOriginalSelector);
        }));
    }));
}
async function generateComponentStylesMode(config, compilerCtx, buildCtx, cmp, styleMeta, modeName, commentOriginalSelector) {
    if (buildCtx.isRebuild) {
        const cachedCompiledStyles = await getComponentStylesCache(config, compilerCtx, buildCtx, cmp, styleMeta, commentOriginalSelector);
        if (cachedCompiledStyles) {
            styleMeta.compiledStyleText = cachedCompiledStyles.compiledStyleText;
            styleMeta.compiledStyleTextScoped = cachedCompiledStyles.compiledStyleTextScoped;
            styleMeta.compiledStyleTextScopedCommented = cachedCompiledStyles.compiledStyleTextScopedCommented;
            return;
        }
    }
    // compile each mode style
    const compiledStyles = await compileStyles(config, compilerCtx, buildCtx, cmp, styleMeta);
    // format and set the styles for use later
    const compiledStyleMeta = await setStyleText(config, compilerCtx, buildCtx, cmp, modeName, styleMeta.externalStyles, compiledStyles, commentOriginalSelector);
    styleMeta.compiledStyleText = compiledStyleMeta.styleText;
    styleMeta.compiledStyleTextScoped = compiledStyleMeta.styleTextScoped;
    styleMeta.compiledStyleTextScopedCommented = compiledStyleMeta.styleTextScopedCommented;
    if (config.watch) {
        // since this is a watch and we'll be checking this again
        // let's cache what we've learned today
        setComponentStylesCache(compilerCtx, cmp, styleMeta);
    }
}
async function compileStyles(config, compilerCtx, buildCtx, cmp, styleMeta) {
    // get all the absolute paths for each style
    const extStylePaths = styleMeta.externalStyles.map(extStyle => extStyle.absolutePath);
    if (typeof styleMeta.styleStr === 'string') {
        // plain styles just in a string
        // let's put these file in an in-memory file
        const inlineAbsPath = cmp.jsFilePath + '.css';
        extStylePaths.push(inlineAbsPath);
        await compilerCtx.fs.writeFile(inlineAbsPath, styleMeta.styleStr, { inMemoryOnly: true });
    }
    // build an array of style strings
    const compiledStyles = await Promise.all(extStylePaths.map(extStylePath => {
        return compileExternalStyle(config, compilerCtx, buildCtx, cmp, extStylePath);
    }));
    return compiledStyles;
}
async function compileExternalStyle(config, compilerCtx, buildCtx, cmp, extStylePath) {
    extStylePath = normalizePath(extStylePath);
    // see if we can used a cached style first
    let styleText;
    if (cmp.isCollectionDependency) {
        // if it's a collection dependency and it's a preprocessor file like sass
        // AND we have the correct plugin then let's compile it
        const hasPlugin = hasPluginInstalled(config, extStylePath);
        if (!hasPlugin) {
            // the collection has this style as a preprocessor file, like sass
            // however the user doesn't have this plugin installed, which is file
            // instead of using the preprocessor file (sass) use the vanilla css file
            const parts = extStylePath.split('.');
            parts[parts.length - 1] = 'css';
            extStylePath = parts.join('.');
        }
    }
    else {
        // not a collection dependency
        // check known extensions just for a helpful message
        checkPluginHelpers(config, buildCtx, extStylePath);
    }
    try {
        const transformResults = await runPluginTransforms(config, compilerCtx, buildCtx, extStylePath, cmp);
        if (!cmp.isCollectionDependency) {
            const collectionDirs = config.outputTargets.filter(o => o.collectionDir);
            const relPath = config.sys.path.relative(config.srcDir, transformResults.id);
            await Promise.all(collectionDirs.map(async (outputTarget) => {
                const collectionPath = config.sys.path.join(outputTarget.collectionDir, relPath);
                await compilerCtx.fs.writeFile(collectionPath, transformResults.code);
            }));
        }
        styleText = transformResults.code;
        buildCtx.styleBuildCount++;
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            const d = buildError(buildCtx.diagnostics);
            const relExtStyle = config.sys.path.relative(config.cwd, extStylePath);
            const relSrc = config.sys.path.relative(config.cwd, cmp.sourceFilePath);
            d.messageText = `Unable to load style ${relExtStyle} from ${relSrc}`;
        }
        else {
            catchError(buildCtx.diagnostics, e);
        }
        styleText = '';
    }
    return styleText;
}
function checkPluginHelpers(config, buildCtx, externalStylePath) {
    PLUGIN_HELPERS.forEach(p => {
        checkPluginHelper(config, buildCtx, externalStylePath, p.pluginExts, p.pluginId, p.pluginName);
    });
}
function checkPluginHelper(config, buildCtx, externalStylePath, pluginExts, pluginId, pluginName) {
    if (!hasFileExtension(externalStylePath, pluginExts)) {
        return;
    }
    if (config.plugins.some(p => p.name === pluginId)) {
        return;
    }
    const errorKey = 'styleError' + pluginId;
    if (buildCtx.data[errorKey]) {
        // already added this key
        return;
    }
    buildCtx.data[errorKey] = true;
    const relPath = config.sys.path.relative(config.rootDir, externalStylePath);
    const msg = [
        `Style "${relPath}" is a ${pluginName} file, however the "${pluginId}" `,
        `plugin has not been installed. Please install the "@stencil/${pluginId}" `,
        `plugin and add it to "config.plugins" within the project's stencil config `,
        `file. For more info please see: https://www.npmjs.com/package/@stencil/${pluginId}`
    ].join('');
    const d = buildError(buildCtx.diagnostics);
    d.header = 'style error';
    d.messageText = msg;
}
function hasPluginInstalled(config, filePath) {
    // TODO: don't hard these
    const plugin = PLUGIN_HELPERS.find(p => hasFileExtension(filePath, p.pluginExts));
    if (plugin) {
        return config.plugins.some(p => p.name === plugin.pluginId);
    }
    return false;
}
async function setStyleText(config, compilerCtx, buildCtx, cmp, modeName, externalStyles, compiledStyles, commentOriginalSelector) {
    // join all the component's styles for this mode together into one line
    const compiledStyle = {
        styleText: compiledStyles.join('\n\n').trim(),
        styleTextScoped: null,
        styleTextScopedCommented: null
    };
    let filePath = null;
    const externalStyle = externalStyles && externalStyles.length && externalStyles[0];
    if (externalStyle && externalStyle.absolutePath) {
        filePath = externalStyle.absolutePath;
    }
    // auto add css prefixes and minifies when configured
    compiledStyle.styleText = await optimizeCss(config, compilerCtx, buildCtx.diagnostics, compiledStyle.styleText, filePath, true);
    if (requiresScopedStyles(cmp.encapsulation, commentOriginalSelector)) {
        // only create scoped styles if we need to
        compiledStyle.styleTextScoped = await scopeComponentCss(config, buildCtx, cmp, modeName, compiledStyle.styleText, false);
        if (cmp.encapsulation === 'scoped') {
            compiledStyle.styleText = compiledStyle.styleTextScoped;
        }
        if (commentOriginalSelector && cmp.encapsulation === 'shadow') {
            compiledStyle.styleTextScopedCommented = await scopeComponentCss(config, buildCtx, cmp, modeName, compiledStyle.styleText, true);
        }
    }
    // by default the compiledTextScoped === compiledStyleText
    if (!compiledStyle.styleTextScoped) {
        compiledStyle.styleTextScoped = compiledStyle.styleText;
    }
    let addStylesUpdate = false;
    // test to see if the last styles are different
    const styleId = getStyleId(cmp, modeName, false);
    if (compilerCtx.lastBuildStyles.get(styleId) !== compiledStyle.styleText) {
        compilerCtx.lastBuildStyles.set(styleId, compiledStyle.styleText);
        if (buildCtx.isRebuild) {
            addStylesUpdate = true;
        }
    }
    const scopedStyleId = getStyleId(cmp, modeName, true);
    if (compilerCtx.lastBuildStyles.get(scopedStyleId) !== compiledStyle.styleTextScoped) {
        compilerCtx.lastBuildStyles.set(scopedStyleId, compiledStyle.styleTextScoped);
    }
    const styleMode = (modeName === DEFAULT_STYLE_MODE ? null : modeName);
    if (addStylesUpdate) {
        buildCtx.stylesUpdated = buildCtx.stylesUpdated || [];
        buildCtx.stylesUpdated.push({
            styleTag: cmp.tagName,
            styleMode: styleMode,
            styleText: compiledStyle.styleText,
        });
    }
    compiledStyle.styleText = escapeCssForJs(compiledStyle.styleText);
    compiledStyle.styleTextScoped = escapeCssForJs(compiledStyle.styleTextScoped);
    compiledStyle.styleTextScopedCommented = escapeCssForJs(compiledStyle.styleTextScopedCommented);
    return compiledStyle;
}

async function generateGlobalStyles(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetDistGlobalStyles);
    if (outputTargets.length === 0) {
        return;
    }
    const globalStyles = await buildGlobalStyles(config, compilerCtx, buildCtx);
    if (!globalStyles) {
        return;
    }
    await Promise.all(outputTargets.map(o => compilerCtx.fs.writeFile(o.file, globalStyles)));
}
async function buildGlobalStyles(config, compilerCtx, buildCtx) {
    let globalStylePath = config.globalStyle;
    if (!globalStylePath) {
        return null;
    }
    const canSkip = await canSkipGlobalStyles(config, compilerCtx, buildCtx);
    if (canSkip) {
        return compilerCtx.cachedGlobalStyle;
    }
    try {
        globalStylePath = normalizePath(globalStylePath);
        const transformResults = await runPluginTransforms(config, compilerCtx, buildCtx, globalStylePath);
        return compilerCtx.cachedGlobalStyle = await optimizeCss(config, compilerCtx, buildCtx.diagnostics, transformResults.code, globalStylePath, true);
    }
    catch (e) {
        const d = buildError(buildCtx.diagnostics);
        d.messageText = e + '';
        d.absFilePath = globalStylePath;
        return compilerCtx.cachedGlobalStyle = null;
    }
}
async function canSkipGlobalStyles(config, compilerCtx, buildCtx) {
    if (!compilerCtx.cachedGlobalStyle) {
        return false;
    }
    if (buildCtx.requiresFullBuild) {
        return false;
    }
    if (buildCtx.isRebuild && !buildCtx.hasStyleChanges) {
        return true;
    }
    if (buildCtx.filesChanged.includes(config.globalStyle)) {
        // changed file IS the global entry style
        return false;
    }
    const hasChangedImports = await hasChangedImportFile$1(config, compilerCtx, buildCtx, config.globalStyle, []);
    if (hasChangedImports) {
        return false;
    }
    return true;
}
async function hasChangedImportFile$1(config, compilerCtx, buildCtx, filePath, noLoop) {
    if (noLoop.includes(filePath)) {
        return false;
    }
    noLoop.push(filePath);
    let rtn = false;
    try {
        const content = await compilerCtx.fs.readFile(filePath);
        rtn = await hasChangedImportContent$1(config, compilerCtx, buildCtx, filePath, content, noLoop);
    }
    catch (e) { }
    return rtn;
}
async function hasChangedImportContent$1(config, compilerCtx, buildCtx, filePath, content, checkedFiles) {
    const cssImports = getCssImports$1(config, buildCtx, filePath, content);
    if (cssImports.length === 0) {
        // don't bother
        return false;
    }
    const isChangedImport = buildCtx.filesChanged.some(changedFilePath => {
        return cssImports.some(c => c.filePath === changedFilePath);
    });
    if (isChangedImport) {
        // one of the changed files is an import of this file
        return true;
    }
    // keep diggin'
    const promises = cssImports.map(cssImportData => {
        return hasChangedImportFile$1(config, compilerCtx, buildCtx, cssImportData.filePath, checkedFiles);
    });
    const results = await Promise.all(promises);
    return results.includes(true);
}

async function generateStyles(config, compilerCtx, buildCtx) {
    if (canSkipGenerateStyles(buildCtx)) {
        return;
    }
    const timeSpan = buildCtx.createTimeSpan(`generate styles started`);
    await Promise.all([
        generateGlobalStyles(config, compilerCtx, buildCtx),
        generateComponentStyles(config, compilerCtx, buildCtx),
    ]);
    await updateLastStyleComponetInputs(config, compilerCtx, buildCtx);
    timeSpan.finish(`generate styles finished`);
}
function canSkipGenerateStyles(buildCtx) {
    if (buildCtx.components.length === 0) {
        return true;
    }
    if (buildCtx.requiresFullBuild) {
        return false;
    }
    if (buildCtx.isRebuild) {
        if (buildCtx.hasStyleChanges) {
            // this is a rebuild and there are style changes
            return false;
        }
        if (buildCtx.hasScriptChanges) {
            // this is a rebuild and there are script changes
            // changes to scripts are important too because it could be
            // a change to the style url or style text in the component decorator
            return false;
        }
        // cool! There were no changes to any style files
        // and there were no changes to any scripts that
        // contain components with styles! SKIP
        // ♪┏(・o･)┛♪┗ ( ･o･) ┓♪
        return true;
    }
    return false;
}

async function initIndexHtmls(config, compilerCtx, buildCtx) {
    // The initial loading page connects with the stencil's devServer
    // If we are building without server, it does not make sense to write the
    // initial index.html
    if (config.flags.serve) {
        await Promise.all(config.outputTargets.map(async (outputTarget) => {
            await initIndexHtml(config, compilerCtx, buildCtx, outputTarget);
        }));
    }
}
async function initIndexHtml(config, compilerCtx, buildCtx, outputTarget) {
    // if there isn't an index.html yet
    // let's generate a slim one quick so that
    // on the first build the user sees a loading indicator
    // this is synchronous on purpose so that it's saved
    // before the dev server fires up and loads the index.html page
    if (isOutputTargetWww(outputTarget)) {
        // only worry about this when generating www directory
        // check if there's even a src index.html file
        const hasSrcIndexHtml = await compilerCtx.fs.access(config.srcIndexHtml);
        if (!hasSrcIndexHtml) {
            // there is no src index.html file in the config, which is fine
            // since there is no src index file at all, don't bother
            // this isn't actually an error, don't worry about it
            return;
        }
        if (compilerCtx.hasSuccessfulBuild) {
            // we've already had a successful build, we're good
            // always recopy index.html (it's all cached if it didn't actually change, all good)
            const srcIndexHtmlContent = await compilerCtx.fs.readFile(config.srcIndexHtml);
            await compilerCtx.fs.writeFile(outputTarget.indexHtml, srcIndexHtmlContent);
            return;
        }
        try {
            // ok, so we haven't written an index.html build file yet
            // and we do know they have a src one, so let's write a
            // filler index.html file that shows while the first build is happening
            await compilerCtx.fs.writeFile(outputTarget.indexHtml, APP_LOADING_HTML);
            await compilerCtx.fs.commit();
        }
        catch (e) {
            catchError(buildCtx.diagnostics, e);
        }
    }
}
const APP_LOADING_HTML = `
<!DOCTYPE html>
<html dir="ltr" lang="en" data-init="app-dev-first-build-loader">
<head>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function(registration) {
        registration.unregister();
      });
    }
  </script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="x-ua-compatible" content="IE=Edge">
  <title>Initializing First Build...</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      position: absolute;
      padding: 0;
      margin: 0;
      width: 100%;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    }
    .toast {
      position: absolute;
      top: 10px;
      right: 10px;
      left: 10px;
      margin: auto;
      max-width: 700px;
      border-radius: 3px;
      background: rgba(0,0,0,.9);
      -webkit-transform: translate3d(0px, -60px, 0px);
      transform: translate3d(0px, -60px, 0px);
      -webkit-transition: -webkit-transform 75ms ease-out;
      transition: transform 75ms ease-out;
      pointer-events: none;
    }

    .active {
      -webkit-transform: translate3d(0px, 0px, 0px);
      transform: translate3d(0px, 0px, 0px);
    }

    .content {
      display: flex;
      -webkit-align-items: center;
      -ms-flex-align: center;
      align-items: center;
      pointer-events: auto;
    }

    .message {
      -webkit-flex: 1;
      -ms-flex: 1;
      flex: 1;
      padding: 15px;
      font-size: 14px;
      color: #fff;
    }

    .spinner {
      position: relative;
      display: inline-block;
      width: 56px;
      height: 28px;
    }

    svg:not(:root) {
      overflow: hidden;
    }

    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
      -webkit-animation: rotate 600ms linear infinite;
      animation: rotate 600ms linear infinite;
    }

    @-webkit-keyframes rotate {
      0% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
      }
      100% {
        -webkit-transform: rotate(360deg);
        transform: rotate(360deg);
      }
    }

    @keyframes rotate {
      0% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
      }
      100% {
        -webkit-transform: rotate(360deg);
        transform: rotate(360deg);
      }
    }

    svg circle {
      fill: transparent;
      stroke: white;
      stroke-width: 4px;
      stroke-dasharray: 128px;
      stroke-dashoffset: 82px;
    }
  </style>
</head>
<body>

  <div class="toast">
    <div class="content">
      <div class="message">Initializing First Build...</div>
      <div class="spinner">
        <svg viewBox="0 0 64 64"><circle transform="translate(32,32)" r="26"></circle></svg>
      </div>
    </div>
  </div>

  <script>
    setTimeout(function() {
      document.querySelector('.toast').classList.add('active');
    }, 100);

    var tmrId = setInterval(function() {
      try {
        var url = window.location.pathname + '?r=' + Date.now();
        var xhr = new XMLHttpRequest();
        xhr.addEventListener('load', function() {
          try {
            if (this.status < 300) {
              if (this.responseText.indexOf('app-dev-first-build-loader') === -1) {
                window.location.reload(true);
              }
            } else if (window.location.pathname !== '/') {
              url = '/?r=' + Date.now();

            } else if (this.status > 299) {
              clearInterval(tmrId);
            }

          } catch (e) {
            console.error(e);
          }
        });
        xhr.open('GET', url);
        xhr.send();
      } catch (e) {
        console.error(e);
      }
    }, 1000);
  </script>

</body>
</html>
`;

function getComponentAssetsCopyTasks(config, buildCtx, dest, collectionsPath) {
    if (!dest) {
        return [];
    }
    // get a list of all the directories to copy
    // these paths should be absolute
    const copyTasks = [];
    const cmps = buildCtx.components;
    cmps
        .filter(cmp => cmp.assetsDirs != null && cmp.assetsDirs.length > 0)
        .forEach(cmp => {
        if (!collectionsPath) {
            cmp.assetsDirs.forEach(assetsMeta => {
                copyTasks.push({
                    src: assetsMeta.absolutePath,
                    dest: config.sys.path.join(dest, assetsMeta.cmpRelativePath),
                    warn: false,
                    keepDirStructure: false,
                });
            });
        }
        else if (!cmp.excludeFromCollection && !cmp.isCollectionDependency) {
            cmp.assetsDirs.forEach(assetsMeta => {
                const collectionDirDestination = config.sys.path.join(dest, config.sys.path.relative(config.srcDir, assetsMeta.absolutePath));
                copyTasks.push({
                    src: assetsMeta.absolutePath,
                    dest: collectionDirDestination,
                    warn: false,
                    keepDirStructure: false,
                });
            });
        }
    });
    buildCtx.debug(`getComponentAssetsCopyTasks: ${copyTasks.length}`);
    return copyTasks;
}
function canSkipAssetsCopy(config, compilerCtx, entryModules, filesChanged) {
    if (!compilerCtx.hasSuccessfulBuild) {
        // always copy assets if we haven't had a successful build yet
        // cannot skip build
        return false;
    }
    // assume we want to skip copying assets again
    let shouldSkipAssetsCopy = true;
    // loop through each of the changed files
    filesChanged.forEach(changedFile => {
        // get the directory of where the changed file is in
        const changedFileDirPath = normalizePath(config.sys.path.dirname(changedFile));
        // loop through all the possible asset directories
        entryModules.forEach(entryModule => {
            entryModule.cmps.forEach(cmp => {
                if (cmp.assetsDirs != null) {
                    // loop through each of the asset directories of each component
                    cmp.assetsDirs.forEach(assetsDir => {
                        // get the absolute of the asset directory
                        const assetDirPath = normalizePath(assetsDir.absolutePath);
                        // if the changed file directory is this asset directory
                        // then we should recopy everything over again
                        if (changedFileDirPath === assetDirPath) {
                            shouldSkipAssetsCopy = false;
                            return;
                        }
                    });
                }
            });
        });
    });
    return shouldSkipAssetsCopy;
}

function getSrcAbsPath(config, src) {
    if (config.sys.path.isAbsolute(src)) {
        return src;
    }
    return config.sys.path.join(config.srcDir, src);
}
function getDestAbsPath(config, src, destAbsPath, destRelPath) {
    if (destRelPath) {
        if (config.sys.path.isAbsolute(destRelPath)) {
            return destRelPath;
        }
        else {
            return config.sys.path.join(destAbsPath, destRelPath);
        }
    }
    if (config.sys.path.isAbsolute(src)) {
        throw new Error(`copy task, "dest" property must exist if "src" property is an absolute path: ${src}`);
    }
    return destAbsPath;
}

async function outputCopy(config, compilerCtx, buildCtx) {
    const outputTargets = config.outputTargets.filter(isOutputTargetCopy);
    if (outputTargets.length === 0) {
        return;
    }
    const changedFiles = [
        ...buildCtx.filesUpdated,
        ...buildCtx.filesAdded,
        ...buildCtx.dirsAdded
    ];
    const copyTasks = [];
    const needsCopyAssets = !canSkipAssetsCopy(config, compilerCtx, buildCtx.entryModules, buildCtx.filesChanged);
    outputTargets.forEach(o => {
        if (needsCopyAssets && o.copyAssets) {
            copyTasks.push(...getComponentAssetsCopyTasks(config, buildCtx, o.dir, o.copyAssets === 'collection'));
        }
        copyTasks.push(...getCopyTasks(config, buildCtx, o, changedFiles));
    });
    if (copyTasks.length > 0) {
        const timespan = buildCtx.createTimeSpan(`copy started`);
        let copiedFiles = 0;
        try {
            const copyResults = await config.sys.copy(copyTasks, config.srcDir);
            if (copyResults != null) {
                buildCtx.diagnostics.push(...copyResults.diagnostics);
                compilerCtx.fs.cancelDeleteDirectoriesFromDisk(copyResults.dirPaths);
                compilerCtx.fs.cancelDeleteFilesFromDisk(copyResults.filePaths);
                copiedFiles = copyResults.filePaths.length;
            }
        }
        catch (e) {
            const err = buildError(buildCtx.diagnostics);
            err.messageText = e.message;
        }
        timespan.finish(`copy finished (${copiedFiles} file${copiedFiles === 1 ? '' : 's'})`);
    }
}
function getCopyTasks(config, buildCtx, o, changedFiles) {
    if (!Array.isArray(o.copy)) {
        return [];
    }
    const copyTasks = (!buildCtx.isRebuild || buildCtx.requiresFullBuild)
        ? o.copy
        : filterCopyTasks(config, o.copy, changedFiles);
    return copyTasks.map(t => transformToAbs(config, t, o.dir));
}
function filterCopyTasks(config, tasks, changedFiles) {
    if (Array.isArray(tasks)) {
        return tasks.filter(copy => {
            let copySrc = copy.src;
            if (isGlob(copySrc)) {
                // test the glob
                copySrc = config.sys.path.join(config.srcDir, copySrc);
                if (changedFiles.some(minimatch_1.filter(copySrc))) {
                    return true;
                }
            }
            else {
                copySrc = normalizePath(getSrcAbsPath(config, copySrc + '/'));
                if (changedFiles.some(f => f.startsWith(copySrc))) {
                    return true;
                }
            }
            return false;
        });
    }
    return [];
}
function transformToAbs(config, copyTask, dest) {
    return {
        src: copyTask.src,
        dest: getDestAbsPath(config, copyTask.src, dest, copyTask.dest),
        keepDirStructure: typeof copyTask.keepDirStructure === 'boolean' ? copyTask.keepDirStructure : copyTask.dest == null,
        warn: copyTask.warn !== false
    };
}

function resolveComponentDependencies(cmps) {
    computeDependencies(cmps);
    computeDependents(cmps);
}
function computeDependencies(cmps) {
    const visited = new Set();
    cmps.forEach(cmp => {
        resolveTransitiveDependencies(cmp, cmps, visited);
        cmp.dependencies = unique(cmp.dependencies).sort();
    });
}
function computeDependents(cmps) {
    cmps.forEach(cmp => {
        resolveTransitiveDependents(cmp, cmps);
    });
}
function resolveTransitiveDependencies(cmp, cmps, visited) {
    if (visited.has(cmp)) {
        return cmp.dependencies;
    }
    visited.add(cmp);
    const dependencies = cmp.potentialCmpRefs.filter(tagName => cmps.some(c => c.tagName === tagName));
    cmp.dependencies = cmp.directDependencies = dependencies;
    const transitiveDeps = flatOne(dependencies
        .map(tagName => cmps.find(c => c.tagName === tagName))
        .map(c => resolveTransitiveDependencies(c, cmps, visited)));
    return cmp.dependencies = [
        ...dependencies,
        ...transitiveDeps
    ];
}
function resolveTransitiveDependents(cmp, cmps) {
    cmp.dependents = cmps
        .filter(c => c.dependencies.includes(cmp.tagName))
        .map(c => c.tagName)
        .sort();
    cmp.directDependents = cmps
        .filter(c => c.directDependencies.includes(cmp.tagName))
        .map(c => c.tagName)
        .sort();
}

async function getUserCompilerOptions(config, compilerCtx, buildCtx) {
    if (compilerCtx.compilerOptions != null) {
        return compilerCtx.compilerOptions;
    }
    let compilerOptions = Object.assign({}, DEFAULT_COMPILER_OPTIONS);
    if (typeof config.tsconfig === 'string') {
        try {
            const tsconfigFilePath = normalizePath(config.tsconfig);
            const tsconfigResults = ts$1__default.readConfigFile(tsconfigFilePath, ts$1__default.sys.readFile);
            if (tsconfigResults.error != null) {
                if (!config._isTesting) {
                    buildCtx.diagnostics.push(loadTypeScriptDiagnostic(tsconfigResults.error));
                }
            }
            else {
                const configBasePath = config.sys.path.dirname(config.configPath);
                const parseResult = ts$1__default.convertCompilerOptionsFromJson(tsconfigResults.config.compilerOptions, configBasePath);
                if (parseResult.errors && parseResult.errors.length > 0) {
                    buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(parseResult.errors));
                }
                else {
                    compilerOptions = Object.assign(Object.assign({}, compilerOptions), parseResult.options);
                }
            }
        }
        catch (e) {
            config.logger.debug(`getUserCompilerOptions: ${e}`);
        }
    }
    if (config._isTesting) {
        compilerOptions.module = ts$1__default.ModuleKind.CommonJS;
    }
    // apply user config to tsconfig
    compilerOptions.rootDir = config.srcDir;
    // during the transpile we'll write the output
    // to the correct location(s)
    compilerOptions.outDir = undefined;
    // generate .d.ts files when generating a distribution and in prod mode
    const typesOutputTarget = config.outputTargets.find(isOutputTargetDistTypes);
    if (typesOutputTarget) {
        compilerOptions.declaration = true;
        compilerOptions.declarationDir = typesOutputTarget.typesDir;
    }
    else {
        compilerOptions.declaration = false;
    }
    if ((compilerOptions.module !== DEFAULT_COMPILER_OPTIONS.module && compilerOptions.module !== ts$1__default.ModuleKind.ESNext) && !config._isTesting) {
        config.logger.warn(`To improve bundling, it is always recommended to set the tsconfig.json “module” setting to “esnext”. Note that the compiler will automatically handle bundling both modern and legacy builds.`);
    }
    if (compilerOptions.target !== DEFAULT_COMPILER_OPTIONS.target) {
        config.logger.warn(`To improve bundling, it is always recommended to set the tsconfig.json “target” setting to "es2017". Note that the compiler will automatically handle transpilation for ES5-only browsers.`);
    }
    if (compilerOptions.esModuleInterop !== true) {
        config.logger.warn(`To improve module interoperability, it is highly recommend to set the tsconfig.json "esModuleInterop" setting to "true". This update allows star imports written as: import * as foo from "foo", to instead be written with the familiar default syntax of: import foo from "foo". For more info, please see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html`);
    }
    if (compilerOptions.allowSyntheticDefaultImports !== true) {
        config.logger.warn(`To standardize default imports, it is recommend to set the tsconfig.json "allowSyntheticDefaultImports" setting to "true".`);
    }
    validateCompilerOptions(compilerOptions);
    compilerCtx.compilerOptions = compilerOptions;
    return compilerOptions;
}
function validateCompilerOptions(compilerOptions) {
    if (compilerOptions.allowJs && compilerOptions.declaration) {
        compilerOptions.allowJs = false;
    }
    // triple stamp a double stamp we've got the required settings
    compilerOptions.jsx = DEFAULT_COMPILER_OPTIONS.jsx;
    compilerOptions.jsxFactory = DEFAULT_COMPILER_OPTIONS.jsxFactory;
    compilerOptions.experimentalDecorators = DEFAULT_COMPILER_OPTIONS.experimentalDecorators;
    compilerOptions.noEmitOnError = DEFAULT_COMPILER_OPTIONS.noEmit;
    compilerOptions.suppressOutputPathCheck = DEFAULT_COMPILER_OPTIONS.suppressOutputPathCheck;
    compilerOptions.moduleResolution = DEFAULT_COMPILER_OPTIONS.moduleResolution;
    compilerOptions.module = DEFAULT_COMPILER_OPTIONS.module;
    compilerOptions.target = DEFAULT_COMPILER_OPTIONS.target;
}
const DEFAULT_COMPILER_OPTIONS = {
    // to allow jsx to work
    jsx: ts$1__default.JsxEmit.React,
    // the factory function to use
    jsxFactory: 'h',
    // transpileModule does not write anything to disk so there is no need
    // to verify that there are no conflicts between input and output paths.
    suppressOutputPathCheck: true,
    lib: [
        'lib.dom.d.ts',
        'lib.es5.d.ts',
        'lib.es2015.d.ts',
        'lib.es2016.d.ts',
        'lib.es2017.d.ts'
    ],
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    // must always allow decorators
    experimentalDecorators: true,
    // transpile down to es2017
    target: getScriptTarget(),
    // create esNext modules
    module: ts$1__default.ModuleKind.ESNext,
    // resolve using NodeJs style
    moduleResolution: ts$1__default.ModuleResolutionKind.NodeJs,
    // ensure that we do emit something
    noEmitOnError: false
};

const transpileService = async (config, compilerCtx, buildCtx) => {
    let changedTsFiles;
    if (shouldScanForTsChanges(compilerCtx, buildCtx)) {
        // either we haven't figured out all the root ts files yet
        // or we already know we need to do a full rebuild
        // or new files were added or deleted
        // so let's scan the entire src directory looking for ts files to transpile
        // rootTsFiles always used as a way to know the active modules being used
        // basically so our cache knows which stuff we can forget about
        compilerCtx.rootTsFiles = await scanDirForTsFiles(config, compilerCtx, buildCtx);
        changedTsFiles = compilerCtx.rootTsFiles.slice();
    }
    else {
        changedTsFiles = buildCtx.filesChanged.filter(filePath => {
            // do transpiling if one of the changed files is a ts file
            // and the changed file is not the components.d.ts file
            // when the components.d.ts file is written to disk it shouldn't cause a new build
            return isFileIncludePath(config, filePath);
        });
    }
    if (compilerCtx.tsService == null) {
        // create the typescript language service
        compilerCtx.tsService = await buildTsService(config, compilerCtx, buildCtx);
    }
    const doTranspile = (changedTsFiles.length > 0);
    if (doTranspile) {
        // we've found ts files we need to tranpsile
        // or at least one ts file has changed
        const timeSpan = buildCtx.createTimeSpan(`transpile started`);
        // only use the file system cache when it's enabled and this is the first build
        const useFsCache = config.enableCache && !buildCtx.isRebuild;
        // go ahead and kick off the ts service
        const changedContent = await compilerCtx.tsService(compilerCtx, buildCtx, changedTsFiles, true, useFsCache);
        timeSpan.finish(`transpile finished`);
        return changedContent;
    }
    return false;
};
const buildTsService = async (config, compilerCtx, buildCtx) => {
    const transpileCtx = {
        compilerCtx: compilerCtx,
        buildCtx: buildCtx,
        configKey: null,
        snapshotVersions: new Map(),
        filesFromFsCache: [],
        hasQueuedTsServicePrime: false
    };
    const userCompilerOptions = await getUserCompilerOptions(config, transpileCtx.compilerCtx, transpileCtx.buildCtx);
    const compilerOptions = Object.assign({}, userCompilerOptions);
    compilerOptions.isolatedModules = false;
    compilerOptions.suppressOutputPathCheck = true;
    compilerOptions.allowNonTsExtensions = true;
    compilerOptions.removeComments = false;
    compilerOptions.sourceMap = false;
    compilerOptions.lib = undefined;
    compilerOptions.types = undefined;
    compilerOptions.noEmit = undefined;
    compilerOptions.noEmitOnError = undefined;
    compilerOptions.rootDirs = undefined;
    compilerOptions.declaration = undefined;
    compilerOptions.declarationDir = undefined;
    compilerOptions.out = undefined;
    compilerOptions.outFile = undefined;
    compilerOptions.outDir = undefined;
    // create a config key that will be used as part of the file's cache key
    transpileCtx.configKey = await createConfigKey(config, compilerOptions);
    const servicesHost = {
        getScriptFileNames: () => transpileCtx.compilerCtx.rootTsFiles,
        getScriptVersion: (filePath) => transpileCtx.snapshotVersions.get(filePath),
        getScriptSnapshot: (filePath) => {
            try {
                const sourceText = transpileCtx.compilerCtx.fs.readFileSync(filePath);
                return ts$1__default.ScriptSnapshot.fromString(sourceText);
            }
            catch (e) { }
            return undefined;
        },
        getCurrentDirectory: () => config.cwd,
        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: (options) => ts$1__default.getDefaultLibFilePath(options),
        fileExists: (filePath) => transpileCtx.compilerCtx.fs.accessSync(filePath),
        readFile: (filePath) => {
            try {
                return transpileCtx.compilerCtx.fs.readFileSync(filePath);
            }
            catch (e) { }
            return undefined;
        },
        readDirectory: ts$1__default.sys.readDirectory,
        getCustomTransformers: () => {
            const typeChecker = services.getProgram().getTypeChecker();
            const transformOpts = {
                coreImportPath: '@stencil/core',
                componentExport: null,
                componentMetadata: null,
                proxy: null,
                style: 'static'
            };
            return {
                before: [
                    convertDecoratorsToStatic(config, transpileCtx.buildCtx.diagnostics, typeChecker),
                    updateStencilCoreImports(transformOpts.coreImportPath)
                ],
                after: [
                    convertStaticToMeta(config, transpileCtx.compilerCtx, transpileCtx.buildCtx, typeChecker, null, transformOpts)
                ]
            };
        }
    };
    // create our typescript language service to be reused
    const services = ts$1__default.createLanguageService(servicesHost, ts$1__default.createDocumentRegistry());
    // return the function we'll continually use on each rebuild
    return async (compilerCtx, buildCtx, tsFilePaths, checkCacheKey, useFsCache) => {
        transpileCtx.compilerCtx = compilerCtx;
        transpileCtx.buildCtx = buildCtx;
        // ensure components.d.ts isn't in the transpile (for now)
        const cmpDts = getComponentsDtsSrcFilePath(config);
        tsFilePaths = tsFilePaths.filter(tsFilePath => tsFilePath !== cmpDts);
        // loop through each ts file that has changed
        const changedContent = await Promise.all(tsFilePaths.map(tsFilePath => {
            return transpileTsFile(config, services, transpileCtx, tsFilePath, checkCacheKey, useFsCache);
        }));
        if (config.watch && !transpileCtx.hasQueuedTsServicePrime) {
            // prime the ts service cache for all the ts files pulled from the file system cache
            transpileCtx.hasQueuedTsServicePrime = true;
            primeTsServiceCache(transpileCtx);
        }
        return changedContent.some(Boolean);
    };
};
const transpileTsFile = async (config, services, ctx, sourceFilePath, checkCacheKey, useFsCache) => {
    if (ctx.buildCtx.hasError) {
        ctx.buildCtx.debug(`tranpsileTsFile aborted: ${sourceFilePath}`);
        return false;
    }
    const hasWarning = ctx.buildCtx.hasWarning && !config._isTesting;
    // look up the old cache key using the ts file path
    const oldCacheKey = ctx.snapshotVersions.get(sourceFilePath);
    // read the file content to be transpiled
    const content = await ctx.compilerCtx.fs.readFile(sourceFilePath);
    // create a cache key out of the content and compiler options
    const contentHash = await config.sys.generateContentHash(content + sourceFilePath + ctx.configKey, 32);
    const cacheKey = `transpileService_${contentHash}`;
    if (oldCacheKey === cacheKey && checkCacheKey && !hasWarning) {
        // file is unchanged, thanks typescript caching!
        return false;
    }
    // save the cache key for future lookups
    ctx.snapshotVersions.set(sourceFilePath, cacheKey);
    let ensureExternalImports = null;
    if (useFsCache && !hasWarning) {
        // let's check to see if we've already cached this in our filesystem
        // but only bother for the very first build
        const cachedStr = await ctx.compilerCtx.cache.get(cacheKey);
        if (cachedStr != null) {
            // remember which files we were able to get from cached versions
            // so we can later fully prime the ts service cache
            ctx.filesFromFsCache.push(sourceFilePath);
            // whoa cool, we found we already cached this in our filesystem
            const cachedModuleFile = JSON.parse(cachedStr);
            // and there you go, thanks fs cache!
            // put the cached module file data in our context
            ctx.compilerCtx.moduleMap.set(sourceFilePath, cachedModuleFile.moduleFile);
            // add any collections to the context which this cached file may know about
            cachedModuleFile.moduleFile.externalImports.forEach(moduleId => {
                addExternalImport(config, ctx.compilerCtx, ctx.buildCtx, cachedModuleFile.moduleFile, config.rootDir, moduleId);
            });
            // write the cached js output too
            await outputFile(ctx, cachedModuleFile.moduleFile.jsFilePath, cachedModuleFile.jsText);
            return true;
        }
    }
    else {
        // purposely not using the fs cache
        // this is probably when we want to prime the
        // in-memory ts cache after the first build has completed
        const existingModuleFile = ctx.compilerCtx.moduleMap.get(sourceFilePath);
        if (existingModuleFile && Array.isArray(existingModuleFile.externalImports)) {
            ensureExternalImports = existingModuleFile.externalImports.slice();
        }
    }
    // let's do this!
    const output = services.getEmitOutput(sourceFilePath);
    // keep track of how many files we transpiled (great for debugging/testing)
    ctx.buildCtx.transpileBuildCount++;
    if (output.emitSkipped) {
        // oh no! we've got some typescript diagnostics for this file!
        const tsDiagnostics = services.getCompilerOptionsDiagnostics()
            .concat(services.getSyntacticDiagnostics(sourceFilePath));
        ctx.buildCtx.diagnostics.push(...loadTypeScriptDiagnostics(tsDiagnostics));
        return false;
    }
    const changedContent = await Promise.all(output.outputFiles.map(async (tsOutput) => {
        const outputFilePath = normalizePath(tsOutput.name);
        if (ctx.buildCtx.hasError) {
            ctx.buildCtx.debug(`transpileTsFile write aborted: ${sourceFilePath}`);
            return false;
        }
        if (outputFilePath.endsWith('.js')) {
            // this is the JS output of the typescript file transpiling
            const moduleFile = getModule(config, ctx.compilerCtx, sourceFilePath);
            if (Array.isArray(ensureExternalImports)) {
                ensureExternalImports.forEach(moduleId => {
                    addExternalImport(config, ctx.compilerCtx, ctx.buildCtx, moduleFile, config.rootDir, moduleId);
                });
            }
            if (config.enableCache && !hasWarning) {
                // cache this module file and js text for later
                const cacheModuleFile = {
                    moduleFile: moduleFile,
                    jsText: tsOutput.text
                };
                // let's turn our data into a string to be cached for later fs lookups
                const cachedStr = JSON.stringify(cacheModuleFile);
                await ctx.compilerCtx.cache.put(cacheKey, cachedStr);
            }
        }
        // write the text to our in-memory fs and output targets
        return outputFile(ctx, outputFilePath, tsOutput.text);
    }));
    return changedContent.some(Boolean);
};
const outputFile = async (ctx, outputFilePath, outputText) => {
    // the in-memory .js version is be virtually next to the source ts file
    // but it never actually gets written to disk, just there in spirit
    const { changedContent } = await ctx.compilerCtx.fs.writeFile(outputFilePath, outputText, { inMemoryOnly: true });
    return changedContent;
};
const shouldScanForTsChanges = (compilerCtx, buildCtx) => {
    if (!compilerCtx.rootTsFiles) {
        return true;
    }
    if (buildCtx.requiresFullBuild) {
        return true;
    }
    if (buildCtx.filesAdded.length > 0 || buildCtx.filesDeleted.length > 0) {
        return true;
    }
    if (buildCtx.dirsAdded.length > 0 || buildCtx.dirsDeleted.length > 0) {
        return true;
    }
    return false;
};
const scanDirForTsFiles = async (config, compilerCtx, buildCtx) => {
    const scanDirTimeSpan = buildCtx.createTimeSpan(`scan ${config.srcDir} started`, true);
    // loop through this directory and sub directories looking for
    // files that need to be transpiled
    const dirItems = await compilerCtx.fs.readdir(config.srcDir, { recursive: true });
    // filter down to only the ts files we should include
    const tsFileItems = dirItems.filter(item => {
        return item.isFile && isFileIncludePath(config, item.absPath);
    });
    const componentsDtsSrcFilePath = getComponentsDtsSrcFilePath(config);
    // return just the abs path
    // make sure it doesn't include components.d.ts
    const tsFilePaths = tsFileItems
        .map(tsFileItem => tsFileItem.absPath)
        .filter(tsFileAbsPath => tsFileAbsPath !== componentsDtsSrcFilePath);
    scanDirTimeSpan.finish(`scan for ts files finished: ${tsFilePaths.length}`);
    if (tsFilePaths.length === 0) {
        config.logger.warn(`No components found within: ${config.srcDir}`);
    }
    return tsFilePaths;
};
const primeTsServiceCache = (transpileCtx) => {
    if (transpileCtx.filesFromFsCache.length === 0) {
        return;
    }
    // if this is a watch build and we have files that were pulled directly from the cache
    // let's go through and run the ts service on these files again again so
    // that the ts service cache is all updated and ready to go. But this can
    // happen after the first build since so far we're good to go w/ the fs cache
    const unsubscribe = transpileCtx.compilerCtx.events.subscribe('buildFinish', () => {
        unsubscribe();
        if (transpileCtx.buildCtx.hasError) {
            return;
        }
        // we can wait a bit and let things cool down on the main thread first
        setTimeout(async () => {
            if (transpileCtx.buildCtx.hasError) {
                return;
            }
            const timeSpan = transpileCtx.buildCtx.createTimeSpan(`prime ts service cache started, ${transpileCtx.filesFromFsCache.length} file(s)`, true);
            // loop through each file system cached ts files and run the transpile again
            // so that we get the ts service's cache all up to speed
            await transpileCtx.compilerCtx.tsService(transpileCtx.compilerCtx, transpileCtx.buildCtx, transpileCtx.filesFromFsCache, false, false);
            timeSpan.finish(`prime ts service cache finished`);
        }, PRIME_TS_CACHE_TIMEOUT);
    });
};
// how long we should wait after the first build
// to go ahead and prime the in-memory TS cache
const PRIME_TS_CACHE_TIMEOUT = 1000;
const isFileIncludePath = (config, readPath) => {
    // filter e2e tests
    if (readPath.includes('.e2e.') || readPath.includes('/e2e.')) {
        // keep this test if it's an e2e file and we should be testing e2e
        return false;
    }
    // filter spec tests
    if (readPath.includes('.spec.') || readPath.includes('/spec.')) {
        return false;
    }
    if (!/\.(ts|tsx|js|mjs|jsx)$/.test(readPath)) {
        return false;
    }
    for (var i = 0; i < config.excludeSrc.length; i++) {
        if (minimatch_1(readPath, config.excludeSrc[i])) {
            // this file is a file we want to exclude
            return false;
        }
    }
    for (i = 0; i < config.includeSrc.length; i++) {
        if (minimatch_1(readPath, config.includeSrc[i])) {
            // this file is a file we want to include
            return true;
        }
    }
    // not a file we want to include, let's not add it
    return false;
};
const createConfigKey = (config, compilerOptions) => {
    // create a unique config key with stuff that "might" matter for typescript builds
    // not using the entire config object
    // since not everything is a primitive and could have circular references
    return config.sys.generateContentHash(JSON.stringify([
        config.devMode,
        config.minifyCss,
        config.minifyJs,
        config.buildEs5,
        config.rootDir,
        config.srcDir,
        config.autoprefixCss,
        config.preamble,
        config.namespace,
        config.hashedFileNameLength,
        config.hashFileNames,
        config.outputTargets,
        config.enableCache,
        config.buildAppCore,
        config.excludeSrc,
        config.includeSrc,
        compilerOptions,
        COMPILER_BUILD.id
    ]), 32);
};

const validateTypesMain = async (config, compilerCtx, buildCtx) => {
    if (config.validateTypes === false) {
        // probably unit testing that doesn't
        // want to take time to validate the types
        return;
    }
    if (buildCtx.hasError) {
        buildCtx.debug(`validateTypesMain aborted`);
        return;
    }
    // send data over to our worker process to validate types
    // don't let this block the main thread and we'll check
    // its response sometime later
    const timeSpan = buildCtx.createTimeSpan(`type checking started`);
    const componentsDtsSrcFilePath = getComponentsDtsSrcFilePath(config);
    const rootTsFiles = compilerCtx.rootTsFiles.slice();
    // ensure components.d.ts IS in the type validation transpile
    if (!rootTsFiles.includes(componentsDtsSrcFilePath)) {
        rootTsFiles.push(componentsDtsSrcFilePath);
    }
    const collectionNames = compilerCtx.collections.map(c => c.collectionName);
    buildCtx.validateTypesHandler = async (results) => {
        timeSpan.finish(`type checking finished`);
        compilerCtx.fs.cancelDeleteDirectoriesFromDisk(results.dirPaths);
        compilerCtx.fs.cancelDeleteFilesFromDisk(results.filePaths);
        if (results.diagnostics.length === 0) {
            // ┏(-_-)┛ ┗(-_-)┓ ┗(-_-)┛ ┏(-_-)┓
            // app successful validated
            // and types written to disk if it's a dist build
            // null it out so we know there's nothing to wait on
            buildCtx.validateTypesHandler = null;
            buildCtx.validateTypesPromise = null;
            return;
        }
        if (buildCtx.hasFinished) {
            // the build has already finished before the
            // type checking transpile finished, which is fine for watch
            // we'll need to create build to show the diagnostics
            buildCtx.debug(`validateTypesHandler, build already finished, creating a new build`);
            const diagnosticsBuildCtx = new BuildContext(config, compilerCtx);
            diagnosticsBuildCtx.start();
            diagnosticsBuildCtx.diagnostics.push(...results.diagnostics);
            buildFinish(diagnosticsBuildCtx);
        }
        else {
            // cool the build hasn't finished yet
            // so let's add the diagnostics to the build now
            // so that the current build will print these
            buildCtx.diagnostics.push(...results.diagnostics);
            // null out so we don't try this again
            buildCtx.validateTypesHandler = null;
            buildCtx.validateTypesPromise = null;
            await buildFinish(buildCtx);
        }
    };
    // get the typescript compiler options
    const compilerOptions = await getUserCompilerOptions(config, compilerCtx, buildCtx);
    // only write dts files when we have an output target with a types directory
    const emitDtsFiles = config.outputTargets.some(isOutputTargetDistTypes);
    // kick off validating types by sending the data over to the worker process
    buildCtx.validateTypesPromise = config.sys.validateTypes(compilerOptions, emitDtsFiles, collectionNames, rootTsFiles, config.devMode);
    // when the validate types build finishes
    // let's run the handler we put on the build context
    buildCtx.validateTypesPromise.then(buildCtx.validateTypesHandler.bind(buildCtx));
};

async function transpileApp(config, compilerCtx, buildCtx) {
    try {
        const doTranspile = await transpileService(config, compilerCtx, buildCtx);
        await processMetadata(config, compilerCtx, buildCtx, doTranspile);
        return doTranspile;
    }
    catch (e) {
        // gah!!
        catchError(buildCtx.diagnostics, e);
    }
    return false;
}
async function processMetadata(config, compilerCtx, buildCtx, doTranspile) {
    if (buildCtx.hasError) {
        buildCtx.debug(`processMetadata aborted`);
        return;
    }
    // let's clean up the module file cache so we only
    // hold on to stuff we know is being used
    cleanModuleFileCache(compilerCtx);
    buildCtx.moduleFiles = Array.from(compilerCtx.moduleMap.values());
    buildCtx.components = getComponentsFromModules(buildCtx.moduleFiles);
    updateComponentBuildConditionals(compilerCtx.moduleMap, buildCtx.components);
    resolveComponentDependencies(buildCtx.components);
    if (doTranspile && !buildCtx.hasError) {
        // ts changes have happened!!
        // create the components.d.ts file and write to disk
        await generateAppTypes(config, compilerCtx, buildCtx, 'src');
        if (!config._isTesting) {
            // now that we've updated the components.d.ts file
            // lets do a full typescript build (but in another thread)
            validateTypesMain(config, compilerCtx, buildCtx).catch(err => {
                catchError(buildCtx.diagnostics, err);
            });
        }
    }
}
function cleanModuleFileCache(compilerCtx) {
    // let's clean up the module file cache so we only
    // hold on to stuff we know is being used
    const foundSourcePaths = new Set();
    compilerCtx.rootTsFiles.forEach(rootTsFile => {
        const moduleFile = compilerCtx.moduleMap.get(rootTsFile);
        addSourcePaths(compilerCtx, moduleFile, foundSourcePaths);
    });
    compilerCtx.moduleMap.forEach(moduleFile => {
        const sourcePath = moduleFile.sourceFilePath;
        if (sourcePath.endsWith('.d.ts') || sourcePath.endsWith('.js')) {
            // don't bother cleaning up for .d.ts and .js modules files
            return;
        }
        if (!foundSourcePaths.has(sourcePath)) {
            // this source path is a typescript file
            // but we never found it again, so let's forget it
            compilerCtx.moduleMap.delete(sourcePath);
        }
    });
}
function addSourcePaths(compilerCtx, moduleFile, foundSourcePaths) {
    if (moduleFile && !foundSourcePaths.has(moduleFile.sourceFilePath)) {
        foundSourcePaths.add(moduleFile.sourceFilePath);
        moduleFile.localImports.forEach(localImport => {
            const moduleFile = compilerCtx.moduleMap.get(localImport);
            if (moduleFile) {
                addSourcePaths(compilerCtx, moduleFile, foundSourcePaths);
            }
        });
    }
}

function crawlAnchorsForNextUrls(prerenderConfig, diagnostics, baseUrl, currentUrl, parsedAnchors) {
    if (!Array.isArray(parsedAnchors) || parsedAnchors.length === 0) {
        return [];
    }
    const basePathParts = baseUrl.pathname.split('/');
    // filterAnchor(): filter which anchors to actually crawl
    // normalizeUrl(): normalize href strings into URL objects
    // filterUrl(): filter which urls to actually crawl
    // normalizeHref(): normalize URL objects into href strings
    return parsedAnchors
        .filter(anchor => {
        // filter which anchors to actually crawl
        if (typeof prerenderConfig.filterAnchor === 'function') {
            // user filterAnchor()
            try {
                const userFilterAnchor = prerenderConfig.filterAnchor(anchor, currentUrl);
                if (userFilterAnchor === false) {
                    return false;
                }
            }
            catch (e) {
                // user filterAnchor() error
                catchError(diagnostics, e);
                return false;
            }
        }
        // standard filterAnchor()
        return standardFilterAnchor(diagnostics, anchor);
    })
        .map(anchor => {
        // normalize href strings into URL objects
        if (typeof prerenderConfig.normalizeUrl === 'function') {
            try {
                // user normalizeUrl()
                const userNormalizedUrl = prerenderConfig.normalizeUrl(anchor.href, currentUrl);
                // standard normalizeUrl(), after user normalized
                return standardNormalizeUrl(diagnostics, userNormalizedUrl.href, currentUrl);
            }
            catch (e) {
                // user normalizeUrl() error
                catchError(diagnostics, e);
            }
        }
        // standard normalizeUrl(), no user normalized
        return standardNormalizeUrl(diagnostics, anchor.href, currentUrl);
    })
        .filter(url => {
        // filter which urls to actually crawl
        if (typeof prerenderConfig.filterUrl === 'function') {
            // user filterUrl()
            try {
                const userFilterUrl = prerenderConfig.filterUrl(url, currentUrl);
                if (userFilterUrl === false) {
                    return false;
                }
            }
            catch (e) {
                // user filterUrl() error
                catchError(diagnostics, e);
                return false;
            }
        }
        // standard filterUrl()
        return standardFilterUrl(diagnostics, url, currentUrl, basePathParts);
    })
        .map(url => {
        // standard normalize href
        // normalize URL objects into href strings
        return standardNormalizeHref(prerenderConfig, diagnostics, url);
    })
        .reduce((hrefs, href) => {
        // remove any duplicate hrefs from the array
        if (!hrefs.includes(href)) {
            hrefs.push(href);
        }
        return hrefs;
    }, [])
        .sort((a, b) => {
        // sort the hrefs so the urls with the least amount
        // of directories are first, then by alphabetical
        const partsA = a.split('/').length;
        const partsB = b.split('/').length;
        if (partsA < partsB)
            return -1;
        if (partsA > partsB)
            return 1;
        if (a < b)
            return -1;
        if (a > b)
            return 1;
        return 0;
    });
}
function standardFilterAnchor(diagnostics, attrs, _base) {
    try {
        let href = attrs.href;
        if (typeof attrs.download === 'string') {
            return false;
        }
        if (typeof href === 'string') {
            href = href.trim();
            if (href !== '' && !href.startsWith('#') && !href.startsWith('?')) {
                const target = attrs.target;
                if (typeof target === 'string' && attrs.target.trim().toLowerCase() !== '_self') {
                    return false;
                }
                return true;
            }
        }
    }
    catch (e) {
        catchError(diagnostics, e);
    }
    return false;
}
function standardNormalizeUrl(diagnostics, href, currentUrl) {
    if (typeof href === 'string') {
        try {
            const outputUrl = new URL(href, currentUrl.href);
            outputUrl.protocol = currentUrl.href;
            outputUrl.hash = '';
            outputUrl.search = '';
            const parts = outputUrl.pathname.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart === 'index.html' || lastPart === 'index.htm') {
                parts.pop();
                outputUrl.pathname = parts.join('/');
            }
            return outputUrl;
        }
        catch (e) {
            catchError(diagnostics, e);
        }
    }
    return null;
}
function standardFilterUrl(diagnostics, url, currentUrl, basePathParts) {
    try {
        if (url.hostname != null && currentUrl.hostname != null && url.hostname !== currentUrl.hostname) {
            return false;
        }
        if (shouldSkipExtension(url.pathname)) {
            return false;
        }
        const inputPathParts = url.pathname.split('/');
        if (inputPathParts.length < basePathParts.length) {
            return false;
        }
        for (let i = 0; i < basePathParts.length; i++) {
            const basePathPart = basePathParts[i];
            const inputPathPart = inputPathParts[i];
            if (basePathParts.length - 1 === i && basePathPart === '') {
                break;
            }
            if (basePathPart !== inputPathPart) {
                return false;
            }
        }
        return true;
    }
    catch (e) {
        catchError(diagnostics, e);
    }
    return false;
}
function standardNormalizeHref(prerenderConfig, diagnostics, url) {
    try {
        if (url != null && typeof url.href === 'string') {
            let href = url.href.trim();
            if (prerenderConfig.trailingSlash) {
                // url should have a trailing slash
                if (!href.endsWith('/')) {
                    const parts = url.pathname.split('/');
                    const lastPart = parts[parts.length - 1];
                    if (!lastPart.includes('.')) {
                        // does not end with a slash and last part does not have a dot
                        href += '/';
                    }
                }
            }
            else {
                // url should NOT have a trailing slash
                if (href.endsWith('/') && url.pathname !== '/') {
                    // this has a trailing slash and it's not the root path
                    href = href.substr(0, href.length - 1);
                }
            }
            return href;
        }
    }
    catch (e) {
        catchError(diagnostics, e);
    }
    return null;
}
function shouldSkipExtension(filename) {
    return SKIP_EXT.has(extname(filename).toLowerCase());
}
function extname(str) {
    const parts = str.split('.');
    return parts[parts.length - 1].toLowerCase();
}
const SKIP_EXT = new Set([
    'zip',
    'rar',
    'tar',
    'gz',
    'bz2',
    'png',
    'jpeg',
    'jpg',
    'gif',
    'pdf',
    'tiff',
    'psd',
]);

function getWriteFilePathFromUrlPath(manager, inputHref) {
    const baseUrl = new URL_(manager.outputTarget.baseUrl, manager.devServerHostUrl);
    const basePathname = baseUrl.pathname.toLowerCase();
    const inputUrl = new URL_(inputHref, manager.devServerHostUrl);
    const inputPathname = inputUrl.pathname.toLowerCase();
    const basePathParts = basePathname.split('/');
    const inputPathParts = inputPathname.split('/');
    const isPrerrenderRoot = (basePathname === inputPathname);
    let fileName;
    if (isPrerrenderRoot) {
        fileName = manager.config.sys.path.basename(manager.outputTarget.indexHtml);
    }
    else {
        fileName = 'index.html';
    }
    const pathParts = [];
    for (let i = 0; i < inputPathParts.length; i++) {
        const basePathPart = basePathParts[i];
        const inputPathPart = inputPathParts[i];
        if (typeof basePathPart === 'string' && basePathPart === inputPathPart) {
            continue;
        }
        if (i === inputPathParts.length - 1) {
            const lastPart = inputPathParts[i].toLowerCase();
            if (lastPart.endsWith('.html') || lastPart.endsWith('.htm')) {
                fileName = inputPathParts[i];
                break;
            }
        }
        pathParts.push(inputPathPart);
    }
    pathParts.push(fileName);
    // figure out the directory where this file will be saved
    const filePath = manager.config.sys.path.join(manager.outputTarget.appDir, ...pathParts);
    return filePath;
}

function initializePrerenderEntryUrls(manager) {
    const entryAnchors = [];
    if (Array.isArray(manager.prerenderConfig.entryUrls)) {
        manager.prerenderConfig.entryUrls.forEach(entryUrl => {
            const entryAnchor = {
                href: entryUrl
            };
            entryAnchors.push(entryAnchor);
        });
    }
    else {
        const entryAnchor = {
            href: manager.outputTarget.baseUrl
        };
        entryAnchors.push(entryAnchor);
    }
    for (const entryAnchor of entryAnchors) {
        // ensure each entry url is valid
        // and has a domain
        try {
            new URL_(entryAnchor.href);
        }
        catch (e) {
            const diagnostic = buildError(manager.diagnostics);
            diagnostic.header = `Invalid Prerender Entry Url: ${entryAnchor.href}`;
            diagnostic.messageText = `Entry Urls must include the protocol and domain of the site being prerendered.`;
            return;
        }
    }
    const base = new URL_(manager.outputTarget.baseUrl);
    const hrefs = crawlAnchorsForNextUrls(manager.prerenderConfig, manager.diagnostics, base, base, entryAnchors);
    hrefs.forEach(href => {
        addUrlToPendingQueue(manager, href, '#entryUrl');
    });
}
function addUrlToPendingQueue(manager, queueUrl, fromUrl) {
    if (typeof queueUrl !== 'string' || queueUrl === '') {
        return;
    }
    if (manager.urlsPending.has(queueUrl)) {
        return;
    }
    if (manager.urlsProcessing.has(queueUrl)) {
        return;
    }
    if (manager.urlsCompleted.has(queueUrl)) {
        return;
    }
    manager.urlsPending.add(queueUrl);
    if (manager.isDebug) {
        const url = new URL_(queueUrl).pathname;
        const from = fromUrl.startsWith('#') ? fromUrl : new URL_(fromUrl).pathname;
        manager.config.logger.debug(`prerender queue: ${url} (from ${from})`);
    }
}
async function drainPrerenderQueue(manager) {
    const url = getNextUrl(manager);
    if (url != null) {
        // looks like we're ready to prerender more
        // remove from pending
        manager.urlsPending.delete(url);
        // move to processing
        manager.urlsProcessing.add(url);
        // kick off async prerendering
        prerenderUrl(manager, url);
        // could be more ready for prerendering
        // let's check again after a tick
        manager.config.sys.nextTick(() => {
            drainPrerenderQueue(manager);
        });
    }
    if (manager.urlsProcessing.size === 0) {
        if (typeof manager.resolve === 'function') {
            // we're not actively processing anything
            // and there aren't anymore urls in the queue to be prerendered
            // so looks like our job here is done, good work team
            manager.resolve();
            manager.resolve = null;
        }
    }
}
function getNextUrl(manager) {
    const next = manager.urlsPending.values().next();
    if (next.done) {
        // all emptied out, no more pending
        return null;
    }
    if (manager.urlsProcessing.size >= manager.maxConcurrency) {
        // slow it down there buddy, too many at one time
        return null;
    }
    return next.value;
}
async function prerenderUrl(manager, url) {
    let previewUrl = url;
    try {
        previewUrl = new URL_(url).pathname;
        let timespan;
        if (manager.isDebug) {
            timespan = manager.config.logger.createTimeSpan(`prerender start: ${previewUrl}`, true);
        }
        const prerenderRequest = {
            baseUrl: manager.outputTarget.baseUrl,
            componentGraphPath: manager.componentGraphPath,
            devServerHostUrl: manager.devServerHostUrl,
            hydrateAppFilePath: manager.hydrateAppFilePath,
            prerenderConfigPath: manager.prerenderConfigPath,
            templateId: manager.templateId,
            url: url,
            writeToFilePath: getWriteFilePathFromUrlPath(manager, url)
        };
        // prender this path and wait on the results
        const results = await manager.config.sys.prerenderUrl(prerenderRequest);
        if (manager.isDebug) {
            const filePath = manager.config.sys.path.relative(manager.config.rootDir, results.filePath);
            const hasError = results.diagnostics.some(d => d.level === 'error');
            if (hasError) {
                timespan.finish(`prerender failed: ${previewUrl}, ${filePath}`, 'red');
            }
            else {
                timespan.finish(`prerender finish: ${previewUrl}, ${filePath}`);
            }
        }
        manager.diagnostics.push(...results.diagnostics);
        if (Array.isArray(results.anchorUrls)) {
            results.anchorUrls.forEach(anchorUrl => {
                addUrlToPendingQueue(manager, anchorUrl, url);
            });
        }
    }
    catch (e) {
        // darn, idk, bad news
        catchError(manager.diagnostics, e);
    }
    manager.urlsProcessing.delete(url);
    manager.urlsCompleted.add(url);
    const urlsCompletedSize = manager.urlsCompleted.size;
    if (manager.progressLogger && urlsCompletedSize > 1) {
        manager.progressLogger.update(`           prerendered ${urlsCompletedSize} urls: ${manager.config.sys.color.dim(previewUrl)}`);
    }
    // let's try to drain the queue again and let this
    // next call figure out if we're actually done or not
    manager.config.sys.nextTick(() => {
        drainPrerenderQueue(manager);
    });
}

async function generateSitemapXml(manager) {
    if (manager.prerenderConfig.sitemapXml === null) {
        // if it's set to null then let's not create a sitemap.xml file
        return null;
    }
    try {
        if (typeof manager.prerenderConfig.sitemapXml !== 'function') {
            // not set to null, but also no config.sitemapXml(), so let's make a default
            manager.prerenderConfig.sitemapXml = function sitemapXml(opts) {
                const content = [];
                content.push(`<?xml version="1.0" encoding="UTF-8"?>`);
                content.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
                opts.urls.forEach(url => {
                    content.push(` <url><loc>${url}</loc></url>`);
                });
                content.push(`</urlset>`);
                return content.join('\n');
            };
        }
        const opts = {
            urls: getSitemapUrls(manager),
            baseUrl: manager.outputTarget.baseUrl,
            dir: manager.outputTarget.appDir
        };
        const userResults = manager.prerenderConfig.sitemapXml(opts);
        if (userResults == null) {
            return null;
        }
        const results = {
            content: null,
            filePath: null,
            url: null
        };
        if (typeof userResults === 'string') {
            results.content = userResults;
        }
        else {
            results.content = userResults.content;
            results.filePath = userResults.filePath;
        }
        if (typeof results.content !== 'string') {
            return null;
        }
        if (typeof results.filePath !== 'string') {
            results.filePath = manager.config.sys.path.join(manager.outputTarget.appDir, `sitemap.xml`);
        }
        if (typeof results.url !== 'string') {
            const sitemapUrl = new URL_(`sitemap.xml`, manager.outputTarget.baseUrl);
            results.url = sitemapUrl.href;
        }
        await manager.config.sys.fs.writeFile(results.filePath, results.content);
        return results;
    }
    catch (e) {
        catchError(manager.diagnostics, e);
        return null;
    }
}
function getSitemapUrls(manager) {
    const urls = [];
    if (typeof manager.prerenderConfig.canonicalUrl === 'function') {
        // user provide a canonicalUrl() function
        // use that to normalize the urls for the sitemap.xml
        // if it returned null then don't add it to the sitemap
        manager.urlsCompleted.forEach(url => {
            const canonicalUrl = manager.prerenderConfig.canonicalUrl(new URL_(url));
            if (typeof canonicalUrl === 'string' && canonicalUrl.trim() !== '') {
                urls.push(canonicalUrl);
            }
        });
    }
    else {
        manager.urlsCompleted.forEach(url => {
            if (typeof url === 'string') {
                urls.push(url);
            }
        });
    }
    return urls.sort(sortUrls);
}
function sortUrls(a, b) {
    const partsA = a.split('/').length;
    const partsB = b.split('/').length;
    if (partsA < partsB)
        return -1;
    if (partsA > partsB)
        return 1;
    if (a < b)
        return -1;
    if (a > b)
        return 1;
    return 0;
}

async function generateRobotsTxt(manager, sitemapResults) {
    if (manager.prerenderConfig.robotsTxt === null) {
        // if it's set to null then let's not create a robots.txt file
        return null;
    }
    try {
        if (typeof manager.prerenderConfig.robotsTxt !== 'function') {
            // not set to null, but also no config.robotsTxt(), so let's make a default
            manager.prerenderConfig.robotsTxt = function robotsTxt(opts) {
                const content = [
                    `User-agent: *`,
                    `Disallow:`
                ];
                if (typeof opts.sitemapUrl === 'string') {
                    content.push(`Sitemap: ${opts.sitemapUrl}`);
                }
                return content.join('\n');
            };
        }
        const opts = {
            urls: getSitemapUrls(manager),
            baseUrl: manager.outputTarget.baseUrl,
            sitemapUrl: sitemapResults ? sitemapResults.url : null,
            dir: manager.outputTarget.dir
        };
        const userResults = manager.prerenderConfig.robotsTxt(opts);
        if (userResults == null) {
            return null;
        }
        const results = {
            content: null,
            filePath: null,
            url: null
        };
        if (typeof userResults === 'string') {
            results.content = userResults;
        }
        else {
            results.content = userResults.content;
            results.filePath = userResults.filePath;
        }
        if (typeof results.content !== 'string') {
            return null;
        }
        const lines = results.content.replace(/\r/g, '\n').split('\n');
        results.content = lines.map(l => l.trim()).join('\n');
        if (typeof results.filePath !== 'string') {
            results.filePath = manager.config.sys.path.join(manager.outputTarget.dir, `robots.txt`);
        }
        if (typeof results.url !== 'string') {
            const robotsTxtUrl = new URL_(`/robots.txt`, manager.outputTarget.baseUrl);
            results.url = robotsTxtUrl.href;
        }
        await manager.config.sys.fs.writeFile(results.filePath, results.content);
        return results;
    }
    catch (e) {
        catchError(manager.diagnostics, e);
        return null;
    }
}

async function generateTemplateHtml(config, buildCtx, outputTarget) {
    try {
        const templateHtml = await config.sys.fs.readFile(outputTarget.indexHtml);
        const templateDoc = config.sys.createDocument(templateHtml);
        validateTemplateHtml(config, buildCtx, templateDoc);
        await inlineStyleSheets$1(config, templateDoc, outputTarget);
        if (config.minifyJs && config.logLevel !== 'debug') {
            await minifyScriptElements(config, templateDoc);
        }
        return config.sys.serializeNodeToHtml(templateDoc);
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    return undefined;
}
function validateTemplateHtml(_config, _buildCtx, _doc) {
    // TODO
}
function inlineStyleSheets$1(config, doc, outputTarget) {
    const globalLinks = Array.from(doc.querySelectorAll('link[rel=stylesheet]'));
    return Promise.all(globalLinks.map(async (link) => {
        const href = link.getAttribute('href');
        if (!href.startsWith('/') || link.getAttribute('media') !== null) {
            return;
        }
        const fsPath = config.sys.path.join(outputTarget.appDir, href);
        if (!config.sys.fs.existsSync(fsPath)) {
            return;
        }
        const styles = await config.sys.fs.readFile(fsPath);
        // insert inline <style>
        const inlinedStyles = doc.createElement('style');
        inlinedStyles.innerHTML = styles;
        link.parentNode.insertBefore(inlinedStyles, link);
        link.remove();
        // mark inlinedStyle as treeshakable
        inlinedStyles.setAttribute('data-styles', '');
        // since it's not longer a critical resource
        link.setAttribute('media', '(max-width: 0px)');
        link.setAttribute('importance', 'low');
        link.setAttribute('onload', `this.media=''`);
        // move <link rel="stylesheet"> to the end of <body>
        doc.body.appendChild(link);
    }));
}
function minifyScriptElements(config, doc) {
    const scriptElms = Array.from(doc.querySelectorAll('script'))
        .filter(scriptElm => {
        if (scriptElm.hasAttribute('src')) {
            return false;
        }
        const scriptType = scriptElm.getAttribute('type');
        if (typeof scriptType === 'string' && scriptType !== 'module' && scriptType !== 'text/javascript') {
            return false;
        }
        return true;
    });
    return Promise.all(scriptElms.map(async (scriptElm) => {
        const innerHTML = scriptElm.innerHTML;
        const opts = {
            output: {},
            compress: {}
        };
        if (scriptElm.getAttribute('type') === 'module') {
            opts.ecma = 7;
            opts.module = true;
            opts.output.ecma = 7;
            opts.compress.ecma = 7;
            opts.compress.arrows = true;
            opts.compress.module = true;
        }
        else {
            opts.ecma = 5;
            opts.output.ecma = 5;
            opts.compress.ecma = 5;
            opts.compress.arrows = false;
            opts.compress.module = false;
        }
        const results = await config.sys.minifyJs(innerHTML, opts);
        if (results != null && typeof results.output === 'string' && results.diagnostics.length === 0) {
            scriptElm.innerHTML = results.output;
        }
    }));
}

function getPrerenderConfig(diagnostics, prerenderConfigPath) {
    const prerenderConfig = {};
    if (typeof prerenderConfigPath === 'string') {
        try {
            // webpack work-around/hack
            const requireFunc = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;
            const userConfig = requireFunc(prerenderConfigPath);
            if (userConfig != null) {
                Object.assign(prerenderConfig, userConfig);
            }
        }
        catch (e) {
            catchError(diagnostics, e);
        }
    }
    if (typeof prerenderConfig.trailingSlash !== 'boolean') {
        prerenderConfig.trailingSlash = false;
    }
    return prerenderConfig;
}

async function runPrerenderMain(config, buildCtx, outputTarget) {
    // main thread!
    if (buildCtx.hasError) {
        return;
    }
    // keep track of how long the entire build process takes
    const timeSpan = buildCtx.createTimeSpan(`prerendering started`);
    const prerenderDiagnostics = [];
    const devServerBaseUrl = new URL_(config.devServer.browserUrl);
    const devServerHostUrl = devServerBaseUrl.origin;
    config.logger.debug(`prerender dev server: ${devServerHostUrl}`);
    // get the prerender urls to queue up
    const manager = {
        componentGraphPath: null,
        config: config,
        diagnostics: prerenderDiagnostics,
        devServerHostUrl: devServerHostUrl,
        hydrateAppFilePath: buildCtx.hydrateAppFilePath,
        isDebug: (config.logLevel === 'debug'),
        logCount: 0,
        maxConcurrency: (config.maxConcurrentWorkers * 2 - 1),
        outputTarget: outputTarget,
        prerenderConfig: getPrerenderConfig(prerenderDiagnostics, outputTarget.prerenderConfig),
        prerenderConfigPath: outputTarget.prerenderConfig,
        templateId: null,
        urlsCompleted: new Set(),
        urlsPending: new Set(),
        urlsProcessing: new Set(),
        resolve: null
    };
    if (!config.flags.ci && config.logLevel !== 'debug') {
        manager.progressLogger = startProgressLogger();
    }
    initializePrerenderEntryUrls(manager);
    if (manager.urlsPending.size === 0) {
        timeSpan.finish(`prerendering failed: no urls found in the prerender config`, 'red');
        return;
    }
    const templateHtml = await generateTemplateHtml(config, buildCtx, outputTarget);
    manager.templateId = await createPrerenderTemplate(config, templateHtml);
    manager.componentGraphPath = await createComponentGraphPath(config, buildCtx, outputTarget);
    await new Promise(resolve => {
        manager.resolve = resolve;
        config.sys.nextTick(() => {
            drainPrerenderQueue(manager);
        });
    });
    if (manager.isDebug) {
        const debugDiagnostics = prerenderDiagnostics.filter(d => d.level === 'debug');
        if (debugDiagnostics.length > 0) {
            config.logger.printDiagnostics(debugDiagnostics);
        }
    }
    const duration = timeSpan.duration();
    const sitemapResults = await generateSitemapXml(manager);
    await generateRobotsTxt(manager, sitemapResults);
    const prerenderBuildErrors = prerenderDiagnostics.filter(d => d.level === 'error');
    const prerenderRuntimeErrors = prerenderDiagnostics.filter(d => d.type === 'runtime');
    if (prerenderBuildErrors.length > 0) {
        // convert to just runtime errors so the other build files still write
        // but the CLI knows an error occurred and should have an exit code 1
        prerenderBuildErrors.forEach(diagnostic => {
            diagnostic.type = 'runtime';
        });
        buildCtx.diagnostics.push(...prerenderBuildErrors);
    }
    buildCtx.diagnostics.push(...prerenderRuntimeErrors);
    // Clear progress logger
    if (manager.progressLogger) {
        await manager.progressLogger.stop();
    }
    const totalUrls = manager.urlsCompleted.size;
    if (totalUrls > 1) {
        const average = Math.round(duration / totalUrls);
        config.logger.info(`prerendered ${totalUrls} urls, averaging ${average} ms per url`);
    }
    const statusMessage = prerenderBuildErrors.length > 0 ? 'failed' : 'finished';
    const statusColor = prerenderBuildErrors.length > 0 ? 'red' : 'green';
    timeSpan.finish(`prerendering ${statusMessage}`, statusColor, true);
}
async function createPrerenderTemplate(config, templateHtml) {
    const hash = await config.sys.generateContentHash(templateHtml, 12);
    const templateFileName = `prerender-template-${hash}.html`;
    const templateId = config.sys.path.join(config.sys.details.tmpDir, templateFileName);
    await config.sys.fs.writeFile(templateId, templateHtml);
    return templateId;
}
async function createComponentGraphPath(config, buildCtx, outputTarget) {
    if (buildCtx.componentGraph) {
        const content = getComponentPathContent(config, buildCtx.componentGraph, outputTarget);
        const hash = await config.sys.generateContentHash(content, 12);
        const fileName = `prerender-component-graph-${hash}.json`;
        const componentGraphPath = config.sys.path.join(config.sys.details.tmpDir, fileName);
        await config.sys.fs.writeFile(componentGraphPath, content);
        return componentGraphPath;
    }
    return null;
}
function getComponentPathContent(config, componentGraph, outputTarget) {
    const buildDir = getAbsoluteBuildDir(config, outputTarget);
    const object = {};
    for (const [key, chunks] of componentGraph.entries()) {
        object[key] = chunks.map(filename => config.sys.path.join(buildDir, filename));
    }
    return JSON.stringify(object);
}
const startProgressLogger = () => {
    let promise = Promise.resolve();
    const update = (text) => {
        text = text.substr(0, process.stdout.columns - 5) + '\x1b[0m';
        return promise = promise.then(() => {
            return new Promise(resolve => {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0, null);
                process.stdout.write(text, resolve);
            });
        });
    };
    const stop = () => {
        return update('\x1B[?25h');
    };
    // hide cursor
    process.stdout.write('\x1B[?25l');
    return {
        update,
        stop
    };
};

async function outputPrerender(config, buildCtx) {
    if (typeof config.srcIndexHtml !== 'string') {
        return;
    }
    if (!config.flags || !config.flags.prerender) {
        return;
    }
    if (typeof buildCtx.hydrateAppFilePath !== 'string') {
        const diagnostic = buildError(buildCtx.diagnostics);
        diagnostic.messageText = `hydrateAppFilePath was not found in order to prerender www output target`;
        return;
    }
    const outputTargets = config.outputTargets
        .filter(isOutputTargetWww)
        .filter(o => typeof o.indexHtml === 'string');
    await Promise.all(outputTargets.map(outputTarget => {
        return prerenderOutputTarget(config, buildCtx, outputTarget);
    }));
}
async function prerenderOutputTarget(config, buildCtx, outputTarget) {
    // if there was src index.html file, then the process before this one
    // would have already loaded and updated the src index to its www path
    // get the www index html content for the template for all prerendered pages
    if (typeof buildCtx.hydrateAppFilePath !== 'string') {
        buildCtx.debug(`prerenderOutputTarget, missing hydrateAppFilePath for prerendering`);
        return;
    }
    await runPrerenderMain(config, buildCtx, outputTarget);
}

async function outputServiceWorkers(config, buildCtx) {
    const wwwServiceOutputs = config.outputTargets
        .filter(isOutputTargetWww)
        .filter(o => typeof o.indexHtml === 'string' && !!o.serviceWorker);
    if (wwwServiceOutputs.length === 0) {
        return;
    }
    if (config.sys.lazyRequire == null) {
        return;
    }
    // let's make sure they have what we need from workbox installed
    await config.sys.lazyRequire.ensure(config.logger, config.rootDir, [WORKBOX_BUILD_MODULE_ID]);
    // we've ensure workbox is installed, so let's require it now
    const workbox = config.sys.lazyRequire.require(WORKBOX_BUILD_MODULE_ID);
    await Promise.all(wwwServiceOutputs.map(outputTarget => (generateServiceWorker(config, buildCtx, workbox, outputTarget))));
}
const WORKBOX_BUILD_MODULE_ID = 'workbox-build';

function validateManifestJson(config, compilerCtx, buildCtx) {
    if (config.devMode) {
        return null;
    }
    const outputTargets = config.outputTargets.filter(isOutputTargetWww);
    return Promise.all(outputTargets.map(async (outputsTarget) => {
        const manifestFilePath = config.sys.path.join(outputsTarget.dir, 'manifest.json');
        try {
            const manifestContent = await compilerCtx.fs.readFile(manifestFilePath);
            try {
                const manifestData = JSON.parse(manifestContent);
                await validateManifestJsonData(config, compilerCtx, buildCtx, manifestFilePath, manifestData);
            }
            catch (e) {
                const err = buildError(buildCtx.diagnostics);
                err.header = `Invalid manifest.json`;
                err.absFilePath = manifestFilePath;
            }
        }
        catch (e) { }
    }));
}
async function validateManifestJsonData(config, compilerCtx, buildCtx, manifestFilePath, manifestData) {
    if (Array.isArray(manifestData.icons)) {
        await Promise.all(manifestData.icons.map((manifestIcon) => {
            return validateManifestJsonIcon(config, compilerCtx, buildCtx, manifestFilePath, manifestIcon);
        }));
    }
}
async function validateManifestJsonIcon(config, compilerCtx, buildCtx, manifestFilePath, manifestIcon) {
    let iconSrc = manifestIcon.src;
    if (typeof iconSrc !== 'string') {
        const msg = `Manifest icon missing "src"`;
        buildJsonFileError(compilerCtx, buildCtx.diagnostics, manifestFilePath, msg, `"icons"`);
        return;
    }
    if (iconSrc.startsWith('/')) {
        iconSrc = iconSrc.substr(1);
    }
    const manifestDir = config.sys.path.dirname(manifestFilePath);
    const iconPath = config.sys.path.join(manifestDir, iconSrc);
    const hasAccess = await compilerCtx.fs.access(iconPath);
    if (!hasAccess) {
        const msg = `Unable to find manifest icon "${manifestIcon.src}"`;
        buildJsonFileError(compilerCtx, buildCtx.diagnostics, manifestFilePath, msg, `"${manifestIcon.src}"`);
    }
}

async function validatePackageJson(config, compilerCtx, buildCtx) {
    if (config.watch) {
        return;
    }
    if (buildCtx.packageJson == null) {
        return;
    }
    const outputTargets = config.outputTargets.filter(isOutputTargetDistCollection);
    const typesOutputTargets = config.outputTargets.filter(isOutputTargetDistTypes);
    await Promise.all([
        ...outputTargets.map(outputsTarget => {
            return validatePackageJsonOutput(config, compilerCtx, buildCtx, outputsTarget);
        }),
        ...typesOutputTargets.map(outputTarget => {
            return validateTypes(config, compilerCtx, buildCtx, outputTarget);
        })
    ]);
}
async function validatePackageJsonOutput(config, compilerCtx, buildCtx, outputTarget) {
    await Promise.all([
        validatePackageFiles(config, compilerCtx, buildCtx, outputTarget),
        validateMain(config, compilerCtx, buildCtx, outputTarget),
        validateModule(config, compilerCtx, buildCtx, outputTarget),
        validateCollection(config, compilerCtx, buildCtx, outputTarget),
        validateBrowser(compilerCtx, buildCtx)
    ]);
}
async function validatePackageFiles(config, compilerCtx, buildCtx, outputTarget) {
    if (!config.devMode && Array.isArray(buildCtx.packageJson.files)) {
        const actualDistDir = normalizePath(config.sys.path.relative(config.rootDir, outputTarget.dir));
        const validPaths = [
            `${actualDistDir}`,
            `${actualDistDir}/`,
            `./${actualDistDir}`,
            `./${actualDistDir}/`
        ];
        const containsDistDir = buildCtx.packageJson.files
            .some(userPath => validPaths.some(validPath => normalizePath(userPath) === validPath));
        if (!containsDistDir) {
            const msg = `package.json "files" array must contain the distribution directory "${actualDistDir}/" when generating a distribution.`;
            packageJsonWarn(compilerCtx, buildCtx, msg, `"files"`);
            return;
        }
        await Promise.all(buildCtx.packageJson.files.map(async (pkgFile) => {
            const packageJsonDir = config.sys.path.dirname(buildCtx.packageJsonFilePath);
            const absPath = config.sys.path.join(packageJsonDir, pkgFile);
            const hasAccess = await compilerCtx.fs.access(absPath);
            if (!hasAccess) {
                const msg = `Unable to find "${pkgFile}" within the package.json "files" array.`;
                packageJsonError(compilerCtx, buildCtx, msg, `"${pkgFile}"`);
            }
        }));
    }
}
function validateMain(config, compilerCtx, buildCtx, outputTarget) {
    const mainAbs = config.sys.path.join(outputTarget.dir, 'index.js');
    const mainRel = normalizePath(config.sys.path.relative(config.rootDir, mainAbs));
    if (typeof buildCtx.packageJson.main !== 'string' || buildCtx.packageJson.main === '') {
        const msg = `package.json "main" property is required when generating a distribution. It's recommended to set the "main" property to: ${mainRel}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"main"`);
    }
    else if (buildCtx.packageJson.main !== mainRel) {
        const msg = `package.json "main" property is set to "${buildCtx.packageJson.main}". It's recommended to set the "main" property to: ${mainRel}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"main"`);
    }
}
function validateModule(config, compilerCtx, buildCtx, outputTarget) {
    const moduleAbs = config.sys.path.join(outputTarget.dir, 'index.mjs');
    const moduleRel = normalizePath(config.sys.path.relative(config.rootDir, moduleAbs));
    if (typeof buildCtx.packageJson.module !== 'string') {
        const msg = `package.json "module" property is required when generating a distribution. It's recommended to set the "module" property to: ${moduleRel}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"module"`);
    }
    else if (buildCtx.packageJson.module !== moduleRel) {
        const msg = `package.json "module" property is set to "${buildCtx.packageJson.module}". It's recommended to set the "module" property to: ${moduleRel}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"module"`);
    }
}
async function validateTypes(config, compilerCtx, buildCtx, outputTarget) {
    if (typeof buildCtx.packageJson.types !== 'string' || buildCtx.packageJson.types === '') {
        const recommendedPath = getRecommendedTypesPath(config, outputTarget);
        const msg = `package.json "types" property is required when generating a distribution. It's recommended to set the "types" property to: ${recommendedPath}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"types"`);
    }
    else if (!buildCtx.packageJson.types.endsWith('.d.ts')) {
        const msg = `package.json "types" file must have a ".d.ts" extension: ${buildCtx.packageJson.types}`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"types"`);
    }
    else {
        const typesFile = config.sys.path.join(config.rootDir, buildCtx.packageJson.types);
        const typesFileExists = await compilerCtx.fs.access(typesFile);
        if (!typesFileExists) {
            const recommendedPath = getRecommendedTypesPath(config, outputTarget);
            let msg = `package.json "types" property is set to "${buildCtx.packageJson.types}" but cannot be found.`;
            if (buildCtx.packageJson.types !== recommendedPath) {
                msg += ` It's recommended to set the "types" property to: ${recommendedPath}`;
            }
            packageJsonError(compilerCtx, buildCtx, msg, `"types"`);
        }
    }
}
function validateCollection(config, compilerCtx, buildCtx, outputTarget) {
    if (outputTarget.collectionDir) {
        const collectionRel = config.sys.path.join(config.sys.path.relative(config.rootDir, outputTarget.collectionDir), COLLECTION_MANIFEST_FILE_NAME);
        if (!buildCtx.packageJson.collection || normalizePath(buildCtx.packageJson.collection) !== collectionRel) {
            const msg = `package.json "collection" property is required when generating a distribution and must be set to: ${collectionRel}`;
            packageJsonWarn(compilerCtx, buildCtx, msg, `"collection"`);
        }
    }
}
function validateBrowser(compilerCtx, buildCtx) {
    if (typeof buildCtx.packageJson.browser === 'string') {
        const msg = `package.json "browser" property is set to "${buildCtx.packageJson.browser}". However, for maximum compatibility with all bundlers it's recommended to not set the "browser" property and instead ensure both "module" and "main" properties are set.`;
        packageJsonWarn(compilerCtx, buildCtx, msg, `"browser"`);
    }
}
function getRecommendedTypesPath(config, outputTarget) {
    const typesAbs = getComponentsDtsTypesFilePath(config, outputTarget);
    return normalizePath(config.sys.path.relative(config.rootDir, typesAbs));
}
function packageJsonError(compilerCtx, buildCtx, msg, warnKey) {
    const err = buildJsonFileError(compilerCtx, buildCtx.diagnostics, buildCtx.packageJsonFilePath, msg, warnKey);
    err.header = `Package Json`;
    return err;
}
function packageJsonWarn(compilerCtx, buildCtx, msg, warnKey) {
    const warn = buildJsonFileError(compilerCtx, buildCtx.diagnostics, buildCtx.packageJsonFilePath, msg, warnKey);
    warn.header = `Package Json`;
    warn.level = 'warn';
    return warn;
}

function validateBuildFiles(config, compilerCtx, buildCtx) {
    if (buildCtx.hasError) {
        return null;
    }
    return Promise.all([
        validateManifestJson(config, compilerCtx, buildCtx),
        validatePackageJson(config, compilerCtx, buildCtx)
    ]);
}

async function writeBuildFiles(config, compilerCtx, buildCtx) {
    const timeSpan = buildCtx.createTimeSpan(`writeBuildFiles started`, true);
    let totalFilesWrote = 0;
    try {
        // commit all the writeFiles, mkdirs, rmdirs and unlinks to disk
        const commitResults = await compilerCtx.fs.commit();
        // get the results from the write to disk commit
        buildCtx.filesWritten = commitResults.filesWritten;
        buildCtx.filesDeleted = commitResults.filesDeleted;
        buildCtx.dirsDeleted = commitResults.dirsDeleted;
        buildCtx.dirsAdded = commitResults.dirsAdded;
        totalFilesWrote = commitResults.filesWritten.length;
        // successful write
        // kick off writing the cached file stuff
        await compilerCtx.cache.commit();
        buildCtx.debug(`in-memory-fs: ${compilerCtx.fs.getMemoryStats()}`);
        buildCtx.debug(`cache: ${compilerCtx.cache.getMemoryStats()}`);
        if (!config.watch) {
            compilerCtx.reset();
            if (typeof global !== 'undefined' && global.gc) {
                buildCtx.debug(`triggering forced gc`);
                global.gc();
                buildCtx.debug(`forced gc finished`);
            }
        }
        await outputPrerender(config, buildCtx);
        await outputServiceWorkers(config, buildCtx);
        await validateBuildFiles(config, compilerCtx, buildCtx);
    }
    catch (e) {
        catchError(buildCtx.diagnostics, e);
    }
    timeSpan.finish(`writeBuildFiles finished, files wrote: ${totalFilesWrote}`);
}

async function build(config, compilerCtx, buildCtx) {
    try {
        // ensure any existing worker tasks are not running
        // and we've got a clean slate
        config.sys.cancelWorkerTasks();
        buildCtx.packageJson = await readPackageJson(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        if (!config.devServer || !config.flags.serve) {
            // create an initial index.html file if one doesn't already exist
            await initIndexHtmls(config, compilerCtx, buildCtx);
            if (buildCtx.hasError)
                return buildAbort(buildCtx);
        }
        // empty the directories on the first build
        await emptyOutputTargets(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.emptyOutputTargets);
        // async scan the src directory for ts files
        // then transpile them all in one go
        // buildCtx.moduleFiles is populated here
        buildCtx.hasScriptChanges = await transpileApp(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.transpileApp);
        if (config.srcIndexHtml) {
            const hasIndex = await compilerCtx.fs.access(config.srcIndexHtml);
            if (hasIndex) {
                const indexSrcHtml = await compilerCtx.fs.readFile(config.srcIndexHtml);
                buildCtx.indexDoc = config.sys.createDocument(indexSrcHtml);
            }
        }
        const copyPromise = outputCopy(config, compilerCtx, buildCtx);
        // we've got the compiler context filled with app modules and collection dependency modules
        // figure out how all these components should be connected
        generateEntryModules(config, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        // preprocess and generate styles before any outputTarget starts
        buildCtx.stylesPromise = generateStyles(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.generateStyles);
        // generate the core app files
        await generateOutputTargets(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.generateOutputTargets);
        // wait on some promises we kicked off earlier
        await Promise.all([
            // await on the validate types build to finish
            // do this before we attempt to write build files
            buildCtx.validateTypesBuild(),
            // we started the copy tasks a long long time ago
            // i'm sure it's done by now, but let's double check
            // make sure this finishes before the write build files
            // so they're not stepping on each other writing files
            copyPromise
        ]);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.validateTypesBuild);
        // write all the files and copy asset files
        await writeBuildFiles(config, compilerCtx, buildCtx);
        if (buildCtx.hasError)
            return buildAbort(buildCtx);
        buildCtx.progress(ProgressTask.writeBuildFiles);
    }
    catch (e) {
        // ¯\_(ツ)_/¯
        catchError(buildCtx.diagnostics, e);
    }
    // return what we've learned today
    return buildFinish(buildCtx);
}

async function docs(config, compilerCtx) {
    const buildCtx = new BuildContext(config, compilerCtx);
    config.logger.info(config.logger.cyan(`${config.sys.compiler.name} v${config.sys.compiler.version}`));
    // keep track of how long the entire build process takes
    const timeSpan = config.logger.createTimeSpan(`generate docs, ${config.fsNamespace}, started`);
    try {
        // begin the build
        // async scan the src directory for ts files
        // then transpile them all in one go
        await transpileApp(config, compilerCtx, buildCtx);
        // generate each of the docs
        // await createPluginOutput(config, compilerCtx, buildCtx, [docsPlugin, jsonDocsPlugin, vscodeDocsPlugin]);
    }
    catch (e) {
        // catch all phase
        catchError(buildCtx.diagnostics, e);
    }
    // finalize phase
    buildCtx.diagnostics = normalizeDiagnostics(compilerCtx, buildCtx.diagnostics);
    config.logger.printDiagnostics(buildCtx.diagnostics);
    // create a nice pretty message stating what happend
    let buildStatus = 'finished';
    let statusColor = 'green';
    if (hasError(buildCtx.diagnostics)) {
        buildStatus = 'failed';
        statusColor = 'red';
    }
    timeSpan.finish(`generate docs ${buildStatus}`, statusColor, true, true);
}

function validateRollupConfig(config) {
    const cleanRollupConfig = getCleanRollupConfig(config.rollupConfig);
    config.rollupConfig = cleanRollupConfig;
}
function getCleanRollupConfig(rollupConfig) {
    let cleanRollupConfig = DEFAULT_ROLLUP_CONFIG;
    if (!rollupConfig || !isObject(rollupConfig)) {
        return cleanRollupConfig;
    }
    if (rollupConfig.inputOptions && isObject(rollupConfig.inputOptions)) {
        cleanRollupConfig = Object.assign(Object.assign({}, cleanRollupConfig), { inputOptions: pluck(rollupConfig.inputOptions, ['context', 'moduleContext', 'treeshake']) });
    }
    if (rollupConfig.outputOptions && isObject(rollupConfig.outputOptions)) {
        cleanRollupConfig = Object.assign(Object.assign({}, cleanRollupConfig), { outputOptions: pluck(rollupConfig.outputOptions, ['globals']) });
    }
    return cleanRollupConfig;
}
const DEFAULT_ROLLUP_CONFIG = {
    inputOptions: {},
    outputOptions: {}
};

function setBooleanConfig(config, configName, flagName, defaultValue) {
    if (flagName) {
        if (typeof config.flags[flagName] === 'boolean') {
            config[configName] = config.flags[flagName];
        }
    }
    const userConfigName = getUserConfigName(config, configName);
    if (typeof config[userConfigName] === 'function') {
        config[userConfigName] = !!config[userConfigName]();
    }
    if (typeof config[userConfigName] === 'boolean') {
        config[configName] = config[userConfigName];
    }
    else {
        config[configName] = defaultValue;
    }
}
function setNumberConfig(config, configName, _flagName, defaultValue) {
    const userConfigName = getUserConfigName(config, configName);
    if (typeof config[userConfigName] === 'function') {
        config[userConfigName] = config[userConfigName]();
    }
    if (typeof config[userConfigName] === 'number') {
        config[configName] = config[userConfigName];
    }
    else {
        config[configName] = defaultValue;
    }
}
function setStringConfig(config, configName, defaultValue) {
    const userConfigName = getUserConfigName(config, configName);
    if (typeof config[userConfigName] === 'function') {
        config[userConfigName] = config[userConfigName]();
    }
    if (typeof config[userConfigName] === 'string') {
        config[configName] = config[userConfigName];
    }
    else {
        config[configName] = defaultValue;
    }
}
function setArrayConfig(config, configName, defaultValue) {
    const userConfigName = getUserConfigName(config, configName);
    if (typeof config[userConfigName] === 'function') {
        config[userConfigName] = config[userConfigName]();
    }
    if (!Array.isArray(config[configName])) {
        if (Array.isArray(defaultValue)) {
            config[configName] = defaultValue.slice();
        }
        else {
            config[configName] = [];
        }
    }
}
function getUserConfigName(config, correctConfigName) {
    const userConfigNames = Object.keys(config);
    for (const userConfigName of userConfigNames) {
        if (userConfigName.toLowerCase() === correctConfigName.toLowerCase()) {
            if (userConfigName !== correctConfigName) {
                config.logger.warn(`config "${userConfigName}" should be "${correctConfigName}"`);
                return userConfigName;
            }
            break;
        }
    }
    return correctConfigName;
}

function validateDevServer(config, diagnostics) {
    if (config.devServer === false || config.devServer === null) {
        return config.devServer = null;
    }
    config.devServer = config.devServer || {};
    if (typeof config.flags.address === 'string') {
        config.devServer.address = config.flags.address;
    }
    else {
        setStringConfig(config.devServer, 'address', '0.0.0.0');
    }
    if (typeof config.flags.port === 'number') {
        config.devServer.port = config.flags.port;
    }
    else {
        setNumberConfig(config.devServer, 'port', null, 3333);
    }
    if (config.devServer.hotReplacement === true) {
        // DEPRECATED: 2019-05-20
        config.devServer.reloadStrategy = 'hmr';
    }
    else if (config.devServer.hotReplacement === false || config.devServer.hotReplacement === null) {
        // DEPRECATED: 2019-05-20
        config.devServer.reloadStrategy = null;
    }
    else {
        if (config.devServer.reloadStrategy === undefined) {
            config.devServer.reloadStrategy = 'hmr';
        }
        else if (config.devServer.reloadStrategy !== 'hmr' && config.devServer.reloadStrategy !== 'pageReload' && config.devServer.reloadStrategy !== null) {
            throw new Error(`Invalid devServer reloadStrategy "${config.devServer.reloadStrategy}". Valid configs include "hmr", "pageReload" and null.`);
        }
    }
    setBooleanConfig(config.devServer, 'gzip', null, true);
    setBooleanConfig(config.devServer, 'openBrowser', null, true);
    setBooleanConfig(config.devServer, 'websocket', null, true);
    validateProtocol(config.devServer);
    if (config.devServer.historyApiFallback !== null && config.devServer.historyApiFallback !== false) {
        config.devServer.historyApiFallback = config.devServer.historyApiFallback || {};
        if (typeof config.devServer.historyApiFallback.index !== 'string') {
            config.devServer.historyApiFallback.index = 'index.html';
        }
        if (typeof config.devServer.historyApiFallback.disableDotRule !== 'boolean') {
            config.devServer.historyApiFallback.disableDotRule = false;
        }
    }
    if (config.flags.open === false) {
        config.devServer.openBrowser = false;
    }
    else if (config.flags.prerender && !config.watch) {
        config.devServer.openBrowser = false;
    }
    let serveDir = null;
    let basePath = null;
    const wwwOutputTarget = config.outputTargets.find(isOutputTargetWww);
    if (wwwOutputTarget) {
        const baseUrl = new URL_(wwwOutputTarget.baseUrl, 'http://config.stenciljs.com');
        basePath = baseUrl.pathname;
        serveDir = wwwOutputTarget.appDir;
        config.logger.debug(`dev server www root: ${serveDir}, base path: ${basePath}`);
    }
    else {
        serveDir = config.rootDir;
        if (config.flags && config.flags.serve) {
            config.logger.debug(`dev server missing www output target, serving root directory: ${serveDir}`);
        }
    }
    if (typeof basePath !== 'string' || basePath.trim() === '') {
        basePath = `/`;
    }
    basePath = normalizePath(basePath);
    if (!basePath.startsWith('/')) {
        basePath = '/' + basePath;
    }
    if (!basePath.endsWith('/')) {
        basePath += '/';
    }
    if (typeof config.devServer.logRequests !== 'boolean') {
        config.devServer.logRequests = (config.logLevel === 'debug');
    }
    setStringConfig(config.devServer, 'root', serveDir);
    setStringConfig(config.devServer, 'basePath', basePath);
    if (typeof config.devServer.baseUrl === 'string') {
        const err = buildError(diagnostics);
        err.messageText = `devServer config "baseUrl" has been renamed to "basePath", and should not include a domain or protocol.`;
    }
    if (!config.sys.path.isAbsolute(config.devServer.root)) {
        config.devServer.root = config.sys.path.join(config.rootDir, config.devServer.root);
    }
    if (config.devServer.excludeHmr) {
        if (!Array.isArray(config.devServer.excludeHmr)) {
            const err = buildError(diagnostics);
            err.messageText = `dev server excludeHmr must be an array of glob strings`;
        }
    }
    else {
        config.devServer.excludeHmr = [];
    }
    return config.devServer;
}
function validateProtocol(devServer) {
    devServer.protocol = devServer.https ? 'https' : 'http';
}

function validateNamespace(config, diagnostics) {
    setStringConfig(config, 'namespace', DEFAULT_NAMESPACE);
    config.namespace = config.namespace.trim();
    const invalidNamespaceChars = config.namespace.replace(/(\w)|(\-)|(\$)/g, '');
    if (invalidNamespaceChars !== '') {
        const err = buildError(diagnostics);
        err.messageText = `Namespace "${config.namespace}" contains invalid characters: ${invalidNamespaceChars}`;
    }
    if (config.namespace.length < 3) {
        const err = buildError(diagnostics);
        err.messageText = `Namespace "${config.namespace}" must be at least 3 characters`;
    }
    if (/^\d+$/.test(config.namespace.charAt(0))) {
        const err = buildError(diagnostics);
        err.messageText = `Namespace "${config.namespace}" cannot have a number for the first character`;
    }
    if (config.namespace.charAt(0) === '-') {
        const err = buildError(diagnostics);
        err.messageText = `Namespace "${config.namespace}" cannot have a dash for the first character`;
    }
    if (config.namespace.charAt(config.namespace.length - 1) === '-') {
        const err = buildError(diagnostics);
        err.messageText = `Namespace "${config.namespace}" cannot have a dash for the last character`;
    }
    // the file system namespace is the one
    // used in filenames and seen in the url
    setStringConfig(config, 'fsNamespace', config.namespace.toLowerCase());
    if (config.namespace.includes('-')) {
        // convert to PascalCase
        // this is the same namespace that gets put on "window"
        config.namespace = dashToPascalCase(config.namespace);
    }
}
function validateDistNamespace(config, diagnostics) {
    const hasDist = config.outputTargets.some(isOutputTargetDist);
    if (hasDist) {
        if (typeof config.namespace !== 'string' || config.namespace.toLowerCase() === 'app') {
            const err = buildError(diagnostics);
            err.messageText = `When generating a distribution it is recommended to choose a unique namespace rather than the default setting "App". Please updated the "namespace" config property within the stencil config.`;
        }
    }
}
const DEFAULT_NAMESPACE = 'App';

function validateOutputStats(config) {
    if (config.flags.stats) {
        const hasOutputTarget = config.outputTargets.some(isOutputTargetStats);
        if (!hasOutputTarget) {
            config.outputTargets.push({
                type: STATS
            });
        }
    }
    const outputTargets = config.outputTargets.filter(isOutputTargetStats);
    outputTargets.forEach(outputTarget => {
        validateStatsOutputTarget(config, outputTarget);
    });
}
function validateStatsOutputTarget(config, outputTarget) {
    if (!outputTarget.file) {
        outputTarget.file = DEFAULT_JSON_FILE_NAME;
    }
    if (!config.sys.path.isAbsolute(outputTarget.file)) {
        outputTarget.file = config.sys.path.join(config.rootDir, outputTarget.file);
    }
}
const DEFAULT_JSON_FILE_NAME = 'stencil-stats.json';

function validateCopy(copy, defaultCopy = []) {
    if (copy === null || copy === false) {
        return [];
    }
    if (!Array.isArray(copy)) {
        copy = [];
    }
    copy = copy.slice();
    for (const task of defaultCopy) {
        if (copy.every(t => t.src !== task.src)) {
            copy.push(task);
        }
    }
    return unique(copy, task => `${task.src}:${task.dest}:${task.keepDirStructure}`);
}

function validateOutputTargetDist(config) {
    const path = config.sys.path;
    const distOutputTargets = config.outputTargets.filter(isOutputTargetDist);
    distOutputTargets.forEach(outputTarget => {
        if (typeof outputTarget.dir !== 'string') {
            outputTarget.dir = DEFAULT_DIR;
        }
        if (!path.isAbsolute(outputTarget.dir)) {
            outputTarget.dir = path.join(config.rootDir, outputTarget.dir);
        }
        if (typeof outputTarget.buildDir !== 'string') {
            outputTarget.buildDir = DEFAULT_BUILD_DIR;
        }
        if (!path.isAbsolute(outputTarget.buildDir)) {
            outputTarget.buildDir = path.join(outputTarget.dir, outputTarget.buildDir);
        }
        if (outputTarget.collectionDir === undefined) {
            outputTarget.collectionDir = DEFAULT_COLLECTION_DIR;
        }
        if (outputTarget.collectionDir && !path.isAbsolute(outputTarget.collectionDir)) {
            outputTarget.collectionDir = path.join(outputTarget.dir, outputTarget.collectionDir);
        }
        if (!outputTarget.esmLoaderPath) {
            outputTarget.esmLoaderPath = DEFAULT_ESM_LOADER_DIR;
        }
        if (!path.isAbsolute(outputTarget.esmLoaderPath)) {
            outputTarget.esmLoaderPath = path.resolve(outputTarget.dir, outputTarget.esmLoaderPath);
        }
        if (!outputTarget.typesDir) {
            outputTarget.typesDir = DEFAULT_TYPES_DIR;
        }
        if (!path.isAbsolute(outputTarget.typesDir)) {
            outputTarget.typesDir = path.join(outputTarget.dir, outputTarget.typesDir);
        }
        if (typeof outputTarget.empty !== 'boolean') {
            outputTarget.empty = true;
        }
        outputTarget.copy = validateCopy(outputTarget.copy, config.copy);
        if (outputTarget.collectionDir) {
            config.outputTargets.push({
                type: DIST_COLLECTION,
                dir: outputTarget.dir,
                collectionDir: outputTarget.collectionDir,
            });
            config.outputTargets.push({
                type: COPY,
                dir: outputTarget.collectionDir,
                copyAssets: 'collection',
                copy: [
                    ...outputTarget.copy,
                    { src: '**/*.svg' },
                    { src: '**/*.js' }
                ]
            });
        }
        config.outputTargets.push({
            type: DIST_TYPES,
            dir: outputTarget.dir,
            typesDir: outputTarget.typesDir
        });
        const namespace = config.fsNamespace || 'app';
        const lazyDir = path.join(outputTarget.buildDir, namespace);
        // Lazy build for CDN in dist
        config.outputTargets.push({
            type: DIST_LAZY,
            esmDir: lazyDir,
            systemDir: config.buildEs5 ? lazyDir : undefined,
            systemLoaderFile: config.buildEs5 ? path.join(lazyDir, namespace + '.js') : undefined,
            legacyLoaderFile: path.join(outputTarget.buildDir, namespace + '.js'),
            polyfills: true,
            isBrowserBuild: true,
        });
        config.outputTargets.push({
            type: COPY,
            dir: lazyDir,
            copyAssets: 'dist'
        });
        // Emit global styles
        config.outputTargets.push({
            type: DIST_GLOBAL_STYLES,
            file: config.sys.path.join(lazyDir, `${config.fsNamespace}.css`),
        });
        if (config.buildDist) {
            const esmDir = path.join(outputTarget.dir, 'esm');
            const esmEs5Dir = config.buildEs5 ? path.join(outputTarget.dir, 'esm-es5') : undefined;
            const cjsDir = path.join(outputTarget.dir, 'cjs');
            // Create lazy output-target
            config.outputTargets.push({
                type: DIST_LAZY,
                esmDir,
                esmEs5Dir,
                cjsDir,
                cjsIndexFile: path.join(outputTarget.dir, 'index.js'),
                esmIndexFile: path.join(outputTarget.dir, 'index.mjs'),
                polyfills: true,
            });
            // Create output target that will generate the /loader entry-point
            config.outputTargets.push({
                type: DIST_LAZY_LOADER,
                dir: outputTarget.esmLoaderPath,
                esmDir,
                esmEs5Dir,
                cjsDir,
                componentDts: getComponentsDtsTypesFilePath(config, outputTarget),
                empty: outputTarget.empty
            });
        }
    });
}
const DEFAULT_DIR = 'dist';
const DEFAULT_BUILD_DIR = '';
const DEFAULT_COLLECTION_DIR = 'collection';
const DEFAULT_TYPES_DIR = 'types';
const DEFAULT_ESM_LOADER_DIR = 'loader';

function validateOutputTargetDistHydrateScript(config) {
    const hasHydrateOutputTarget = config.outputTargets.some(isOutputTargetHydrate);
    if (hasHydrateOutputTarget === false) {
        // we don't already have a hydrate output target
        // let's still see if we require one because of other output targets
        const hasWwwOutput = config.outputTargets
            .filter(isOutputTargetWww)
            .some(o => typeof o.indexHtml === 'string');
        if (hasWwwOutput && config.flags && config.flags.prerender) {
            // we're prerendering a www output target, so we'll need a hydrate app
            let hydrateDir;
            const distOutput = config.outputTargets.find(isOutputTargetDist);
            if (distOutput != null && typeof distOutput.dir === 'string') {
                hydrateDir = config.sys.path.join(distOutput.dir, 'hydrate');
            }
            else {
                hydrateDir = 'dist/hydrate';
            }
            const hydrateForWwwOutputTarget = {
                type: DIST_HYDRATE_SCRIPT,
                dir: hydrateDir
            };
            config.outputTargets.push(hydrateForWwwOutputTarget);
        }
    }
    const hydrateOutputTargets = config.outputTargets
        .filter(isOutputTargetHydrate);
    hydrateOutputTargets.forEach(outputTarget => {
        if (typeof outputTarget.dir !== 'string') {
            // no directory given, see if we've got a dist to go off of
            outputTarget.dir = 'hydrate';
        }
        if (!config.sys.path.isAbsolute(outputTarget.dir)) {
            outputTarget.dir = config.sys.path.join(config.rootDir, outputTarget.dir);
        }
        if (typeof outputTarget.empty !== 'boolean') {
            outputTarget.empty = true;
        }
    });
}

function validatePrerender(config, diagnostics, outputTarget) {
    if (!config.flags || !config.flags.prerender) {
        return;
    }
    outputTarget.baseUrl = normalizePath(outputTarget.baseUrl);
    if (!outputTarget.baseUrl.startsWith('http://') && !outputTarget.baseUrl.startsWith('https://')) {
        const err = buildError(diagnostics);
        err.messageText = `When prerendering, the "baseUrl" output target config must be a full URL and start with either "http://" or "https://". The config can be updated in the "www" output target within the stencil config.`;
    }
    try {
        new URL_(outputTarget.baseUrl);
    }
    catch (e) {
        const err = buildError(diagnostics);
        err.messageText = `invalid "baseUrl": ${e}`;
    }
    if (!outputTarget.baseUrl.endsWith('/')) {
        outputTarget.baseUrl += '/';
    }
    if (typeof outputTarget.prerenderConfig === 'string') {
        if (!config.sys.path.isAbsolute(outputTarget.prerenderConfig)) {
            outputTarget.prerenderConfig = config.sys.path.join(config.rootDir, outputTarget.prerenderConfig);
        }
    }
}

const HOST_CONFIG_FILENAME = 'host.config.json';

function validateServiceWorker(config, outputTarget) {
    if (config.devMode && !config.flags.serviceWorker) {
        outputTarget.serviceWorker = null;
        return;
    }
    if (outputTarget.serviceWorker === false || outputTarget.serviceWorker === null) {
        outputTarget.serviceWorker = null;
        return;
    }
    if (outputTarget.serviceWorker === true) {
        outputTarget.serviceWorker = {};
    }
    else if (!outputTarget.serviceWorker && config.devMode) {
        outputTarget.serviceWorker = null;
        return;
    }
    if (typeof outputTarget.serviceWorker !== 'object') {
        // what was passed in could have been a boolean
        // in that case let's just turn it into an empty obj so Object.assign doesn't crash
        outputTarget.serviceWorker = {};
    }
    if (!Array.isArray(outputTarget.serviceWorker.globPatterns)) {
        if (typeof outputTarget.serviceWorker.globPatterns === 'string') {
            outputTarget.serviceWorker.globPatterns = [outputTarget.serviceWorker.globPatterns];
        }
        else if (typeof outputTarget.serviceWorker.globPatterns !== 'string') {
            outputTarget.serviceWorker.globPatterns = DEFAULT_GLOB_PATTERNS.slice();
        }
    }
    if (typeof outputTarget.serviceWorker.globDirectory !== 'string') {
        outputTarget.serviceWorker.globDirectory = outputTarget.appDir;
    }
    if (typeof outputTarget.serviceWorker.globIgnores === 'string') {
        outputTarget.serviceWorker.globIgnores = [outputTarget.serviceWorker.globIgnores];
    }
    outputTarget.serviceWorker.globIgnores = outputTarget.serviceWorker.globIgnores || [];
    addGlobIgnores(config, outputTarget.serviceWorker.globIgnores);
    outputTarget.serviceWorker.dontCacheBustURLsMatching = /p-\w{8}/;
    if (!outputTarget.serviceWorker.swDest) {
        outputTarget.serviceWorker.swDest = config.sys.path.join(outputTarget.appDir, DEFAULT_FILENAME);
    }
    if (!config.sys.path.isAbsolute(outputTarget.serviceWorker.swDest)) {
        outputTarget.serviceWorker.swDest = config.sys.path.join(outputTarget.appDir, outputTarget.serviceWorker.swDest);
    }
}
function addGlobIgnores(config, globIgnores) {
    globIgnores.push(`**/${HOST_CONFIG_FILENAME}`, `**/*.system.entry.js`, `**/*.system.js`, `**/${config.fsNamespace}.js`, `**/${config.fsNamespace}.esm.js`, `**/${config.fsNamespace}.css`);
}
const DEFAULT_GLOB_PATTERNS = [
    '*.html',
    '**/*.{js,css,json}',
];
const DEFAULT_FILENAME = 'sw.js';

function validateOutputTargetWww(config, diagnostics) {
    const hasOutputTargets = Array.isArray(config.outputTargets);
    const hasE2eTests = !!(config.flags && config.flags.e2e);
    if (!hasOutputTargets || (hasE2eTests && !config.outputTargets.some(isOutputTargetWww)) && !config.outputTargets.some(isOutputTargetDist)) {
        config.outputTargets = [
            { type: WWW }
        ];
    }
    const wwwOutputTargets = config.outputTargets.filter(isOutputTargetWww);
    if (config.flags.prerender && wwwOutputTargets.length === 0) {
        const err = buildError(diagnostics);
        err.messageText = `You need at least one "www" output target configured in your stencil.config.ts, when the "--prerender" flag is used`;
    }
    wwwOutputTargets.forEach(outputTarget => {
        validateOutputTarget(config, diagnostics, outputTarget);
    });
}
function validateOutputTarget(config, diagnostics, outputTarget) {
    const path = config.sys.path;
    setStringConfig(outputTarget, 'baseUrl', '/');
    setStringConfig(outputTarget, 'dir', DEFAULT_DIR$1);
    if (!path.isAbsolute(outputTarget.dir)) {
        outputTarget.dir = path.join(config.rootDir, outputTarget.dir);
    }
    // Make sure the baseUrl always finish with "/"
    if (!outputTarget.baseUrl.endsWith('/')) {
        outputTarget.baseUrl += '/';
    }
    // Fix "dir" to account
    outputTarget.appDir = path.join(outputTarget.dir, getPathName(outputTarget.baseUrl));
    setStringConfig(outputTarget, 'buildDir', DEFAULT_BUILD_DIR$1);
    if (!path.isAbsolute(outputTarget.buildDir)) {
        outputTarget.buildDir = path.join(outputTarget.appDir, outputTarget.buildDir);
    }
    setStringConfig(outputTarget, 'indexHtml', DEFAULT_INDEX_HTML);
    if (!path.isAbsolute(outputTarget.indexHtml)) {
        outputTarget.indexHtml = path.join(outputTarget.appDir, outputTarget.indexHtml);
    }
    setBooleanConfig(outputTarget, 'empty', null, DEFAULT_EMPTY_DIR);
    validatePrerender(config, diagnostics, outputTarget);
    validateServiceWorker(config, outputTarget);
    if (outputTarget.polyfills === undefined) {
        outputTarget.polyfills = true;
    }
    outputTarget.polyfills = !!outputTarget.polyfills;
    // Add dist-lazy output target
    const buildDir = outputTarget.buildDir;
    config.outputTargets.push({
        type: DIST_LAZY,
        esmDir: buildDir,
        systemDir: config.buildEs5 ? buildDir : undefined,
        systemLoaderFile: config.buildEs5 ? config.sys.path.join(buildDir, `${config.fsNamespace}.js`) : undefined,
        polyfills: outputTarget.polyfills,
        isBrowserBuild: true,
    });
    // Copy for dist
    config.outputTargets.push({
        type: COPY,
        dir: buildDir,
        copyAssets: 'dist'
    });
    // Copy for www
    config.outputTargets.push({
        type: COPY,
        dir: outputTarget.appDir,
        copy: validateCopy(outputTarget.copy, [
            ...(config.copy || []),
            ...DEFAULT_WWW_COPY,
        ]),
    });
    // Generate global style with original name
    config.outputTargets.push({
        type: DIST_GLOBAL_STYLES,
        file: config.sys.path.join(buildDir, `${config.fsNamespace}.css`),
    });
}
function getPathName(url) {
    const parsedUrl = new URL_(url, 'http://localhost/');
    return parsedUrl.pathname;
}
const DEFAULT_WWW_COPY = [
    { src: 'assets', warn: false },
    { src: 'manifest.json', warn: false }
];
const DEFAULT_DIR$1 = 'www';
const DEFAULT_INDEX_HTML = 'index.html';
const DEFAULT_BUILD_DIR$1 = 'build';
const DEFAULT_EMPTY_DIR = true;

function validateOutputTargetDistModule(config) {
    const path = config.sys.path;
    const moduleOutputTargets = config.outputTargets.filter(isOutputTargetDistModule);
    moduleOutputTargets.forEach(outputTarget => {
        if (!outputTarget.dir) {
            outputTarget.dir = DEFAULT_DIR$2;
        }
        if (!path.isAbsolute(outputTarget.dir)) {
            outputTarget.dir = normalizePath(path.join(config.rootDir, outputTarget.dir));
        }
        if (typeof outputTarget.empty !== 'boolean') {
            outputTarget.empty = true;
        }
        outputTarget.copy = validateCopy(outputTarget.copy);
        if (outputTarget.copy.length > 0) {
            config.outputTargets.push({
                type: COPY,
                dir: outputTarget.dir,
                copy: [
                    ...outputTarget.copy
                ]
            });
        }
    });
}
const DEFAULT_DIR$2 = 'dist/module/';

function validateOutputTargetAngular(config) {
    const angularOutputTargets = config.outputTargets.filter(isOutputTargetAngular);
    angularOutputTargets.forEach(outputTarget => {
        outputTarget.excludeComponents = outputTarget.excludeComponents || [];
        if (outputTarget.directivesProxyFile && !config.sys.path.isAbsolute(outputTarget.directivesProxyFile)) {
            outputTarget.directivesProxyFile = normalizePath(config.sys.path.join(config.rootDir, outputTarget.directivesProxyFile));
        }
        if (outputTarget.directivesArrayFile && !config.sys.path.isAbsolute(outputTarget.directivesArrayFile)) {
            outputTarget.directivesArrayFile = normalizePath(config.sys.path.join(config.rootDir, outputTarget.directivesArrayFile));
        }
        if (outputTarget.directivesUtilsFile && !config.sys.path.isAbsolute(outputTarget.directivesUtilsFile)) {
            outputTarget.directivesUtilsFile = normalizePath(config.sys.path.join(config.rootDir, outputTarget.directivesUtilsFile));
        }
    });
}

function validateDocs(config, diagnostics) {
    config.outputTargets = config.outputTargets || [];
    let buildDocs = !config.devMode;
    // json docs flag
    if (typeof config.flags.docsJson === 'string') {
        buildDocs = true;
        config.outputTargets.push({
            type: 'docs-json',
            file: config.flags.docsJson
        });
    }
    const jsonDocsOutputs = config.outputTargets.filter(isOutputTargetDocsJson);
    jsonDocsOutputs.forEach(jsonDocsOutput => {
        validateJsonDocsOutputTarget(config, diagnostics, jsonDocsOutput);
    });
    // readme docs flag
    if (config.flags.docs) {
        buildDocs = true;
        if (!config.outputTargets.some(isOutputTargetDocsReadme)) {
            // didn't provide a docs config, so let's add one
            config.outputTargets.push({ type: 'docs-readme' });
        }
    }
    const readmeDocsOutputs = config.outputTargets.filter(isOutputTargetDocsReadme);
    readmeDocsOutputs.forEach(readmeDocsOutput => {
        validateReadmeOutputTarget(config, diagnostics, readmeDocsOutput);
    });
    // custom docs
    const customDocsOutputs = config.outputTargets.filter(isOutputTargetDocsCustom);
    customDocsOutputs.forEach(jsonDocsOutput => {
        validateCustomDocsOutputTarget(diagnostics, jsonDocsOutput);
    });
    config.buildDocs = buildDocs;
}
function validateReadmeOutputTarget(config, diagnostics, outputTarget) {
    if (outputTarget.type === 'docs') {
        diagnostics.push({
            type: 'config',
            level: 'warn',
            header: 'Deprecated "docs"',
            messageText: `The output target { type: "docs" } has been deprecated, please use "docs-readme" instead.`,
            absFilePath: config.configPath
        });
        outputTarget.type = 'docs-readme';
    }
    if (typeof outputTarget.dir !== 'string') {
        outputTarget.dir = config.srcDir;
    }
    if (!config.sys.path.isAbsolute(outputTarget.dir)) {
        outputTarget.dir = config.sys.path.join(config.rootDir, outputTarget.dir);
    }
    if (outputTarget.footer == null) {
        outputTarget.footer = NOTE;
    }
    outputTarget.strict = !!outputTarget.strict;
}
function validateJsonDocsOutputTarget(config, diagnostics, outputTarget) {
    if (typeof outputTarget.file !== 'string') {
        const err = buildError(diagnostics);
        err.messageText = `docs-json outputTarget missing the "file" option`;
    }
    outputTarget.file = config.sys.path.join(config.rootDir, outputTarget.file);
    if (typeof outputTarget.typesFile === 'string') {
        outputTarget.typesFile = config.sys.path.join(config.rootDir, outputTarget.typesFile);
    }
    else if (outputTarget.typesFile !== null && outputTarget.file.endsWith('.json')) {
        outputTarget.typesFile = outputTarget.file.replace(/\.json$/, '.d.ts');
    }
    outputTarget.strict = !!outputTarget.strict;
}
function validateCustomDocsOutputTarget(diagnostics, outputTarget) {
    if (typeof outputTarget.generator !== 'function') {
        const err = buildError(diagnostics);
        err.messageText = `docs-custom outputTarget missing the "generator" function`;
    }
    outputTarget.strict = !!outputTarget.strict;
}

function validateOutputTargets(config, diagnostics) {
    // setup outputTargets from deprecated config properties
    if (Array.isArray(config.outputTargets)) {
        config.outputTargets.forEach(outputTarget => {
            if (typeof outputTarget.type !== 'string') {
                outputTarget.type = WWW;
            }
            outputTarget.type = outputTarget.type.trim().toLowerCase();
            if (!VALID_TYPES.includes(outputTarget.type)) {
                const err = buildError(diagnostics);
                err.messageText = `invalid outputTarget type "${outputTarget.type}". Valid outputTarget types include: ${VALID_TYPES.map(t => `"${t}"`).join(', ')}`;
            }
        });
    }
    validateOutputTargetWww(config, diagnostics);
    validateOutputTargetDist(config);
    validateOutputTargetAngular(config);
    validateOutputTargetDistHydrateScript(config);
    validateOutputTargetDistModule(config);
    validateDocs(config, diagnostics);
    validateOutputStats(config);
    if (!config.outputTargets || config.outputTargets.length === 0) {
        const err = buildError(diagnostics);
        err.messageText = `outputTarget required`;
    }
}

function validatePaths(config) {
    const path = config.sys.path;
    if (typeof config.globalScript === 'string' && !path.isAbsolute(config.globalScript)) {
        if (!path.isAbsolute(config.globalScript)) {
            config.globalScript = path.join(config.rootDir, config.globalScript);
        }
        config.globalScript = normalizePath(config.globalScript);
    }
    if (typeof config.globalStyle === 'string') {
        if (!path.isAbsolute(config.globalStyle)) {
            config.globalStyle = path.join(config.rootDir, config.globalStyle);
        }
        config.globalStyle = normalizePath(config.globalStyle);
    }
    setStringConfig(config, 'srcDir', DEFAULT_SRC_DIR);
    if (!path.isAbsolute(config.srcDir)) {
        config.srcDir = path.join(config.rootDir, config.srcDir);
    }
    config.srcDir = normalizePath(config.srcDir);
    setStringConfig(config, 'cacheDir', DEFAULT_CACHE_DIR);
    if (!path.isAbsolute(config.cacheDir)) {
        config.cacheDir = path.join(config.rootDir, config.cacheDir);
    }
    config.cacheDir = normalizePath(config.cacheDir);
    if (typeof config.tsconfig === 'string') {
        if (!path.isAbsolute(config.tsconfig)) {
            config.tsconfig = path.join(config.rootDir, config.tsconfig);
        }
    }
    else {
        config.tsconfig = ts$1__default.findConfigFile(config.rootDir, ts$1__default.sys.fileExists);
    }
    if (typeof config.tsconfig === 'string') {
        config.tsconfig = normalizePath(config.tsconfig);
    }
    setStringConfig(config, 'srcIndexHtml', normalizePath(path.join(config.srcDir, DEFAULT_INDEX_HTML$1)));
    if (!path.isAbsolute(config.srcIndexHtml)) {
        config.srcIndexHtml = path.join(config.rootDir, config.srcIndexHtml);
    }
    config.srcIndexHtml = normalizePath(config.srcIndexHtml);
    if (config.writeLog) {
        setStringConfig(config, 'buildLogFilePath', DEFAULT_BUILD_LOG_FILE_NAME);
        if (!path.isAbsolute(config.buildLogFilePath)) {
            config.buildLogFilePath = path.join(config.rootDir, config.buildLogFilePath);
        }
        config.buildLogFilePath = normalizePath(config.buildLogFilePath);
        config.logger.buildLogFilePath = config.buildLogFilePath;
    }
}
const DEFAULT_BUILD_LOG_FILE_NAME = 'stencil-build.log';
const DEFAULT_CACHE_DIR = '.stencil';
const DEFAULT_INDEX_HTML$1 = 'index.html';
const DEFAULT_SRC_DIR = 'src';

function validateTesting(config, diagnostics) {
    const testing = config.testing = config.testing || {};
    if (!config.flags || (!config.flags.e2e && !config.flags.spec)) {
        return;
    }
    if (typeof config.flags.headless === 'boolean') {
        testing.browserHeadless = config.flags.headless;
    }
    else if (typeof testing.browserHeadless !== 'boolean') {
        testing.browserHeadless = true;
    }
    if (!testing.browserWaitUntil) {
        testing.browserWaitUntil = 'load';
    }
    testing.browserArgs = testing.browserArgs || [];
    addOption(testing.browserArgs, '--font-render-hinting=medium');
    if (config.flags.ci) {
        addOption(testing.browserArgs, '--no-sandbox');
        addOption(testing.browserArgs, '--disable-setuid-sandbox');
        addOption(testing.browserArgs, '--disable-dev-shm-usage');
        testing.browserHeadless = true;
    }
    const path = config.sys.path;
    if (typeof testing.rootDir === 'string') {
        if (!path.isAbsolute(testing.rootDir)) {
            testing.rootDir = path.join(config.rootDir, testing.rootDir);
        }
    }
    else {
        testing.rootDir = config.rootDir;
    }
    if (config.flags && typeof config.flags.screenshotConnector === 'string') {
        testing.screenshotConnector = config.flags.screenshotConnector;
    }
    if (typeof testing.screenshotConnector === 'string') {
        if (!path.isAbsolute(testing.screenshotConnector)) {
            testing.screenshotConnector = path.join(config.rootDir, testing.screenshotConnector);
        }
    }
    else {
        testing.screenshotConnector = path.join(config.sys.compiler.packageDir, 'screenshot', 'local-connector.js');
    }
    if (!Array.isArray(testing.testPathIgnorePatterns)) {
        testing.testPathIgnorePatterns = DEFAULT_IGNORE_PATTERNS.map(ignorePattern => {
            return path.join(testing.rootDir, ignorePattern);
        });
        config.outputTargets.filter(o => (isOutputTargetDist(o) || isOutputTargetWww(o)) && o.dir).forEach((outputTarget) => {
            testing.testPathIgnorePatterns.push(outputTarget.dir);
        });
    }
    if (typeof testing.preset !== 'string') {
        testing.preset = path.join(config.sys.compiler.packageDir, 'testing');
    }
    else if (!path.isAbsolute(testing.preset)) {
        testing.preset = path.join(config.configPath, testing.preset);
    }
    if (!Array.isArray(testing.setupFilesAfterEnv)) {
        testing.setupFilesAfterEnv = [];
    }
    testing.setupFilesAfterEnv.unshift(path.join(config.sys.compiler.packageDir, 'testing', 'jest-setuptestframework.js'));
    if (testing.setupTestFrameworkScriptFile) {
        const err = buildWarn(diagnostics);
        err.messageText = `setupTestFrameworkScriptFile has been deprecated.`;
    }
    if (typeof testing.testEnvironment === 'string') {
        if (!path.isAbsolute(testing.testEnvironment)) {
            testing.testEnvironment = path.join(config.configPath, testing.testEnvironment);
        }
    }
    if (typeof testing.allowableMismatchedPixels === 'number') {
        if (testing.allowableMismatchedPixels < 0) {
            const err = buildError(diagnostics);
            err.messageText = `allowableMismatchedPixels must be a value that is 0 or greater`;
        }
    }
    else {
        testing.allowableMismatchedPixels = DEFAULT_ALLOWABLE_MISMATCHED_PIXELS;
    }
    if (typeof testing.allowableMismatchedRatio === 'number') {
        if (testing.allowableMismatchedRatio < 0 || testing.allowableMismatchedRatio > 1) {
            const err = buildError(diagnostics);
            err.messageText = `allowableMismatchedRatio must be a value ranging from 0 to 1`;
        }
    }
    if (typeof testing.pixelmatchThreshold === 'number') {
        if (testing.pixelmatchThreshold < 0 || testing.pixelmatchThreshold > 1) {
            const err = buildError(diagnostics);
            err.messageText = `pixelmatchThreshold must be a value ranging from 0 to 1`;
        }
    }
    else {
        testing.pixelmatchThreshold = DEFAULT_PIXEL_MATCH_THRESHOLD;
    }
    if (testing.testRegex === undefined) {
        testing.testRegex = '(/__tests__/.*|\\.?(test|spec|e2e))\\.(tsx?|ts?|jsx?|js?)$';
    }
    if (Array.isArray(testing.testMatch)) {
        delete testing.testRegex;
    }
    else if (typeof testing.testRegex === 'string') {
        delete testing.testMatch;
    }
    if (typeof testing.runner !== 'string') {
        testing.runner = path.join(config.sys.compiler.packageDir, 'testing', 'jest-runner.js');
    }
    if (typeof testing.waitBeforeScreenshot === 'number') {
        if (testing.waitBeforeScreenshot < 0) {
            const err = buildError(diagnostics);
            err.messageText = `waitBeforeScreenshot must be a value that is 0 or greater`;
        }
    }
    else {
        testing.waitBeforeScreenshot = 10;
    }
    if (!Array.isArray(testing.emulate) || testing.emulate.length === 0) {
        testing.emulate = [
            {
                userAgent: 'default',
                viewport: {
                    width: 600,
                    height: 600,
                    deviceScaleFactor: 1,
                    isMobile: false,
                    hasTouch: false,
                    isLandscape: false,
                }
            }
        ];
    }
}
function addOption(setArray, option) {
    if (!setArray.includes(option)) {
        setArray.push(option);
    }
}
const DEFAULT_ALLOWABLE_MISMATCHED_PIXELS = 100;
const DEFAULT_PIXEL_MATCH_THRESHOLD = 0.1;
const DEFAULT_IGNORE_PATTERNS = [
    '.vscode',
    '.stencil',
    'node_modules',
];

function validateWorkers(config) {
    let cpus = 1;
    if (config.sys && config.sys.details && typeof config.sys.details.cpus === 'number') {
        cpus = config.sys.details.cpus;
    }
    if (typeof config.maxConcurrentWorkers !== 'number') {
        config.maxConcurrentWorkers = cpus;
    }
    if (config.flags) {
        if (typeof config.flags.maxWorkers === 'number') {
            config.maxConcurrentWorkers = config.flags.maxWorkers;
        }
        else if (config.flags.ci) {
            config.maxConcurrentWorkers = DEFAULT_CI_MAX_WORKERS;
        }
    }
    config.maxConcurrentWorkers = Math.max(Math.min(config.maxConcurrentWorkers, cpus), 1);
    if (typeof config.maxConcurrentTasksPerWorker !== 'number') {
        config.maxConcurrentTasksPerWorker = DEFAULT_MAX_TASKS_PER_WORKER;
    }
    config.maxConcurrentTasksPerWorker = Math.max(Math.min(config.maxConcurrentTasksPerWorker, 20), 1);
}
const DEFAULT_MAX_TASKS_PER_WORKER = 2;
const DEFAULT_CI_MAX_WORKERS = 4;

function validatePlugins(config, diagnostics) {
    setArrayConfig(config, 'plugins');
    const rollupPlugins = getRollupPlugins(config.plugins);
    const hasResolveNode = config.plugins.some(p => p.name === 'node-resolve');
    const hasCommonjs = config.plugins.some(p => p.name === 'commonjs');
    if (hasCommonjs) {
        const warn = buildWarn(diagnostics);
        warn.messageText = `Stencil already uses "rollup-plugin-commonjs", please remove it from your "stencil.config.ts" plugins.
    You can configure the commonjs settings using the "commonjs" property in "stencil.config.ts`;
    }
    if (hasResolveNode) {
        const warn = buildWarn(diagnostics);
        warn.messageText = `Stencil already uses "rollup-plugin-commonjs", please remove it from your "stencil.config.ts" plugins.
    You can configure the commonjs settings using the "commonjs" property in "stencil.config.ts`;
    }
    config.rollupPlugins = rollupPlugins.filter(({ name }) => name !== 'node-resolve' && name !== 'commonjs');
    config.plugins = getPlugins(config.plugins);
}
function getPlugins(plugins) {
    return plugins.filter(plugin => {
        return !!(plugin && typeof plugin === 'object' && plugin.pluginType);
    });
}
function getRollupPlugins(plugins) {
    return plugins.filter(plugin => {
        return !!(plugin && typeof plugin === 'object' && !plugin.pluginType);
    });
}

async function validateOutputTargetCustom(config, diagnostics) {
    const customOutputTargets = config.outputTargets.filter(isOutputTargetCustom);
    await Promise.all(customOutputTargets.map(async (outputTarget) => {
        if (outputTarget.validate) {
            const localDiagnostics = [];
            try {
                outputTarget.validate(config, diagnostics);
            }
            catch (e) {
                catchError(diagnostics, e);
            }
            diagnostics.push(...localDiagnostics);
        }
    }));
}

function validateConfig(config, diagnostics, setEnvVariables) {
    if (config == null) {
        throw new Error(`invalid build config`);
    }
    if (config._isValidated) {
        // don't bother if we've already validated this config
        return config;
    }
    if (typeof config.rootDir !== 'string') {
        throw new Error('config.rootDir required');
    }
    config.flags = config.flags || {};
    if (config.flags.debug || config.flags.verbose) {
        config.logLevel = 'debug';
    }
    else if (config.flags.logLevel) {
        config.logLevel = config.flags.logLevel;
    }
    else if (typeof config.logLevel !== 'string') {
        config.logLevel = 'info';
    }
    config.logger.level = config.logLevel;
    setBooleanConfig(config, 'writeLog', 'log', false);
    setBooleanConfig(config, 'buildAppCore', null, true);
    // default devMode false
    if (config.flags.prod) {
        config.devMode = false;
    }
    else if (config.flags.dev) {
        config.devMode = true;
    }
    else {
        setBooleanConfig(config, 'devMode', null, DEFAULT_DEV_MODE);
    }
    // Default copy
    config.copy = config.copy || [];
    // get a good namespace
    validateNamespace(config, diagnostics);
    // figure out all of the config paths and absolute paths
    validatePaths(config);
    // validate how many workers we can use
    validateWorkers(config);
    // default devInspector to whatever devMode is
    setBooleanConfig(config, 'devInspector', null, config.devMode);
    // default watch false
    setBooleanConfig(config, 'watch', 'watch', false);
    setBooleanConfig(config, 'minifyCss', null, !config.devMode);
    setBooleanConfig(config, 'minifyJs', null, !config.devMode);
    setBooleanConfig(config, 'buildEs5', 'es5', !config.devMode);
    setBooleanConfig(config, 'buildDist', 'esm', !config.devMode || config.buildEs5);
    setBooleanConfig(config, 'profile', 'profile', config.devMode);
    // setup the outputTargets
    validateOutputTargets(config, diagnostics);
    if (!config._isTesting) {
        validateDistNamespace(config, diagnostics);
    }
    if (typeof config.validateTypes !== 'boolean') {
        config.validateTypes = true;
    }
    setBooleanConfig(config, 'hashFileNames', null, !config.devMode);
    setNumberConfig(config, 'hashedFileNameLength', null, DEFAULT_HASHED_FILENAME_LENTH);
    if (config.hashFileNames) {
        if (config.hashedFileNameLength < MIN_HASHED_FILENAME_LENTH) {
            const err = buildError(diagnostics);
            err.messageText = `config.hashedFileNameLength must be at least ${MIN_HASHED_FILENAME_LENTH} characters`;
        }
        if (config.hashedFileNameLength > MAX_HASHED_FILENAME_LENTH) {
            const err = buildError(diagnostics);
            err.messageText = `config.hashedFileNameLength cannot be more than ${MAX_HASHED_FILENAME_LENTH} characters`;
        }
    }
    validateDevServer(config, diagnostics);
    if (!config.watchIgnoredRegex) {
        config.watchIgnoredRegex = DEFAULT_WATCH_IGNORED_REGEX;
    }
    setBooleanConfig(config, 'generateDocs', 'docs', false);
    setBooleanConfig(config, 'enableCache', 'cache', true);
    if (!Array.isArray(config.includeSrc)) {
        config.includeSrc = DEFAULT_INCLUDES.map(include => {
            return config.sys.path.join(config.srcDir, include);
        });
    }
    if (!Array.isArray(config.excludeSrc)) {
        config.excludeSrc = DEFAULT_EXCLUDES.map(include => {
            return config.sys.path.join(config.srcDir, include);
        });
    }
    validatePlugins(config, diagnostics);
    setArrayConfig(config, 'bundles');
    config.bundles = sortBy(config.bundles, (a) => a.components.length);
    // set to true so it doesn't bother going through all this again on rebuilds
    config._isValidated = true;
    if (setEnvVariables !== false) {
        setProcessEnvironment(config);
    }
    validateRollupConfig(config);
    validateTesting(config, diagnostics);
    validateOutputTargetCustom(config, diagnostics);
    return config;
}
function setProcessEnvironment(config) {
    if (typeof process !== 'undefined' && process.env) {
        process.env.NODE_ENV = config.devMode ? 'development' : 'production';
    }
}
const DEFAULT_DEV_MODE = false;
const DEFAULT_HASHED_FILENAME_LENTH = 8;
const MIN_HASHED_FILENAME_LENTH = 4;
const MAX_HASHED_FILENAME_LENTH = 32;
const DEFAULT_INCLUDES = ['**/*.ts', '**/*.tsx'];
const DEFAULT_EXCLUDES = ['**/test/**'];
const DEFAULT_WATCH_IGNORED_REGEX = /(?:^|[\\\/])(\.(?!\.)[^\\\/]+)$/i;

function configFileReload(config, compilerCtx) {
    try {
        const updatedConfig = config.sys.loadConfigFile(config.configPath);
        configReload(config, updatedConfig);
        // reset the compiler context cache
        compilerCtx.reset();
    }
    catch (e) {
        config.logger.error(e);
    }
}
function configReload(config, updatedConfig) {
    const keepers = {};
    // empty it out cuz we're gonna use the same object
    // but don't remove our keepers, we still need them
    for (const key in config) {
        if (CONFIG_RELOAD_KEEPER_KEYS.includes(key)) {
            keepers[key] = config[key];
        }
        else {
            delete config[key];
        }
    }
    // fill it up with the newly loaded config
    // but don't touch our "keepers"
    for (const key in updatedConfig) {
        if (!CONFIG_RELOAD_KEEPER_KEYS.includes(key)) {
            config[key] = updatedConfig[key];
        }
    }
    config._isValidated = false;
    // validate our new config data
    validateConfig(config, [], false);
    // ensure we're using the correct original config data
    for (const key in keepers) {
        config[key] = keepers[key];
    }
}
// stuff that should be constant between config updates
// implementing the Config interface to make sure we're
// using the correct keys, but the value doesn't matter here
const CONFIG_RELOAD_KEEPERS = {
    flags: null,
    cwd: null,
    logger: null,
    rootDir: null,
    sys: null,
    watch: null
};
const CONFIG_RELOAD_KEEPER_KEYS = Object.keys(CONFIG_RELOAD_KEEPERS);

function generateBuildFromFsWatch(config, compilerCtx) {
    const buildCtx = new BuildContext(config, compilerCtx);
    // copy watch results over to build ctx data
    // also add in any active build data that
    // hasn't gone though a full build yet
    buildCtx.filesAdded = unique(compilerCtx.activeFilesAdded);
    buildCtx.filesDeleted = unique(compilerCtx.activeFilesDeleted);
    buildCtx.filesUpdated = unique(compilerCtx.activeFilesUpdated);
    buildCtx.dirsAdded = unique(compilerCtx.activeDirsAdded);
    buildCtx.dirsDeleted = unique(compilerCtx.activeDirsDeleted);
    // recursively drill down through any directories added and fill up more data
    buildCtx.dirsAdded.forEach(dirAdded => {
        addDir(config, compilerCtx, buildCtx, dirAdded);
    });
    // files changed include updated, added and deleted
    buildCtx.filesChanged = filesChanged(buildCtx);
    // collect all the scripts that were added/deleted
    buildCtx.scriptsAdded = scriptsAdded(config, buildCtx);
    buildCtx.scriptsDeleted = scriptsDeleted(config, buildCtx);
    buildCtx.hasScriptChanges = hasScriptChanges(buildCtx);
    // collect all the styles that were added/deleted
    buildCtx.hasStyleChanges = hasStyleChanges(buildCtx);
    // figure out if any changed files were index.html files
    buildCtx.hasHtmlChanges = hasHtmlChanges(config, buildCtx);
    buildCtx.hasServiceWorkerChanges = hasServiceWorkerChanges(config, buildCtx);
    // we've got watch results, which means this is a rebuild!!
    buildCtx.isRebuild = true;
    // always require a full rebuild if we've never had a successful build
    buildCtx.requiresFullBuild = !compilerCtx.hasSuccessfulBuild;
    // figure out if one of the changed files is the config
    checkForConfigUpdates(config, compilerCtx, buildCtx);
    // return our new build context that'll be used for the next build
    return buildCtx;
}
function addDir(config, compilerCtx, buildCtx, dir) {
    dir = normalizePath(dir);
    if (!buildCtx.dirsAdded.includes(dir)) {
        buildCtx.dirsAdded.push(dir);
    }
    const items = compilerCtx.fs.disk.readdirSync(dir);
    items.forEach(dirItem => {
        const itemPath = normalizePath(config.sys.path.join(dir, dirItem));
        const stat = compilerCtx.fs.disk.statSync(itemPath);
        if (stat.isDirectory()) {
            addDir(config, compilerCtx, buildCtx, itemPath);
        }
        else if (stat.isFile()) {
            if (!buildCtx.filesAdded.includes(itemPath)) {
                buildCtx.filesAdded.push(itemPath);
            }
        }
    });
}
function filesChanged(buildCtx) {
    // files changed include updated, added and deleted
    return unique([
        ...buildCtx.filesUpdated,
        ...buildCtx.filesAdded,
        ...buildCtx.filesDeleted
    ]).sort();
}
function scriptsAdded(config, buildCtx) {
    // collect all the scripts that were added
    return buildCtx.filesAdded.filter(f => {
        return SCRIPT_EXT.some(ext => f.endsWith(ext.toLowerCase()));
    }).map(f => config.sys.path.basename(f));
}
function scriptsDeleted(config, buildCtx) {
    // collect all the scripts that were deleted
    return buildCtx.filesDeleted.filter(f => {
        return SCRIPT_EXT.some(ext => f.endsWith(ext.toLowerCase()));
    }).map(f => config.sys.path.basename(f));
}
function hasScriptChanges(buildCtx) {
    return buildCtx.filesChanged.some(f => {
        const ext = getExt(f);
        return SCRIPT_EXT.includes(ext);
    });
}
function hasStyleChanges(buildCtx) {
    return buildCtx.filesChanged.some(f => {
        const ext = getExt(f);
        return STYLE_EXT.includes(ext);
    });
}
function getExt(filePath) {
    return filePath.split('.').pop().toLowerCase();
}
const SCRIPT_EXT = ['ts', 'tsx', 'js', 'jsx'];
const STYLE_EXT = ['css', 'scss', 'sass', 'pcss', 'styl', 'stylus', 'less'];
function hasHtmlChanges(config, buildCtx) {
    const anyHtmlChanged = buildCtx.filesChanged.some(f => f.toLowerCase().endsWith('.html'));
    if (anyHtmlChanged) {
        // any *.html in any directory that changes counts and rebuilds
        return true;
    }
    const srcIndexHtmlChanged = buildCtx.filesChanged.some(fileChanged => {
        // the src index index.html file has changed
        // this file name could be something other than index.html
        return fileChanged === config.srcIndexHtml;
    });
    return srcIndexHtmlChanged;
}
function checkForConfigUpdates(config, compilerCtx, buildCtx) {
    // figure out if one of the changed files is the config
    if (buildCtx.filesChanged.some(f => f === config.configPath)) {
        buildCtx.debug(`reload config file: ${config.sys.path.relative(config.rootDir, config.configPath)}`);
        configFileReload(config, compilerCtx);
        buildCtx.requiresFullBuild = true;
    }
}
function updateCacheFromRebuild(compilerCtx, buildCtx) {
    buildCtx.filesChanged.forEach(filePath => {
        compilerCtx.fs.clearFileCache(filePath);
    });
    buildCtx.dirsAdded.forEach(dirAdded => {
        compilerCtx.fs.clearDirCache(dirAdded);
    });
    buildCtx.dirsDeleted.forEach(dirDeleted => {
        compilerCtx.fs.clearDirCache(dirDeleted);
    });
}

function logFsWatchMessage(config, buildCtx) {
    const msg = getMessage(config, buildCtx);
    if (msg.length > 0) {
        config.logger.info(config.logger.cyan(msg.join(', ')));
    }
}
function getMessage(config, buildCtx) {
    const msgs = [];
    const filesChanged = buildCtx.filesChanged;
    if (filesChanged.length > MAX_FILE_PRINT) {
        const trimmedChangedFiles = filesChanged.slice(0, MAX_FILE_PRINT - 1);
        const otherFilesTotal = filesChanged.length - trimmedChangedFiles.length;
        let msg = `changed files: ${getBaseName(config, trimmedChangedFiles)}`;
        if (otherFilesTotal > 0) {
            msg += `, +${otherFilesTotal} other${otherFilesTotal > 1 ? 's' : ''}`;
        }
        msgs.push(msg);
    }
    else if (filesChanged.length > 1) {
        msgs.push(`changed files: ${getBaseName(config, filesChanged)}`);
    }
    else if (filesChanged.length > 0) {
        msgs.push(`changed file: ${getBaseName(config, filesChanged)}`);
    }
    if (buildCtx.dirsAdded.length > 1) {
        msgs.push(`added directories: ${getBaseName(config, buildCtx.dirsAdded)}`);
    }
    else if (buildCtx.dirsAdded.length > 0) {
        msgs.push(`added directory: ${getBaseName(config, buildCtx.dirsAdded)}`);
    }
    if (buildCtx.dirsDeleted.length > 1) {
        msgs.push(`deleted directories: ${getBaseName(config, buildCtx.dirsDeleted)}`);
    }
    else if (buildCtx.dirsDeleted.length > 0) {
        msgs.push(`deleted directory: ${getBaseName(config, buildCtx.dirsDeleted)}`);
    }
    return msgs;
}
function getBaseName(config, items) {
    return items.map(f => config.sys.path.relative(config.srcDir, f)).join(', ');
}
const MAX_FILE_PRINT = 5;

function sendMsg(process, msg) {
    process.send(msg);
}

/**
 * NODE ONLY!
 * NOTE! this method is still apart of the main bundle
 * it is not apart of the dev-server/index.js bundle
 */
async function startDevServerMain(config, compilerCtx) {
    const fork = require('child_process').fork;
    // using the path stuff below because after the the bundles are created
    // then these files are no longer relative to how they are in the src directory
    config.devServer.devServerDir = config.sys.path.join(__dirname, '..', 'dev-server');
    // get the path of the dev server module
    const program = require.resolve(config.sys.path.join(config.devServer.devServerDir, 'index.js'));
    const args = [];
    const filteredExecArgs = process.execArgv.filter(v => !/^--(debug|inspect)/.test(v));
    const options = {
        execArgv: filteredExecArgs,
        env: process.env,
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    };
    // start a new child process of the CLI process
    // for the http and web socket server
    const serverProcess = fork(program, args, options);
    const devServerConfig = await startServer(config, compilerCtx, serverProcess);
    const devServer = {
        browserUrl: devServerConfig.browserUrl,
        close: () => {
            try {
                serverProcess.kill('SIGINT');
                config.logger.debug(`dev server closed`);
            }
            catch (e) { }
            return Promise.resolve();
        }
    };
    return devServer;
}
function startServer(config, compilerCtx, serverProcess) {
    return new Promise((resolve, reject) => {
        serverProcess.stdout.on('data', (data) => {
            // the child server process has console logged data
            config.logger.debug(`dev server: ${data}`);
        });
        serverProcess.stderr.on('data', (data) => {
            // the child server process has console logged an error
            reject(`dev server error: ${data}`);
        });
        serverProcess.on('message', (msg) => {
            // main process has received a message from the child server process
            mainReceivedMessageFromWorker(config, compilerCtx, serverProcess, msg, resolve);
        });
        compilerCtx.events.subscribe('buildFinish', buildResults => {
            // a compiler build has finished
            // send the build results to the child server process
            const msg = {
                buildResults: Object.assign({}, buildResults)
            };
            delete msg.buildResults.entries;
            delete msg.buildResults.components;
            sendMsg(serverProcess, msg);
        });
        compilerCtx.events.subscribe('buildLog', buildLog => {
            const msg = {
                buildLog: Object.assign({}, buildLog)
            };
            sendMsg(serverProcess, msg);
        });
        // have the main process send a message to the child server process
        // to start the http and web socket server
        sendMsg(serverProcess, {
            startServer: config.devServer
        });
        return config.devServer;
    });
}
function mainReceivedMessageFromWorker(config, compilerCtx, serverProcess, msg, resolve) {
    if (msg.serverStated) {
        // received a message from the child process that the server has successfully started
        if (config.devServer.openBrowser && msg.serverStated.initialLoadUrl) {
            config.sys.open(msg.serverStated.initialLoadUrl);
        }
        // resolve that everything is good to go
        resolve(msg.serverStated);
        return;
    }
    if (msg.requestBuildResults) {
        // we received a request to send up the latest build results
        if (compilerCtx.lastBuildResults != null) {
            // we do have build results, so let's send them to the child process
            // but don't send any previous live reload data
            const msg = {
                buildResults: Object.assign({}, compilerCtx.lastBuildResults),
                isActivelyBuilding: compilerCtx.isActivelyBuilding
            };
            delete msg.buildResults.hmr;
            delete msg.buildResults.entries;
            delete msg.buildResults.components;
            serverProcess.send(msg);
        }
        else {
            const msg = {
                isActivelyBuilding: compilerCtx.isActivelyBuilding
            };
            serverProcess.send(msg);
        }
        return;
    }
    if (msg.error) {
        // received a message from the child process that is an error
        config.logger.error(msg.error.message);
        config.logger.debug(msg.error);
        return;
    }
    if (msg.requestLog) {
        const req = msg.requestLog;
        const logger = config.logger;
        let status;
        if (req.status >= 400) {
            status = logger.red(req.method);
        }
        else if (req.status >= 300) {
            status = logger.magenta(req.method);
        }
        else {
            status = logger.cyan(req.method);
        }
        logger.info(logger.dim(`${status} ${req.url}`));
        return;
    }
}

class Compiler {
    constructor(compilerConfig) {
        this.queuedRebuild = false;
        [this.isValid, this.config] = isValid(compilerConfig);
        if (this.isValid) {
            const config = this.config;
            const sys = config.sys;
            const logger = config.logger;
            const details = sys.details;
            const isDebug = (logger.level === 'debug');
            let startupMsg = `${sys.compiler.name} v${sys.compiler.version} `;
            if (details.platform !== 'win32') {
                startupMsg += `💎`;
            }
            if (config.suppressLogs !== true) {
                logger.info(logger.cyan(startupMsg));
                if (sys.semver && sys.semver.prerelease(sys.compiler.version)) {
                    logger.warn(sys.color.yellow(`This is a prerelease build, undocumented changes might happen at any time. Technical support is not available for prereleases, but any assistance testing is appreciated.`));
                }
                if (config.devMode && config.buildEs5) {
                    logger.warn(`Generating ES5 during development is a very task expensive, initial and incremental builds will be much slower. Drop the '--es5' flag and use a modern browser for development.
          If you need ESM output, use the '--esm' flag instead.`);
                }
                if (config.devMode && !config.enableCache) {
                    logger.warn(`Disabling cache during development will slow down incremental builds.`);
                }
                const platformInfo = `${details.platform}, ${details.cpuModel}`;
                const statsInfo = `cpus: ${details.cpus}, freemem: ${Math.round(details.freemem() / 1000000)}MB, totalmem: ${Math.round(details.totalmem / 1000000)}MB`;
                if (isDebug) {
                    logger.debug(platformInfo);
                    logger.debug(statsInfo);
                }
                else if (config.flags && config.flags.ci) {
                    logger.info(platformInfo);
                    logger.info(statsInfo);
                }
                logger.debug(`${details.runtime} ${details.runtimeVersion}`);
                logger.debug(`compiler runtime: ${sys.compiler.runtime}`);
                logger.debug(`compiler build: ${COMPILER_BUILD.id}`);
                logger.debug(`minifyJs: ${config.minifyJs}, minifyCss: ${config.minifyCss}, buildEs5: ${config.buildEs5}`);
            }
            if (sys.initWorkers) {
                const workerOpts = sys.initWorkers(config.maxConcurrentWorkers, config.maxConcurrentTasksPerWorker, logger);
                const workerInfo = `compiler workers: ${workerOpts.maxConcurrentWorkers}, tasks per worker: ${workerOpts.maxConcurrentTasksPerWorker}`;
                if (isDebug) {
                    logger.debug(workerInfo);
                }
                else if (config.flags && config.flags.ci) {
                    logger.info(workerInfo);
                }
            }
            this.ctx = new CompilerContext(config);
            this.on('fsChange', fsWatchResults => {
                this.queueFsChanges(fsWatchResults);
            });
        }
    }
    build() {
        const buildCtx = new BuildContext(this.config, this.ctx);
        buildCtx.start();
        return this.drainBuild(buildCtx);
    }
    rebuild() {
        this.queuedRebuild = false;
        const buildCtx = generateBuildFromFsWatch(this.config, this.ctx);
        if (buildCtx != null) {
            logFsWatchMessage(this.config, buildCtx);
            buildCtx.start();
            updateCacheFromRebuild(this.ctx, buildCtx);
            this.drainBuild(buildCtx);
        }
    }
    async drainBuild(buildCtx) {
        if (this.ctx.isActivelyBuilding) {
            // already running
            return undefined;
        }
        this.ctx.isActivelyBuilding = true;
        let buildResults = undefined;
        let didError = false;
        try {
            // clean
            this.ctx.activeDirsAdded.length = 0;
            this.ctx.activeDirsDeleted.length = 0;
            this.ctx.activeFilesAdded.length = 0;
            this.ctx.activeFilesDeleted.length = 0;
            this.ctx.activeFilesUpdated.length = 0;
            // Run Build
            buildResults = await build(this.config, this.ctx, buildCtx);
            didError = buildResults.hasError;
        }
        catch (e) {
            console.error(e);
            didError = true;
        }
        if (didError) {
            this.ctx.activeDirsAdded.push(...buildCtx.dirsAdded);
            this.ctx.activeDirsDeleted.push(...buildCtx.dirsDeleted);
            this.ctx.activeFilesAdded.push(...buildCtx.filesAdded);
            this.ctx.activeFilesDeleted.push(...buildCtx.filesDeleted);
            this.ctx.activeFilesUpdated.push(...buildCtx.filesUpdated);
        }
        this.ctx.isActivelyBuilding = false;
        if (this.queuedRebuild) {
            this.rebuild();
        }
        return buildResults;
    }
    queueFsChanges(fsWatchResults) {
        this.ctx.activeDirsAdded.push(...fsWatchResults.dirsAdded);
        this.ctx.activeDirsDeleted.push(...fsWatchResults.dirsDeleted);
        this.ctx.activeFilesAdded.push(...fsWatchResults.filesAdded);
        this.ctx.activeFilesDeleted.push(...fsWatchResults.filesDeleted);
        this.ctx.activeFilesUpdated.push(...fsWatchResults.filesUpdated);
        this.queuedRebuild = true;
        if (!this.ctx.isActivelyBuilding) {
            this.rebuild();
        }
    }
    async startDevServer() {
        // start up the dev server
        const devServer = await startDevServerMain(this.config, this.ctx);
        if (devServer != null) {
            // get the browser url to be logged out at the end of the build
            this.config.devServer.browserUrl = devServer.browserUrl;
            this.config.logger.debug(`dev server started: ${devServer.browserUrl}`);
        }
        return devServer;
    }
    on(eventName, cb) {
        return this.ctx.events.subscribe(eventName, cb);
    }
    once(eventName) {
        return new Promise(resolve => {
            const off = this.ctx.events.subscribe(eventName, (...args) => {
                off();
                resolve.apply(this, args);
            });
        });
    }
    off(eventName, cb) {
        this.ctx.events.unsubscribe(eventName, cb);
    }
    trigger(eventName, ...args) {
        const fsWatchResults = {
            dirsAdded: [],
            dirsDeleted: [],
            filesAdded: [],
            filesDeleted: [],
            filesUpdated: []
        };
        switch (eventName) {
            case 'fileUpdate':
                fsWatchResults.filesUpdated.push(normalizePath(args[0]));
                break;
            case 'fileAdd':
                fsWatchResults.filesAdded.push(normalizePath(args[0]));
                break;
            case 'fileDelete':
                fsWatchResults.filesDeleted.push(normalizePath(args[0]));
                break;
            case 'dirAdd':
                fsWatchResults.dirsAdded.push(normalizePath(args[0]));
                break;
            case 'dirDelete':
                fsWatchResults.dirsDeleted.push(normalizePath(args[0]));
                break;
        }
        this.ctx.events.emit('fsChange', fsWatchResults);
        this.ctx.events.emit.apply(this.ctx.events, [eventName, ...args]);
    }
    docs() {
        return docs(this.config, this.ctx);
    }
    get fs() {
        return this.ctx.fs;
    }
}
function isValid(config) {
    const diagnostics = [];
    try {
        // validate the build config
        config = validateConfig(config, diagnostics, true);
    }
    catch (e) {
        catchError(diagnostics, e, e.message);
    }
    if (config.logger != null) {
        diagnostics.forEach(d => {
            d.type = 'config';
            d.header = 'configuration';
            d.absFilePath = config.configPath;
        });
        config.logger.printDiagnostics(diagnostics);
    }
    else {
        diagnostics.forEach(d => {
            if (d.level === 'error') {
                throw new Error(d.messageText);
            }
            else {
                console.info(d.messageText);
            }
        });
    }
    if (hasError(diagnostics)) {
        return [false, null];
    }
    else {
        return [true, config];
    }
}

exports.BuildContext = BuildContext;
exports.COMPILER_BUILD = COMPILER_BUILD;
exports.Cache = Cache;
exports.Compiler = Compiler;
exports.formatComponentRuntimeMeta = formatComponentRuntimeMeta;
exports.formatLazyBundleRuntimeMeta = formatLazyBundleRuntimeMeta;
exports.getBuildFeatures = getBuildFeatures;
exports.transpileModule = transpileModule;
exports.validateConfig = validateConfig;
