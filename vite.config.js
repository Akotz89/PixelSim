module.exports = {
  root: ".",
  publicDir: false,
  server: {
    port: 3000,
    strictPort: false,
    allowedHosts: [
      "homepc.tail437cf6.ts.net"
    ]
  },
  preview: {
    port: 4173,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
};
