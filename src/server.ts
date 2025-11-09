import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import parseRoute from './routes/parse';
import cors from '@fastify/cors';

const server = Fastify({ logger: true });

server.register(cors, {
  origin: true // or 'http://localhost:5173'
});

server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // ✅ Allow up to 10MB
  }
});

server.register(parseRoute, { prefix: '/api/v1' });

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    server.log.info('Server listening on 3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start(); // ✅ Now all plugins are registered before this