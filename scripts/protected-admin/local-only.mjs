// Preloaded before the disposable server imports any application modules.
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0] : args;
  const first = options[0];
  const host = typeof first === 'object' ? first.host : options[1];
  const path = typeof first === 'object' && first.path;
  if (path || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Protected admin fixture blocked non-loopback connection');
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();
