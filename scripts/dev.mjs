import { createServer } from 'node:net'
import { concurrently } from 'concurrently'

async function portIsAvailable(port) {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    })
    server.listen(port, () => server.close((error) => error ? reject(error) : resolve(true)))
  })
}

async function findPort(start = 5173) {
  for (let port = start; port <= 65535; port += 1) {
    if (await portIsAvailable(port)) return port
  }
  throw new Error('No available local Vite port was found.')
}

const port = await findPort()
const origin = `http://localhost:${port}`
const env = { APP_ORIGIN: origin, VITE_PORT: String(port) }
console.log(`Starting E-Cell on ${origin}`)

const { result } = concurrently(
  [
    { command: 'npm run server', name: 'server', env },
    { command: 'npm run client', name: 'client', env },
  ],
  {
    killOthersOn: ['failure', 'success'],
  },
)

try {
  await result
} catch {
  process.exitCode = 1
}
