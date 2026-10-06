import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Reuses application dependency installation; output stays in this submission.
const directory=path.dirname(fileURLToPath(import.meta.url))
const applicationRoot=process.env.SCENRA_DEPENDENCY_ROOT||path.resolve(directory,'..')
const require=createRequire(path.join(applicationRoot,'package.json'))
const { build }=require('esbuild')
await build({
  entryPoints:[path.join(directory,'visuals.mjs')],
  outfile:path.join(directory,'visuals.js'),
  bundle:true,minify:true,format:'iife',target:'es2020',
  nodePaths:[path.join(applicationRoot,'node_modules')],
  logLevel:'info',
})
