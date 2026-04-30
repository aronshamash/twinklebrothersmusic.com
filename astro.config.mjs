import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://twinklebrothersmusic.com',
  output: 'server',
  integrations: [sitemap({
    filter: (page) => !page.includes('/admin/'),
  })],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare({ platformProxy: { enabled: true } }),
});
