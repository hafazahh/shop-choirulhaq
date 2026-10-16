import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://shop.choirulhaq.com',
  devToolbar: {
    enabled: false,
  },
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
