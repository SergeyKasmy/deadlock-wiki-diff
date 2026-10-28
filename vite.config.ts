import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // relative asset paths, so the build works from any directory it is hosted in
  base: './',
});
