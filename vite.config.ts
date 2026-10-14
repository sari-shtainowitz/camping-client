import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API is a separate project (../Camping.API) and is NOT part of the .NET
// solution's concerns here. In dev, Vite proxies every /api request to it, so the
// browser stays same-origin and the server needs no CORS configuration.
//
// The default target is the API's HTTPS launch URL from
// Camping.API/Properties/launchSettings.json ("https://localhost:7195"), which is
// where `dotnet run --project Camping.API` listens. `secure: false` accepts the
// local ASP.NET dev certificate. Point it elsewhere with VITE_API_PROXY_TARGET
// (e.g. http://localhost:5199 if you started the API with ASPNETCORE_URLS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'https://localhost:7195',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
