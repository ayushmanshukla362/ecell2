import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'
import { loadConfig } from '../backend/config.js'

const config = loadConfig()
if (config.mediaProvider !== 'neon-object-storage') throw new Error('Set MEDIA_PROVIDER=neon-object-storage before configuring Neon Object Storage.')
const storage = config.storage
if (Object.values(storage).some((value) => !value)) throw new Error('Set the Neon Object Storage AWS_* variables and NEON_STORAGE_BUCKET first.')

const client = new S3Client({
  region: storage.region,
  endpoint: storage.endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
})
await client.send(new PutBucketCorsCommand({
  Bucket: storage.bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: [config.origin],
      AllowedMethods: ['PUT', 'HEAD'],
      AllowedHeaders: ['content-type', 'x-amz-*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 600,
    }],
  },
}))
console.log(`Configured private-bucket CORS for ${config.origin}. Credentials and endpoint were not printed.`)
