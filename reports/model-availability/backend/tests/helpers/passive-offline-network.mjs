import net from 'node:net';
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof value === 'object' ? value : { port: value, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const host = options?.hostname || options?.host || 'localhost';
  const port = Number(options?.port);
  if (!options?.path && (!['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host) || [7890, 7891, 7892, 20127, 20128, 20129].includes(port))) {
    queueMicrotask(() => this.destroy(new Error('Offline regression blocked network connection')));
    return this;
  }
  return connect.apply(this, args);
};
