import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
    define: {
      // Safely expose API_KEY. 
      // Note: On Netlify, make sure to add API_KEY in Site Settings > Environment Variables
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    }
  }
})