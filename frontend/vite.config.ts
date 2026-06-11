import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [svelte()],
  // Project Pages site is served from /MapColombia/; keep dev at root so
  // smoke.mjs / probe-fps.mjs (Playwright against :5199) are unaffected.
  base: command === 'build' ? '/MapColombia/' : '/',
}))
