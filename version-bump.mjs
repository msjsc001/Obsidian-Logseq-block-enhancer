import fs from 'fs';
import path from 'path';

// Read package.json to get the new version
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const newVersion = packageJson.version;

// Update manifest.json
const manifestPath = path.resolve(process.cwd(), 'manifest.json');
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifestJson.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, '\t'));

// Update versions.json
const versionsPath = path.resolve(process.cwd(), 'versions.json');
const versionsJson = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
versionsJson[newVersion] = manifestJson.minAppVersion;
fs.writeFileSync(versionsPath, JSON.stringify(versionsJson, null, '\t'));

console.log(`Version bumped to ${newVersion}`);