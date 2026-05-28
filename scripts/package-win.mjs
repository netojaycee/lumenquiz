/**
 * Full Windows packaging pipeline:
 *  1. Build all workspace packages + apps
 *  2. Copy frontend static export → backend/public
 *  3. pnpm deploy backend → release/backend (self-contained with node_modules)
 *  4. Copy public into the deployed backend
 *  5. Run electron-builder → dist-electron/
 */

import { execSync } from 'child_process'
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// node.exe is the same binary that is currently running this script.
// We copy it into release/ so electron-builder can pick it up as an extraResource.
// This makes the packaged app self-contained — no Node.js installation required
// on the host PC.
const nodeExeSrc = process.execPath
const nodeExeDest = join(root, 'release/node.exe')
mkdirSync(join(root, 'release'), { recursive: true })
cpSync(nodeExeSrc, nodeExeDest)
console.log(`✔ Bundled node.exe: ${nodeExeSrc} → ${nodeExeDest}`)

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
}

// 1. Build everything (ELECTRON_BUILD=1 enables static export in next.config.ts)
run('pnpm turbo run build', { env: { ...process.env, ELECTRON_BUILD: '1' } })

// 2. Copy frontend static export into backend/public
const frontendOut = join(root, 'apps/frontend/out')
const backendPublic = join(root, 'apps/backend/public')
if (!existsSync(frontendOut)) {
  throw new Error('Frontend out/ directory not found — did the build succeed?')
}
if (existsSync(backendPublic)) rmSync(backendPublic, { recursive: true })
cpSync(frontendOut, backendPublic, { recursive: true })
console.log('✔ Frontend copied to apps/backend/public')

// 3. Deploy backend to release/backend (creates self-contained dir with node_modules)
const releaseBackend = join(root, 'release/backend')
if (existsSync(releaseBackend)) rmSync(releaseBackend, { recursive: true })
mkdirSync(join(root, 'release'), { recursive: true })
run(`pnpm --filter @apoquiz/backend deploy "${releaseBackend}"`)
console.log('✔ Backend deployed to release/backend')

// 4a. Regenerate Prisma client inside the deployed directory.
//     pnpm deploy copies from the CAS which does NOT include the locally-generated
//     .prisma/client artifacts — we must run prisma generate here.
const prismaBin = join(
  releaseBackend,
  'node_modules/.bin',
  process.platform === 'win32' ? 'prisma.CMD' : 'prisma',
)
run(`"${prismaBin}" generate --schema prisma/schema.prisma`, {
  cwd: releaseBackend,
  env: { ...process.env, DATABASE_URL: 'file:./dummy.db' },
})
console.log('✔ Prisma client generated in deployed backend')

// 4b. The public dir was in apps/backend at deploy time — pnpm deploy copies it.
//     Double-check and copy again if missing (deploy respects package.json "files").
const deployedPublic = join(releaseBackend, 'public')
if (!existsSync(deployedPublic)) {
  cpSync(backendPublic, deployedPublic, { recursive: true })
  console.log('✔ Public dir copied into deployed backend')
}

// 5. Package with electron-builder (WIN_CSC_LINK='' disables code signing → no winCodeSign download)
run('pnpm --filter @apoquiz/desktop package:win', {
  env: { ...process.env, WIN_CSC_LINK: '', CSC_LINK: '' },
})
console.log('\n✅ Windows build ready — run the app from:')
console.log('   apps/desktop/dist-electron/win-unpacked/Apoquiz.exe')
