#!/usr/bin/env node

const { join } = require('path');
const { existsSync } = require('fs');
const argv = process.argv.slice(2);
const [name, ...throughArgs] = argv;
const scriptsPath = join(__dirname, `../${name}.ts`);

const { sync } = require('cross-spawn');

const spawn = sync(
    'tsx',
    [scriptsPath, ...throughArgs],
    {
        env: process.env,
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true
    }
)
if (spawn.status !== 0) {
    console.log((`uma-scripts: ${name} execute fail`))
    process.exit(1)
}