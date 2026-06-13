import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.jsx'),
            name: 'ReactGUI',
            fileName: 'react-gui.bundle',
            formats: ['iife'], // 适用于直接嵌入到 Electron 渲染进程
        },
        outDir: '../src/dist',
        emptyOutDir: true,
        rollupOptions: {
            // 保留 electron 外部依赖
            external: ['electron'],
            output: {
                // 确保全局变量名称与 webpack 配置一致
                globals: {
                    electron: 'electron',
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
        extensions: ['.js', '.jsx', '.json'],
    },
    css: {
        // 处理 CSS
    },
});