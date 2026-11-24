const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
  name: { type: String, required: true },
  entityId: { type: String, required: true },
  occurrence: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, required: true },
});
