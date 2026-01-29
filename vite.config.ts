import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    plugins: [
        vue(),
        wasm(),
        topLevelAwait(),
        viteStaticCopy({
            targets: [
                { src: 'node_modules/@nimiq/identicons/dist/identicons.min.svg', dest: 'img', rename: 'iqons.min.svg' },
                { src: 'node_modules/@nimiq/browser-warning/dist/*', dest: './' },
            ],
        }),
    ],
    base: '/vote/',
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    optimizeDeps: {
        exclude: ['@nimiq/core'],
    },
    build: {
        target: 'esnext',
    },
});
