// dependencies
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs-extra')
const path = require('path');
const zlib = require('zlib')
const { pipeline } = require('stream');
const { promisify } = require('util');
const { exit } = require("process");

// env
require('dotenv').config();
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.CF_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.CF_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_LOG_BASE_PREFIX = process.env.R2_LOG_BASE_PREFIX || ""; 

// pipeline 
const pipe = promisify(pipeline);

// download path
const DOWNLOAD_DIR = "logs";

async function getR2Client() {
    if (!ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
        throw new Error(
            "Missing R2 environment variables. Please set CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, " +
            "CF_R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
        );
    }

    const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

    const s3Client = new S3Client({
        endpoint: endpoint,
        region: "auto", 
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
    return s3Client;
}

async function listR2Objects(s3Client, bucketName, prefix = "") {
    console.log(`\n--- Listing objects in bucket: '${bucketName}' with prefix: '${prefix}' ---`);
    let allObjects = [];
    let isTruncated = true;
    let continuationToken;

    try {
        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });
            const { Contents, IsTruncated, NextContinuationToken } = await s3Client.send(command);

            if (Contents) {
                Contents.forEach(obj => {
                    allObjects.push(obj.Key);
                });
            }
            isTruncated = IsTruncated;
            continuationToken = NextContinuationToken;
        }
        console.log(`Total objects found: ${allObjects.length}`);
        const lastTenObjects = allObjects.slice(-10);
        console.log(`Last 10 objects:`);
        lastTenObjects.forEach(key => console.log(`  - ${key}`));
        return allObjects;
    } catch (err) {
        console.error("Error listing objects:", err);
        return [];
    }
}

async function processLogFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const logEntries = content.split('\n').filter(line => line.trim() !== '');

        console.log(`--- Processing log file: '${filePath}' ---`);

        for (const line of logEntries) {
            try {
                const logEntry = JSON.parse(line);

                // print ScriptName
                if (logEntry.ScriptName) {
                    console.log(`    ScriptName: ${logEntry.ScriptName}`);
                } else {
                    console.log(`    ScriptName: None`);
                }

                // print Logs
                if (logEntry.Logs && logEntry.Logs.length > 0) {
                    logEntry.Logs.forEach((log, index) => {
                        if (log.Message) {
                            console.log(`    Log Message ${index + 1}: ${log.Message}`);
                        }
                    });
                } else {
                    console.log(`    Log Messages: None`);
                }
            } catch (parseError) {
                console.error(`    Error parsing line in '${filePath}':`, parseError.message);
            }
        }
    } catch (error) {
        console.error(`Error reading log file '${filePath}':`, error);
    }
}

async function downloadAndDecompressFile(s3Client, bucketName, objectKey, localBasePath) {
    try {
        let localFileName = path.basename(objectKey);
        if (localFileName.endsWith('.gz')) {
            localFileName = localFileName.slice(0, -3);
        }
        const localFilePath = path.join(localBasePath, localFileName);
        await fs.ensureDir(path.dirname(localFilePath));

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
        });

        const response = await s3Client.send(command);
        if (response.Body) {
            const fileWriteStream = fs.createWriteStream(localFilePath);
            const isGzip = response.ContentType === 'application/gzip' || objectKey.endsWith('.gz');

            if (isGzip) {
                await pipe(response.Body, zlib.createGunzip(), fileWriteStream);
            } else {
                await pipe(response.Body, fileWriteStream);
            }

            await processLogFile(localFilePath);
            return true;
        } else {
            console.error(`Error: No body found for object '${objectKey}'`);
            return false;
        }
    } catch (err) {
        console.error(`Error downloading/decompressing '${objectKey}':`, err);
        return false;
    }
}

