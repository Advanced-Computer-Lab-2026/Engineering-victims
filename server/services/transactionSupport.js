const mongoose = require('mongoose');

/**
 * Req 48: whether the connected deployment can run multi-document
 * transactions. Only replica-set members and mongos routers can; a
 * standalone server (the default local install) cannot. Asked of the server
 * each time rather than cached, so a configuration change is picked up
 * without a restart.
 */
const supportsTransactions = async (connection = mongoose.connection) => {
  const hello = await connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName) || hello.msg === 'isdbgrid';
};

/** The server's own refusal to start a transaction (e.g. on a standalone). */
const isTransactionUnsupportedError = (error) =>
  error?.code === 20 || /Transaction numbers are only allowed/i.test(String(error?.message ?? ''));

module.exports = { supportsTransactions, isTransactionUnsupportedError };
