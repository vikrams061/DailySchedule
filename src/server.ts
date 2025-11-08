import Fastify from 'fastify';
import multipart from 'fastify-multipart';
import parseRoute from './routes/parse';

const server = Fastify({ logger: true });

server.register(multipart);
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

start();
