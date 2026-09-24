import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Identificador do build (muda a cada deploy). O app compara com
// /version.json para saber se está rodando uma versão antiga — aba aberta
// há dias continua com o código de quando foi carregada (achado em
// 2026-09-23: foto tirada numa aba antiga saiu sem código de verificação).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36)

function versaoDoBuild(): Plugin {
  return {
    name: 'atos-versao-do-build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), versaoDoBuild()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