async function main() {
    try {
        // CLI argument
        const args = {};
        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg === '--help') {
                console.log("Usage: node download_r2_logs.js --start-date \"YYYY-MM-DD HH:MM:SS\" --end-date \"YYYY-MM-DD HH:MM:SS\"");
                console.log("Example: node download_r2_logs.js --start-date \"2025-06-27 11:00:00\" --end-date \"2025-06-27 12:00:00\"");
                process.exit(0);
            }
            if (arg.startsWith('--')) {
                const [key, value] = arg.substring(2).split('=');
                args[key.replace(/-/g, '')] = value || process.argv[++i]; 
            }
        }

        // start & end datetime
        const startDateString = args.startdate;
        const endDateString = args.enddate;
        if (!startDateString || !endDateString) {
            console.error("Usage: node download_r2_logs.js --start-date \"YYYY-MM-DD HH:MM:SS\" --end-date \"YYYY-MM-DD HH:MM:SS\"");
            console.error("Example: node download_r2_logs.js --start-date \"2025-06-27 11:00:00\" --end-date \"2025-06-27 12:00:00\"");
            process.exit(1);
        }
        const inputStartDate = new Date(startDateString);
        const inputEndDate = new Date(endDateString);
        if (isNaN(inputStartDate.getTime()) || isNaN(inputEndDate.getTime())) {
            console.error("Error: Invalid date format. Please use \"YYYY-MM-DD HH:MM:SS\".");
            process.exit(1);
        }
        console.log(`\n--- Listing R2 Logpush files from ${inputStartDate.toISOString()} to ${inputEndDate.toISOString()} (adjusted to SGT) ---`);

        // s3 client
        const s3 = await getR2Client();

        // delete all existing files
        await fs.emptyDir(DOWNLOAD_DIR);
        console.log(`\n--- Cleared existing logs from: ${DOWNLOAD_DIR} ---`);
        
        // reset
        let allKeysDownloaded = [];
        let currentDay = new Date(inputStartDate);
        currentDay.setUTCHours(0, 0, 0, 0); 

        // looping days
        while (currentDay.getTime() <= inputEndDate.getTime()) {
            const year = currentDay.getUTCFullYear();
            const month = String(currentDay.getUTCMonth() + 1).padStart(2, '0');
            const day = String(currentDay.getUTCDate()).padStart(2, '0');
            const dailyFolderPrefix = `${year}${month}${day}/`;
            const fullLogPrefix = path.join(R2_LOG_BASE_PREFIX, dailyFolderPrefix);

            // search for files based on days
            console.log(`  Searching for logs in daily prefix: ${fullLogPrefix}`);
            const keysForDay = await listR2Objects(s3, R2_BUCKET_NAME, fullLogPrefix);

            // files by hour
            const filteredKeysForDay = keysForDay.filter(key => {
                const filename = path.basename(key);
                const match = filename.match(/(\d{8}T\d{6}Z)_/); 
                if (match && match[1]) {
                    const timestampStr = match[1];
                    const year = parseInt(timestampStr.substring(0, 4));
                    const month = parseInt(timestampStr.substring(4, 6)) - 1; 
                    const day = parseInt(timestampStr.substring(6, 8));
                    const hour = parseInt(timestampStr.substring(9, 11));
                    const minute = parseInt(timestampStr.substring(11, 13));
                    const second = parseInt(timestampStr.substring(13, 15));
                    const fileDateFromKey = new Date(Date.UTC(year, month, day, hour, minute, second));
                    return fileDateFromKey.getTime() >= inputStartDate.getTime() && fileDateFromKey.getTime() <= inputEndDate.getTime();
                }
                return false;
            });
            allKeysDownloaded = allKeysDownloaded.concat(filteredKeysForDay);

            // Move to the next day
            currentDay.setUTCDate(currentDay.getUTCDate() + 1);
            currentDay.setUTCHours(0, 0, 0, 0); 
        }
        
        // download
        if (allKeysDownloaded.length > 0) {
            console.log(`\n--- Downloading ${allKeysDownloaded.length} log files ---`);
            for (const key of allKeysDownloaded) {
                const relativePathInR2 = key.startsWith(R2_LOG_BASE_PREFIX) ? key.substring(R2_LOG_BASE_PREFIX.length) : key;
                const localFileSubDir = path.dirname(relativePathInR2);
                const localDownloadPathForFile = path.join(DOWNLOAD_DIR, localFileSubDir);
                await downloadAndDecompressFile(s3, R2_BUCKET_NAME, key, localDownloadPathForFile);
            }
            console.log("\nAll specified log files downloaded and processed.");
        } else {
            console.log("No log files found for the specified date/time range in the R2 bucket with the specified prefix.");
        }

    } catch (error) {
        console.error("\nAn error occurred during execution:", error);
        process.exit(1); 
    }
}

main();