// Backend .env commonly contains NODE_ENV=development. Never let that select
// React's development bundle for a deployment build (Vite also reads .env).
process.env.NODE_ENV = 'production'
const { build } = await import('vite')
await build()
