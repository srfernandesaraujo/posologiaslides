// Config do pm2, versionada — permite recriar o processo do backend de forma
// idêntica numa máquina nova com um único comando (`pm2 start ecosystem.config.cjs`)
// em vez de depender de lembrar os flags usados na primeira vez.
// Extensão .cjs (não .js) porque server/package.json tem "type": "module" —
// pm2 lê ecosystem files em CommonJS (module.exports), então precisa fugir
// da interpretação como ESM que o "type": "module" forçaria num .js comum.
module.exports = {
  apps: [
    {
      name: 'posologia-backend',
      script: 'index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
